export const COLORS = {
  BG:           0x000000,
  PRIMARY:      0x00ff41,  // matrix green
  DIM:          0x005514,
  ACCENT:       0x39ff14,  // bright neon green
  DANGER:       0xff0000,
  WARNING:      0xffaa00,
  PANEL_BG:     0x0a0a0a,
  BORDER:       0x003300,
  TEXT_DIM:     0x004400,
};

// ── 32-Character Roster ──────────────────────────────────────────────────────

export const ALL_CHARACTERS = [
  { id: 'atlas',    name: 'Atlas',    bucket: 'A', sex: 'M', rank: 'Colonel',    role: 'Heavy Weapons',      headwear: 'helmet', hairShape: 'bald',     facialHair: 'beard',    eyewear: 'none',    marker: 'scar'    },
  { id: 'falcon',   name: 'Falcon',   bucket: 'A', sex: 'M', rank: 'Major',      role: 'Drone Pilot',        headwear: 'helmet', hairShape: 'short',    facialHair: 'beard',    eyewear: 'visor',   marker: 'radio'   },
  { id: 'vega',     name: 'Vega',     bucket: 'A', sex: 'F', rank: 'Captain',    role: 'Drone Ops',          headwear: 'helmet', hairShape: 'long',     facialHair: 'none',     eyewear: 'visor',   marker: 'radio'   },
  { id: 'titan',    name: 'Titan',    bucket: 'A', sex: 'M', rank: 'Major',      role: 'Assault',            headwear: 'helmet', hairShape: 'bald',     facialHair: 'beard',    eyewear: 'none',    marker: 'patch'   },
  { id: 'blaze',    name: 'Blaze',    bucket: 'A', sex: 'M', rank: 'Captain',    role: 'Demolitions',        headwear: 'helmet', hairShape: 'short',    facialHair: 'beard',    eyewear: 'goggles', marker: 'scar'    },
  { id: 'halo',     name: 'Halo',     bucket: 'A', sex: 'F', rank: 'Captain',    role: 'Pilot',              headwear: 'helmet', hairShape: 'ponytail', facialHair: 'none',     eyewear: 'visor',   marker: 'none'    },
  { id: 'razor',    name: 'Razor',    bucket: 'A', sex: 'M', rank: 'Sergeant',   role: 'Breacher',           headwear: 'helmet', hairShape: 'buzz',     facialHair: 'beard',    eyewear: 'none',    marker: 'patch'   },
  { id: 'sentinel', name: 'Sentinel', bucket: 'A', sex: 'M', rank: 'Colonel',    role: 'Security Chief',     headwear: 'helmet', hairShape: 'bald',     facialHair: 'beard',    eyewear: 'glasses', marker: 'badge'   },
  { id: 'viper',    name: 'Viper',    bucket: 'B', sex: 'F', rank: 'Sergeant',   role: 'Recon Analyst',      headwear: 'none',   hairShape: 'ponytail', facialHair: 'none',     eyewear: 'glasses', marker: 'headset' },
  { id: 'raven',    name: 'Raven',    bucket: 'B', sex: 'F', rank: 'Lieutenant', role: 'Intelligence',       headwear: 'none',   hairShape: 'long',     facialHair: 'none',     eyewear: 'glasses', marker: 'headset' },
  { id: 'bishop',   name: 'Bishop',   bucket: 'B', sex: 'M', rank: 'Major',      role: 'Signals Officer',    headwear: 'none',   hairShape: 'short',    facialHair: 'mustache', eyewear: 'glasses', marker: 'tablet'  },
  { id: 'echo',     name: 'Echo',     bucket: 'B', sex: 'F', rank: 'Sergeant',   role: 'Recon',              headwear: 'none',   hairShape: 'ponytail', facialHair: 'none',     eyewear: 'glasses', marker: 'none'    },
  { id: 'hydra',    name: 'Hydra',    bucket: 'B', sex: 'F', rank: 'Lieutenant', role: 'Chem Ops',           headwear: 'none',   hairShape: 'long',     facialHair: 'none',     eyewear: 'goggles', marker: 'mask'    },
  { id: 'nova',     name: 'Nova',     bucket: 'B', sex: 'F', rank: 'Major',      role: 'Cyberwarfare',       headwear: 'none',   hairShape: 'short',    facialHair: 'none',     eyewear: 'glasses', marker: 'headset' },
  { id: 'cipher',   name: 'Cipher',   bucket: 'B', sex: 'F', rank: 'Major',      role: 'Cryptography',       headwear: 'none',   hairShape: 'short',    facialHair: 'none',     eyewear: 'glasses', marker: 'tablet'  },
  { id: 'pulse',    name: 'Pulse',    bucket: 'B', sex: 'F', rank: 'Lieutenant', role: 'Tech Ops',           headwear: 'none',   hairShape: 'short',    facialHair: 'none',     eyewear: 'glasses', marker: 'headset' },
  { id: 'archer',   name: 'Archer',   bucket: 'C', sex: 'M', rank: 'Lieutenant', role: 'Sniper',             headwear: 'cap',    hairShape: 'buzz',     facialHair: 'none',     eyewear: 'visor',   marker: 'scope'   },
  { id: 'orion',    name: 'Orion',    bucket: 'C', sex: 'M', rank: 'Sergeant',   role: 'Sniper',             headwear: 'cap',    hairShape: 'spiky',    facialHair: 'beard',    eyewear: 'none',    marker: 'scar'    },
  { id: 'kraken',   name: 'Kraken',   bucket: 'C', sex: 'M', rank: 'Colonel',    role: 'Naval Ops',          headwear: 'beret',  hairShape: 'short',    facialHair: 'beard',    eyewear: 'none',    marker: 'pipe'    },
  { id: 'wolf',     name: 'Wolf',     bucket: 'C', sex: 'M', rank: 'Sergeant',   role: 'Tracker',            headwear: 'cap',    hairShape: 'spiky',    facialHair: 'beard',    eyewear: 'none',    marker: 'scarf'   },
  { id: 'talon',    name: 'Talon',    bucket: 'C', sex: 'M', rank: 'Sergeant',   role: 'Sniper',             headwear: 'cap',    hairShape: 'buzz',     facialHair: 'mustache', eyewear: 'none',    marker: 'scope'   },
  { id: 'zenith',   name: 'Zenith',   bucket: 'C', sex: 'M', rank: 'Colonel',    role: 'Commander',          headwear: 'beret',  hairShape: 'short',    facialHair: 'beard',    eyewear: 'glasses', marker: 'medal'   },
  { id: 'frost',    name: 'Frost',    bucket: 'C', sex: 'M', rank: 'Lieutenant', role: 'Arctic Recon',       headwear: 'cap',    hairShape: 'short',    facialHair: 'beard',    eyewear: 'goggles', marker: 'scarf'   },
  { id: 'nomad',    name: 'Nomad',    bucket: 'C', sex: 'M', rank: 'Captain',    role: 'Field Ops',          headwear: 'cap',    hairShape: 'short',    facialHair: 'beard',    eyewear: 'none',    marker: 'none'    },
  { id: 'ghost',    name: 'Ghost',    bucket: 'D', sex: 'F', rank: 'Captain',    role: 'Assassin',           headwear: 'hood',   hairShape: 'long',     facialHair: 'none',     eyewear: 'none',    marker: 'mask'    },
  { id: 'cobra',    name: 'Cobra',    bucket: 'D', sex: 'F', rank: 'Lieutenant', role: 'Saboteur',           headwear: 'none',   hairShape: 'ponytail', facialHair: 'none',     eyewear: 'none',    marker: 'eyepatch'},
  { id: 'phantom',  name: 'Phantom',  bucket: 'D', sex: 'M', rank: 'Captain',    role: 'Stealth Operative',  headwear: 'hood',   hairShape: 'short',    facialHair: 'none',     eyewear: 'none',    marker: 'mask'    },
  { id: 'shade',    name: 'Shade',    bucket: 'D', sex: 'F', rank: 'Lieutenant', role: 'Assassin',           headwear: 'hood',   hairShape: 'long',     facialHair: 'none',     eyewear: 'none',    marker: 'scar'    },
  { id: 'striker',  name: 'Striker',  bucket: 'D', sex: 'M', rank: 'Lieutenant', role: 'Assault Lead',       headwear: 'helmet', hairShape: 'buzz',     facialHair: 'mustache', eyewear: 'none',    marker: 'patch'   },
  { id: 'loki',     name: 'Loki',     bucket: 'D', sex: 'F', rank: 'Sergeant',   role: 'Infiltrator',        headwear: 'hood',   hairShape: 'long',     facialHair: 'none',     eyewear: 'visor',   marker: 'mask'    },
  { id: 'dagger',   name: 'Dagger',   bucket: 'D', sex: 'M', rank: 'Sergeant',   role: 'Assassin',           headwear: 'hood',   hairShape: 'spiky',    facialHair: 'mustache', eyewear: 'none',    marker: 'scar'    },
  { id: 'vector',   name: 'Vector',   bucket: 'D', sex: 'F', rank: 'Major',      role: 'Tactical AI',        headwear: 'none',   hairShape: 'short',    facialHair: 'none',     eyewear: 'visor',   marker: 'ar_unit' },
];

