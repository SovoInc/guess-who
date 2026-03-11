export type PoolEntry = {
  gameId: bigint;
  culpritId: number;
  salt: string;
  contractAddress: string;
};

// In-memory fallback for when POSTGRES_URL is not set
const memPool: PoolEntry[] = [];

function hasDb() {
  return !!process.env.POSTGRES_URL;
}

async function dbQuery(text: string, params?: unknown[]) {
  const { query } = await import('./db.js');
  return query(text, params);
}

async function ensureSchema() {
  const { initSchema } = await import('./db.js');
  await initSchema();
}

export async function addToPool(entry: PoolEntry): Promise<void> {
  if (hasDb()) {
    await ensureSchema();
    await dbQuery(
      'INSERT INTO game_pool (game_id, culprit_id, salt, contract_address) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [entry.gameId.toString(), entry.culpritId, entry.salt, entry.contractAddress]
    );
  } else {
    memPool.push(entry);
  }
}

export async function claimPoolEntry(): Promise<PoolEntry | null> {
  if (hasDb()) {
    await ensureSchema();
    const result = await dbQuery(
      `DELETE FROM game_pool WHERE id = (SELECT id FROM game_pool ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as { game_id: string; culprit_id: number; salt: string; contract_address: string };
    return {
      gameId: BigInt(row.game_id),
      culpritId: row.culprit_id,
      salt: row.salt,
      contractAddress: row.contract_address,
    };
  } else {
    return memPool.shift() ?? null;
  }
}

export async function getPoolSize(): Promise<number> {
  if (hasDb()) {
    await ensureSchema();
    const result = await dbQuery('SELECT COUNT(*) FROM game_pool');
    return parseInt((result.rows[0] as { count: string }).count, 10);
  } else {
    return memPool.length;
  }
}
