import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
// The 32-character roster lives in lib/roster.js — the single source of truth
// shared with the client (game/constants.js). Do not duplicate it here.
import { ALL_CHARACTERS } from './roster.js';

export type Character = {
  id: number;
  name: string;
  bucket: string;
  sex: string;
  rank: string;
  role: string;
  headwear: string;
  hairShape: string;
  facialHair: string;
  eyewear: string;
  marker: string;
};

function sample<T>(array: T[], n: number): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function isRareMarker(m: string): boolean {
  return ['eyepatch', 'pipe', 'medal', 'badge', 'ar_unit', 'scope'].includes(m);
}

function validateBoard(board: typeof ALL_CHARACTERS): boolean {
  const female  = board.filter(c => c.sex === 'F').length;
  const helmet  = board.filter(c => c.headwear === 'helmet').length;
  const hood    = board.filter(c => c.headwear === 'hood').length;
  const eyewear = board.filter(c => c.eyewear !== 'none').length;
  const facial  = board.filter(c => c.facialHair !== 'none').length;
  const rare    = board.filter(c => isRareMarker(c.marker)).length;
  return (
    female  >= 5 && female  <= 8 &&
    helmet  >= 3 && helmet  <= 6 &&
    hood    >= 2 && hood    <= 5 &&
    eyewear >= 5 && eyewear <= 8 &&
    facial  >= 4 && facial  <= 8 &&
    rare    >= 2
  );
}

function generateBoard(): Character[] {
  const buckets: Record<string, typeof ALL_CHARACTERS> = { A: [], B: [], C: [], D: [] };
  for (const c of ALL_CHARACTERS) buckets[c.bucket].push(c);

  for (let tries = 0; tries < 200; tries++) {
    const board = [
      ...sample(buckets.A, 4),
      ...sample(buckets.B, 4),
      ...sample(buckets.C, 4),
      ...sample(buckets.D, 4),
    ];
    if (validateBoard(board)) {
      return sample(board, 16).map((c, i) => ({ ...c, id: i })) as Character[];
    }
  }
  throw new Error('Could not generate valid board after 200 tries');
}

// In-memory session store — used when POSTGRES_URL is not set
const memSessions = new Map<string, { spy_id: number; characters: Character[]; salt: string; expires: number }>();

// Prune expired in-memory sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of memSessions.entries()) {
    if (s.expires < now) memSessions.delete(id);
  }
}, 5 * 60 * 1000).unref();

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

export async function createSession(spyId?: number, salt?: string): Promise<{ sessionId: string; characters: Character[]; spyId: number; salt: string }> {
  const sessionId = uuidv4();
  const characters = generateBoard();
  const resolvedSpyId = spyId ?? Math.floor(Math.random() * characters.length);
  const resolvedSalt = salt ?? randomBytes(32).toString('hex');

  if (hasDb()) {
    await ensureSchema();
    await dbQuery(
      'INSERT INTO sessions (id, spy_id, salt, characters) VALUES ($1, $2, $3, $4)',
      [sessionId, resolvedSpyId, resolvedSalt, JSON.stringify(characters)]
    );
  } else {
    memSessions.set(sessionId, { spy_id: resolvedSpyId, characters, salt: resolvedSalt, expires: Date.now() + 30 * 60 * 1000 });
  }

  return { sessionId, characters, spyId: resolvedSpyId, salt: resolvedSalt };
}

async function getSession(sessionId: string): Promise<{ spy_id: number; characters: Character[]; salt: string } | null> {
  if (hasDb()) {
    const result = await dbQuery(
      'SELECT spy_id, salt, characters FROM sessions WHERE id = $1 AND expires_at > NOW()',
      [sessionId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as { spy_id: number; characters: Character[]; salt?: string };
    return { spy_id: row.spy_id, characters: row.characters, salt: row.salt ?? '' };
  }
  const s = memSessions.get(sessionId);
  if (!s || s.expires < Date.now()) return null;
  return { spy_id: s.spy_id, characters: s.characters, salt: s.salt };
}

export async function answerQuestion(
  sessionId: string,
  category: string,
  value: string
): Promise<'YES' | 'NO' | null> {
  const session = await getSession(sessionId);
  if (!session) {
    console.error(`[answerQuestion] session not found: ${sessionId}`);
    return null;
  }

  const spy = session.characters[session.spy_id];
  const cat = category.toLowerCase();

  // Map category key to Character property
  const propMap: Record<string, keyof Character> = {
    sex: 'sex',
    headwear: 'headwear',
    hair: 'hairShape',
    hairshape: 'hairShape',
    facial_hair: 'facialHair',
    facialhair: 'facialHair',
    eyewear: 'eyewear',
    marker: 'marker',
  };

  const prop = propMap[cat];
  if (!prop) return null;

  return String(spy[prop]).toLowerCase() === value.toLowerCase() ? 'YES' : 'NO';
}

/** Remove a session so it can no longer be questioned or re-declared. */
export async function deleteSession(sessionId: string): Promise<void> {
  if (hasDb()) {
    await ensureSchema();
    await dbQuery('DELETE FROM sessions WHERE id = $1', [sessionId]);
  } else {
    memSessions.delete(sessionId);
  }
}

export async function evaluateGuess(
  sessionId: string,
  guessId: number
): Promise<{ correct: boolean; spy: Character; session: { spy_id: number; salt: string } } | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const spy = session.characters[session.spy_id];
  return {
    correct: spy.id === guessId,
    spy,
    session: { spy_id: session.spy_id, salt: session.salt },
  };
}
