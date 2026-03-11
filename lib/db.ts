import { Pool } from 'pg';

let pool: Pool | null = null;
let schemaInitialized = false;
let schemaInitPromise: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
    });
  }
  return pool;
}

export async function query(text: string, params?: unknown[]) {
  const client = getPool();
  return client.query(text, params);
}

export async function initSchema() {
  if (schemaInitialized) return;
  if (schemaInitPromise) return schemaInitPromise;
  schemaInitPromise = _initSchema().then(() => { schemaInitialized = true; });
  return schemaInitPromise;
}

async function _initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY,
      spy_id INTEGER NOT NULL,
      salt TEXT NOT NULL DEFAULT '',
      characters JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes'
    )
  `);
  // Migrations
  await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS characters JSONB`).catch(() => {});
  await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS salt TEXT NOT NULL DEFAULT ''`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS game_scores (
      session_id UUID PRIMARY KEY,
      shielded_address TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      questions_used INTEGER NOT NULL DEFAULT 0,
      time_elapsed INTEGER NOT NULL DEFAULT 0,
      correct BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS game_scores_address_idx ON game_scores (shielded_address)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS game_scores_score_idx ON game_scores (score DESC)`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS game_pool (
      id SERIAL PRIMARY KEY,
      game_id BIGINT NOT NULL UNIQUE,
      culprit_id INTEGER NOT NULL,
      salt TEXT NOT NULL,
      contract_address TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}
