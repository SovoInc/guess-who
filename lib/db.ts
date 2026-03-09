import { Pool } from 'pg';

let pool: Pool | null = null;

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
  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY,
      spy_id INTEGER NOT NULL,
      characters JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes'
    )
  `);
  // Migration: add characters column to existing tables
  await query(`
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS characters JSONB
  `).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS scores (
      shielded_address TEXT PRIMARY KEY,
      best_score INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}
