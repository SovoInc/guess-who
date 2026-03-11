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