// ── Board Generation ─────────────────────────────────────────────────────────

function _sample(array, n) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function _isRareMarker(m) {
  return ['eyepatch', 'pipe', 'medal', 'badge', 'ar_unit', 'scope'].includes(m);
}

function _validateBoard(board) {
  const female    = board.filter(c => c.sex === 'F').length;
  const helmet    = board.filter(c => c.headwear === 'helmet').length;
  const hood      = board.filter(c => c.headwear === 'hood').length;
  const eyewear   = board.filter(c => c.eyewear !== 'none').length;
  const facial    = board.filter(c => c.facialHair !== 'none').length;
  const rare      = board.filter(c => _isRareMarker(c.marker)).length;
  return (
    female  >= 5 && female  <= 8 &&
    helmet  >= 3 && helmet  <= 6 &&
    hood    >= 2 && hood    <= 5 &&
    eyewear >= 5 && eyewear <= 8 &&
    facial  >= 4 && facial  <= 8 &&
    rare    >= 2
  );
}

export function generateBoard(characters) {
  const buckets = { A: [], B: [], C: [], D: [] };
  for (const c of characters) buckets[c.bucket].push(c);

  for (let tries = 0; tries < 200; tries++) {
    const board = [
      ..._sample(buckets.A, 4),
      ..._sample(buckets.B, 4),
      ..._sample(buckets.C, 4),
      ..._sample(buckets.D, 4),
    ];
    if (_validateBoard(board)) {
      return _sample(board, 16).map((c, i) => ({ ...c, id: i }));
    }
  }
  throw new Error('Could not generate valid board after 200 tries');
}

