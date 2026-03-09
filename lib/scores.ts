// In-memory leaderboard — used when POSTGRES_URL is not set
const memScores = new Map<string, { best_score: number; games_played: number }>();

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

export async function upsertScore(shieldedAddress: string, score: number): Promise<void> {
  if (hasDb()) {
    await ensureSchema();
    await dbQuery(`
      INSERT INTO scores (shielded_address, best_score, games_played)
      VALUES ($1, $2, 1)
      ON CONFLICT (shielded_address) DO UPDATE SET
        best_score = GREATEST(scores.best_score, EXCLUDED.best_score),
        games_played = scores.games_played + 1,
        updated_at = NOW()
    `, [shieldedAddress, score]);
  } else {
    const existing = memScores.get(shieldedAddress);
    memScores.set(shieldedAddress, {
      best_score: existing ? Math.max(existing.best_score, score) : score,
      games_played: existing ? existing.games_played + 1 : 1,
    });
  }
}

export async function getLeaderboard(): Promise<Array<{
  shielded_address: string;
  best_score: number;
  games_played: number;
}>> {
  if (hasDb()) {
    await ensureSchema();
    const result = await dbQuery(`
      SELECT shielded_address, best_score, games_played
      FROM scores ORDER BY best_score DESC LIMIT 10
    `);
    return result.rows as Array<{ shielded_address: string; best_score: number; games_played: number }>;
  } else {
    return [...memScores.entries()]
      .map(([shielded_address, v]) => ({ shielded_address, ...v }))
      .sort((a, b) => b.best_score - a.best_score)
      .slice(0, 10);
  }
}
