// In-memory leaderboard — used when POSTGRES_URL is not set
const memScores: Array<{
  session_id: string;
  shielded_address: string;
  score: number;
  questions_used: number;
  time_elapsed: number;
  correct: boolean;
  created_at: number;
}> = [];

function hasDb() {
  return !!process.env.POSTGRES_URL;
}

async function dbQuery(text: string, params?: unknown[]) {
  const { query } = await import('./db');
  return query(text, params);
}

async function ensureSchema() {
  const { initSchema } = await import('./db');
  await initSchema();
}

export type GameScore = {
  session_id: string;
  shielded_address: string;
  score: number;
  questions_used: number;
  time_elapsed: number;
  correct: boolean;
};

export async function recordGameScore(entry: GameScore): Promise<void> {
  if (hasDb()) {
    await ensureSchema();
    await dbQuery(`
      INSERT INTO game_scores (session_id, shielded_address, score, questions_used, time_elapsed, correct)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (session_id) DO UPDATE SET
        score = EXCLUDED.score,
        questions_used = EXCLUDED.questions_used,
        time_elapsed = EXCLUDED.time_elapsed,
        correct = EXCLUDED.correct,
        shielded_address = EXCLUDED.shielded_address
    `, [entry.session_id, entry.shielded_address, entry.score, entry.questions_used, entry.time_elapsed, entry.correct]);
  } else {
    const idx = memScores.findIndex(s => s.session_id === entry.session_id);
    const record = { ...entry, created_at: Date.now() };
    if (idx >= 0) memScores[idx] = record;
    else memScores.push(record);
  }
}

// In-memory player stats fallback
const memStats = new Map<string, { spies_caught: number; games_played: number }>();

export async function recordGameResult(shieldedAddress: string, correct: boolean): Promise<void> {
  if (!shieldedAddress) return;
  if (hasDb()) {
    await ensureSchema();
    await dbQuery(`
      INSERT INTO player_stats (shielded_address, spies_caught, games_played, updated_at)
      VALUES ($1, $2, 1, NOW())
      ON CONFLICT (shielded_address) DO UPDATE SET
        spies_caught = player_stats.spies_caught + $2,
        games_played = player_stats.games_played + 1,
        updated_at = NOW()
    `, [shieldedAddress, correct ? 1 : 0]);
  } else {
    const cur = memStats.get(shieldedAddress) || { spies_caught: 0, games_played: 0 };
    memStats.set(shieldedAddress, {
      spies_caught: cur.spies_caught + (correct ? 1 : 0),
      games_played: cur.games_played + 1,
    });
  }
}

export async function getPlayerStats(shieldedAddress: string): Promise<{ spies_caught: number; games_played: number } | null> {
  if (!shieldedAddress) return null;
  if (hasDb()) {
    await ensureSchema();
    const result = await dbQuery(
      `SELECT spies_caught, games_played FROM player_stats WHERE shielded_address = $1`,
      [shieldedAddress],
    );
    if (result.rows.length === 0) return { spies_caught: 0, games_played: 0 };
    return result.rows[0] as { spies_caught: number; games_played: number };
  } else {
    return memStats.get(shieldedAddress) || { spies_caught: 0, games_played: 0 };
  }
}

export async function getAllPlayerStats(): Promise<Array<{
  shielded_address: string;
  spies_caught: number;
  games_played: number;
  updated_at: string;
}>> {
  if (hasDb()) {
    await ensureSchema();
    const result = await dbQuery(
      `SELECT shielded_address, spies_caught, games_played, updated_at FROM player_stats ORDER BY spies_caught DESC`,
    );
    return result.rows as Array<{ shielded_address: string; spies_caught: number; games_played: number; updated_at: string }>;
  } else {
    return [...memStats.entries()].map(([shielded_address, s]) => ({
      shielded_address,
      ...s,
      updated_at: new Date().toISOString(),
    }));
  }
}

export async function getLeaderboard(): Promise<Array<{
  shielded_address: string;
  score: number;
  questions_used: number;
  time_elapsed: number;
  correct: boolean;
  created_at: string;
}>> {
  if (hasDb()) {
    await ensureSchema();
    const result = await dbQuery(`
      SELECT shielded_address, score, questions_used, time_elapsed, correct, created_at
      FROM game_scores
      WHERE correct = true
      ORDER BY score DESC, questions_used ASC
      LIMIT 20
    `);
    return result.rows as Array<{
      shielded_address: string;
      score: number;
      questions_used: number;
      time_elapsed: number;
      correct: boolean;
      created_at: string;
    }>;
  } else {
    return memScores
      .filter(s => s.correct)
      .sort((a, b) => b.score - a.score || a.questions_used - b.questions_used)
      .slice(0, 20)
      .map(s => ({ ...s, created_at: new Date(s.created_at).toISOString() }));
  }
}