export const CHARACTERS = generateBoard(ALL_CHARACTERS);

// ── Question Categories ──────────────────────────────────────────────────────

export const QUESTION_CATEGORIES = {
  SEX:         ['M', 'F'],
  HEADWEAR:    ['none', 'helmet', 'cap', 'beret', 'hood'],
  HAIR:        ['bald', 'buzz', 'short', 'spiky', 'long', 'ponytail'],
  FACIAL_HAIR: ['none', 'mustache', 'beard', 'goatee'],
  EYEWEAR:     ['none', 'glasses', 'goggles', 'visor'],
  MARKER:      ['none', 'scar', 'beard', 'patch', 'radio', 'headset', 'tablet', 'mask', 'eyepatch', 'scope', 'pipe', 'medal', 'badge', 'ar_unit', 'scarf'],
};

export function formatQuestion(category, value) {
  const v = value.replace(/_/g, ' ');
  switch (category) {
    case 'SEX':
      return value === 'F' ? 'Is the target female?' : 'Is the target male?';
    case 'HEADWEAR':
      return value === 'none'
        ? 'Is the target wearing no headwear?'
        : `Is the target wearing a ${v}?`;
    case 'HAIR':
      return value === 'bald'
        ? 'Is the target bald?'
        : `Does the target have ${v} hair?`;
    case 'FACIAL_HAIR':
      return value === 'none'
        ? 'Does the target have no facial hair?'
        : `Does the target have a ${v}?`;
    case 'EYEWEAR':
      return value === 'none'
        ? 'Is the target wearing no eyewear?'
        : `Is the target wearing ${v}?`;
    case 'MARKER':
      return value === 'none'
        ? 'Does the target have no distinguishing marker?'
        : `Does the target have a ${v}?`;
    default:
      return `Is the target's ${category}: ${v}?`;
  }
}

export const GAME_WIDTH  = 1280;
export const GAME_HEIGHT = 720;

export const CARD_W = 200;
export const CARD_H = 144;
export const CARD_GAP = 8;
export const GRID_X = 20;
export const GRID_Y = 60;

export const SIDEBAR_X = GRID_X + 4 * (CARD_W + CARD_GAP) + 20;
export const SIDEBAR_W = 360;

export const MAX_QUESTIONS = 10;
export const TIMER_SECONDS = 180;
