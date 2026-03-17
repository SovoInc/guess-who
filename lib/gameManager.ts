import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';

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

// ── 32-Character Roster ──────────────────────────────────────────────────────

const ALL_CHARACTERS = [
  { id: 'atlas',    name: 'Atlas',    bucket: 'A', sex: 'M', rank: 'Colonel',    role: 'Heavy Weapons',     headwear: 'helmet', hairShape: 'bald',     facialHair: 'beard',    eyewear: 'none',    marker: 'scar'     },
  { id: 'falcon',   name: 'Falcon',   bucket: 'A', sex: 'M', rank: 'Major',      role: 'Drone Pilot',       headwear: 'helmet', hairShape: 'short',    facialHair: 'beard',    eyewear: 'visor',   marker: 'radio'    },
  { id: 'vega',     name: 'Vega',     bucket: 'A', sex: 'F', rank: 'Captain',    role: 'Drone Ops',         headwear: 'helmet', hairShape: 'long',     facialHair: 'none',     eyewear: 'visor',   marker: 'radio'    },
  { id: 'titan',    name: 'Titan',    bucket: 'A', sex: 'M', rank: 'Major',      role: 'Assault',           headwear: 'helmet', hairShape: 'bald',     facialHair: 'beard',    eyewear: 'none',    marker: 'patch'    },
  { id: 'blaze',    name: 'Blaze',    bucket: 'A', sex: 'M', rank: 'Captain',    role: 'Demolitions',       headwear: 'helmet', hairShape: 'short',    facialHair: 'beard',    eyewear: 'goggles', marker: 'scar'     },
  { id: 'halo',     name: 'Halo',     bucket: 'A', sex: 'F', rank: 'Captain',    role: 'Pilot',             headwear: 'helmet', hairShape: 'ponytail', facialHair: 'none',     eyewear: 'visor',   marker: 'none'     },
  { id: 'razor',    name: 'Razor',    bucket: 'A', sex: 'M', rank: 'Sergeant',   role: 'Breacher',          headwear: 'helmet', hairShape: 'buzz',     facialHair: 'beard',    eyewear: 'none',    marker: 'patch'    },
  { id: 'sentinel', name: 'Sentinel', bucket: 'A', sex: 'M', rank: 'Colonel',    role: 'Security Chief',    headwear: 'helmet', hairShape: 'bald',     facialHair: 'beard',    eyewear: 'glasses', marker: 'badge'    },
  { id: 'viper',    name: 'Viper',    bucket: 'B', sex: 'F', rank: 'Sergeant',   role: 'Recon Analyst',     headwear: 'none',   hairShape: 'ponytail', facialHair: 'none',     eyewear: 'glasses', marker: 'headset'  },
  { id: 'raven',    name: 'Raven',    bucket: 'B', sex: 'F', rank: 'Lieutenant', role: 'Intelligence',      headwear: 'none',   hairShape: 'long',     facialHair: 'none',     eyewear: 'glasses', marker: 'headset'  },
  { id: 'bishop',   name: 'Bishop',   bucket: 'B', sex: 'M', rank: 'Major',      role: 'Signals Officer',   headwear: 'none',   hairShape: 'short',    facialHair: 'mustache', eyewear: 'glasses', marker: 'tablet'   },
  { id: 'echo',     name: 'Echo',     bucket: 'B', sex: 'F', rank: 'Sergeant',   role: 'Recon',             headwear: 'none',   hairShape: 'ponytail', facialHair: 'none',     eyewear: 'glasses', marker: 'none'     },
  { id: 'hydra',    name: 'Hydra',    bucket: 'B', sex: 'F', rank: 'Lieutenant', role: 'Chem Ops',          headwear: 'none',   hairShape: 'long',     facialHair: 'none',     eyewear: 'goggles', marker: 'mask'     },
  { id: 'nova',     name: 'Nova',     bucket: 'B', sex: 'F', rank: 'Major',      role: 'Cyberwarfare',      headwear: 'none',   hairShape: 'short',    facialHair: 'none',     eyewear: 'glasses', marker: 'headset'  },
  { id: 'cipher',   name: 'Cipher',   bucket: 'B', sex: 'F', rank: 'Major',      role: 'Cryptography',      headwear: 'none',   hairShape: 'short',    facialHair: 'none',     eyewear: 'glasses', marker: 'tablet'   },
  { id: 'pulse',    name: 'Pulse',    bucket: 'B', sex: 'F', rank: 'Lieutenant', role: 'Tech Ops',          headwear: 'none',   hairShape: 'short',    facialHair: 'none',     eyewear: 'glasses', marker: 'headset'  },
  { id: 'archer',   name: 'Archer',   bucket: 'C', sex: 'M', rank: 'Lieutenant', role: 'Sniper',            headwear: 'cap',    hairShape: 'buzz',     facialHair: 'none',     eyewear: 'visor',   marker: 'scope'    },
  { id: 'orion',    name: 'Orion',    bucket: 'C', sex: 'M', rank: 'Sergeant',   role: 'Sniper',            headwear: 'cap',    hairShape: 'spiky',    facialHair: 'beard',    eyewear: 'none',    marker: 'scar'     },
  { id: 'kraken',   name: 'Kraken',   bucket: 'C', sex: 'M', rank: 'Colonel',    role: 'Naval Ops',         headwear: 'beret',  hairShape: 'short',    facialHair: 'beard',    eyewear: 'none',    marker: 'pipe'     },
  { id: 'wolf',     name: 'Wolf',     bucket: 'C', sex: 'M', rank: 'Sergeant',   role: 'Tracker',           headwear: 'cap',    hairShape: 'spiky',    facialHair: 'beard',    eyewear: 'none',    marker: 'scarf'    },
  { id: 'talon',    name: 'Talon',    bucket: 'C', sex: 'M', rank: 'Sergeant',   role: 'Sniper',            headwear: 'cap',    hairShape: 'buzz',     facialHair: 'mustache', eyewear: 'none',    marker: 'scope'    },
  { id: 'zenith',   name: 'Zenith',   bucket: 'C', sex: 'M', rank: 'Colonel',    role: 'Commander',         headwear: 'beret',  hairShape: 'short',    facialHair: 'beard',    eyewear: 'glasses', marker: 'medal'    },
  { id: 'frost',    name: 'Frost',    bucket: 'C', sex: 'M', rank: 'Lieutenant', role: 'Arctic Recon',      headwear: 'cap',    hairShape: 'short',    facialHair: 'beard',    eyewear: 'goggles', marker: 'scarf'    },
  { id: 'nomad',    name: 'Nomad',    bucket: 'C', sex: 'M', rank: 'Captain',    role: 'Field Ops',         headwear: 'cap',    hairShape: 'short',    facialHair: 'beard',    eyewear: 'none',    marker: 'none'     },
  { id: 'ghost',    name: 'Ghost',    bucket: 'D', sex: 'F', rank: 'Captain',    role: 'Assassin',          headwear: 'hood',   hairShape: 'long',     facialHair: 'none',     eyewear: 'none',    marker: 'mask'     },
  { id: 'cobra',    name: 'Cobra',    bucket: 'D', sex: 'F', rank: 'Lieutenant', role: 'Saboteur',          headwear: 'none',   hairShape: 'ponytail', facialHair: 'none',     eyewear: 'none',    marker: 'eyepatch' },
  { id: 'phantom',  name: 'Phantom',  bucket: 'D', sex: 'M', rank: 'Captain',    role: 'Stealth Operative', headwear: 'hood',   hairShape: 'short',    facialHair: 'none',     eyewear: 'none',    marker: 'mask'     },
  { id: 'shade',    name: 'Shade',    bucket: 'D', sex: 'F', rank: 'Lieutenant', role: 'Assassin',          headwear: 'hood',   hairShape: 'long',     facialHair: 'none',     eyewear: 'none',    marker: 'scar'     },
  { id: 'striker',  name: 'Striker',  bucket: 'D', sex: 'M', rank: 'Lieutenant', role: 'Assault Lead',      headwear: 'helmet', hairShape: 'buzz',     facialHair: 'mustache', eyewear: 'none',    marker: 'patch'    },
  { id: 'loki',     name: 'Loki',     bucket: 'D', sex: 'F', rank: 'Sergeant',   role: 'Infiltrator',       headwear: 'hood',   hairShape: 'long',     facialHair: 'none',     eyewear: 'visor',   marker: 'mask'     },
  { id: 'dagger',   name: 'Dagger',   bucket: 'D', sex: 'M', rank: 'Sergeant',   role: 'Assassin',          headwear: 'hood',   hairShape: 'spiky',    facialHair: 'mustache', eyewear: 'none',    marker: 'scar'     },
  { id: 'vector',   name: 'Vector',   bucket: 'D', sex: 'F', rank: 'Major',      role: 'Tactical AI',       headwear: 'none',   hairShape: 'short',    facialHair: 'none',     eyewear: 'visor',   marker: 'ar_unit'  },
];

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
