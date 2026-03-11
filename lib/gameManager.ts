import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';

const CODENAMES = [
  'GHOST', 'VIPER', 'JACKAL', 'WRAITH', 'CIPHER', 'RAVEN', 'SPECTER', 'LYNX',
  'COBRA', 'ORACLE', 'TITAN', 'MIRAGE', 'DAGGER', 'PHANTOM', 'BISHOP', 'NOVA',
];

const RANKS     = ['COLONEL', 'COLONEL', 'MAJOR', 'MAJOR', 'MAJOR', 'CAPTAIN', 'CAPTAIN', 'LT', 'LT', 'LT', 'LT', 'SERGEANT', 'SERGEANT', 'SERGEANT', 'SERGEANT', 'SERGEANT'];
const SPECS     = ['INFILTRATION', 'INFILTRATION', 'INFILTRATION', 'SNIPER', 'SNIPER', 'SNIPER', 'DEMOLITIONS', 'DEMOLITIONS', 'DEMOLITIONS', 'INTEL', 'INTEL', 'INTEL', 'COMMS', 'COMMS', 'MEDIC', 'MEDIC'];
const ORIGINS   = ['WESTERN', 'WESTERN', 'WESTERN', 'WESTERN', 'EASTERN', 'EASTERN', 'EASTERN', 'EASTERN', 'SOUTHERN', 'SOUTHERN', 'SOUTHERN', 'SOUTHERN', 'NORTHERN', 'NORTHERN', 'NORTHERN', 'NORTHERN'];
const FEATURES  = ['SCAR', 'SCAR', 'CYBERNETIC_EYE', 'CYBERNETIC_EYE', 'TATTOO', 'TATTOO', 'GLASSES', 'GLASSES', 'BALD', 'BALD', 'HEADSET', 'HEADSET', 'EYE_PATCH', 'EYE_PATCH', 'BEARD', 'BEARD'];


function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type Character = {
  id: number;
  codename: string;
  rank: string;
  specialty: string;
  origin: string;
  feature: string;
};

function generateRoster(): Character[] {
  const ranks    = shuffle(RANKS);
  const specs    = shuffle(SPECS);
  const origins  = shuffle(ORIGINS);
  const features = shuffle(FEATURES);
  return CODENAMES.map((codename, i) => ({
    id: i,
    codename,
    rank:      ranks[i],
    specialty: specs[i],
    origin:    origins[i],
    feature:   features[i],
  }));
}

// In-memory session store — used when POSTGRES_URL is not set
const memSessions = new Map<string, { spy_id: number; characters: Character[]; salt: string; expires: number }>();

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
  const characters = generateRoster();
  const resolvedSpyId = spyId ?? Math.floor(Math.random() * 16);
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
  const cat = category.toLowerCase() as keyof Character;
  if (!['rank', 'specialty', 'origin', 'feature'].includes(cat)) return null;

  return String(spy[cat]).toUpperCase() === value.toUpperCase() ? 'YES' : 'NO';
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
