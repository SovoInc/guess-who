// ── 32-Character Roster ──────────────────────────────────────────────────────
//
// SINGLE SOURCE OF TRUTH for the character roster.
// Imported by both the client (game/constants.js) and the server
// (lib/gameManager.ts) so their attribute data can never drift apart.
//
// Attribute values MUST match the card art in public/assets/roster.png —
// the server answers questions from this data while the player eliminates
// cards by looking at the art.

export const ALL_CHARACTERS = [
  { id: 'atlas',    name: 'Atlas',    bucket: 'A', sex: 'M', rank: 'Colonel',    role: 'Heavy Weapons',      headwear: 'helmet', hairShape: 'bald',     facialHair: 'beard',    eyewear: 'none',    marker: 'scar'    },
  { id: 'falcon',   name: 'Falcon',   bucket: 'A', sex: 'M', rank: 'Major',      role: 'Drone Pilot',        headwear: 'helmet', hairShape: 'short',    facialHair: 'beard',    eyewear: 'visor',   marker: 'radio'   },
  { id: 'vega',     name: 'Vega',     bucket: 'A', sex: 'F', rank: 'Captain',    role: 'Drone Ops',          headwear: 'helmet', hairShape: 'long',     facialHair: 'none',     eyewear: 'visor',   marker: 'radio'   },
  { id: 'titan',    name: 'Titan',    bucket: 'A', sex: 'M', rank: 'Major',      role: 'Assault',            headwear: 'helmet', hairShape: 'bald',     facialHair: 'beard',    eyewear: 'none',    marker: 'patch'   },
  { id: 'blaze',    name: 'Blaze',    bucket: 'A', sex: 'M', rank: 'Captain',    role: 'Demolitions',        headwear: 'helmet', hairShape: 'short',    facialHair: 'beard',    eyewear: 'goggles', marker: 'scar'    },
  { id: 'halo',     name: 'Halo',     bucket: 'A', sex: 'F', rank: 'Captain',    role: 'Pilot',              headwear: 'helmet', hairShape: 'ponytail', facialHair: 'none',     eyewear: 'visor',   marker: 'none'    },
  { id: 'razor',    name: 'Razor',    bucket: 'A', sex: 'M', rank: 'Sergeant',   role: 'Breacher',           headwear: 'helmet', hairShape: 'buzz',     facialHair: 'beard',    eyewear: 'none',    marker: 'patch'   },
  { id: 'sentinel', name: 'Sentinel', bucket: 'A', sex: 'M', rank: 'Colonel',    role: 'Security Chief',     headwear: 'none',   hairShape: 'bald',     facialHair: 'beard',    eyewear: 'glasses', marker: 'badge'   },
  { id: 'viper',    name: 'Viper',    bucket: 'B', sex: 'F', rank: 'Sergeant',   role: 'Recon Analyst',      headwear: 'none',   hairShape: 'ponytail', facialHair: 'none',     eyewear: 'glasses', marker: 'headset' },
  { id: 'raven',    name: 'Raven',    bucket: 'B', sex: 'F', rank: 'Lieutenant', role: 'Intelligence',       headwear: 'none',   hairShape: 'long',     facialHair: 'none',     eyewear: 'glasses', marker: 'headset' },
  { id: 'bishop',   name: 'Bishop',   bucket: 'B', sex: 'M', rank: 'Major',      role: 'Signals Officer',    headwear: 'none',   hairShape: 'short',    facialHair: 'mustache', eyewear: 'glasses', marker: 'tablet'  },
  { id: 'echo',     name: 'Echo',     bucket: 'B', sex: 'F', rank: 'Sergeant',   role: 'Recon',              headwear: 'none',   hairShape: 'ponytail', facialHair: 'none',     eyewear: 'none',    marker: 'none'    },
  { id: 'hydra',    name: 'Hydra',    bucket: 'B', sex: 'F', rank: 'Lieutenant', role: 'Chem Ops',           headwear: 'none',   hairShape: 'long',     facialHair: 'none',     eyewear: 'goggles', marker: 'mask'    },
  { id: 'nova',     name: 'Nova',     bucket: 'B', sex: 'F', rank: 'Major',      role: 'Cyberwarfare',       headwear: 'none',   hairShape: 'short',    facialHair: 'none',     eyewear: 'glasses', marker: 'headset' },
  { id: 'cipher',   name: 'Cipher',   bucket: 'B', sex: 'F', rank: 'Major',      role: 'Cryptography',       headwear: 'none',   hairShape: 'short',    facialHair: 'none',     eyewear: 'glasses', marker: 'tablet'  },
  { id: 'pulse',    name: 'Pulse',    bucket: 'B', sex: 'F', rank: 'Lieutenant', role: 'Tech Ops',           headwear: 'cap',    hairShape: 'short',    facialHair: 'none',     eyewear: 'glasses', marker: 'headset' },
  { id: 'archer',   name: 'Archer',   bucket: 'C', sex: 'M', rank: 'Lieutenant', role: 'Sniper',             headwear: 'cap',    hairShape: 'buzz',     facialHair: 'none',     eyewear: 'visor',   marker: 'scope'   },
  { id: 'orion',    name: 'Orion',    bucket: 'C', sex: 'M', rank: 'Sergeant',   role: 'Sniper',             headwear: 'cap',    hairShape: 'spiky',    facialHair: 'beard',    eyewear: 'none',    marker: 'scar'    },
  { id: 'kraken',   name: 'Kraken',   bucket: 'C', sex: 'M', rank: 'Colonel',    role: 'Naval Ops',          headwear: 'beret',  hairShape: 'short',    facialHair: 'beard',    eyewear: 'none',    marker: 'pipe'    },
  { id: 'wolf',     name: 'Wolf',     bucket: 'C', sex: 'M', rank: 'Sergeant',   role: 'Tracker',            headwear: 'cap',    hairShape: 'spiky',    facialHair: 'beard',    eyewear: 'none',    marker: 'scarf'   },
  { id: 'talon',    name: 'Talon',    bucket: 'C', sex: 'M', rank: 'Sergeant',   role: 'Sniper',             headwear: 'cap',    hairShape: 'buzz',     facialHair: 'mustache', eyewear: 'none',    marker: 'scope'   },
  { id: 'zenith',   name: 'Zenith',   bucket: 'C', sex: 'M', rank: 'Colonel',    role: 'Commander',          headwear: 'beret',  hairShape: 'short',    facialHair: 'beard',    eyewear: 'glasses', marker: 'medal'   },
  { id: 'frost',    name: 'Frost',    bucket: 'C', sex: 'M', rank: 'Lieutenant', role: 'Arctic Recon',       headwear: 'cap',    hairShape: 'short',    facialHair: 'beard',    eyewear: 'goggles', marker: 'scarf'   },
  { id: 'nomad',    name: 'Nomad',    bucket: 'C', sex: 'M', rank: 'Captain',    role: 'Field Ops',          headwear: 'none',   hairShape: 'short',    facialHair: 'beard',    eyewear: 'none',    marker: 'none'    },
  { id: 'ghost',    name: 'Ghost',    bucket: 'D', sex: 'F', rank: 'Captain',    role: 'Assassin',           headwear: 'hood',   hairShape: 'long',     facialHair: 'none',     eyewear: 'none',    marker: 'mask'    },
  { id: 'cobra',    name: 'Cobra',    bucket: 'D', sex: 'F', rank: 'Lieutenant', role: 'Saboteur',           headwear: 'none',   hairShape: 'ponytail', facialHair: 'none',     eyewear: 'none',    marker: 'eyepatch'},
  { id: 'phantom',  name: 'Phantom',  bucket: 'D', sex: 'M', rank: 'Captain',    role: 'Stealth Operative',  headwear: 'hood',   hairShape: 'short',    facialHair: 'none',     eyewear: 'none',    marker: 'mask'    },
  { id: 'shade',    name: 'Shade',    bucket: 'D', sex: 'F', rank: 'Lieutenant', role: 'Assassin',           headwear: 'hood',   hairShape: 'long',     facialHair: 'none',     eyewear: 'none',    marker: 'scar'    },
  { id: 'striker',  name: 'Striker',  bucket: 'D', sex: 'M', rank: 'Lieutenant', role: 'Assault Lead',       headwear: 'helmet', hairShape: 'buzz',     facialHair: 'mustache', eyewear: 'none',    marker: 'patch'   },
  { id: 'loki',     name: 'Loki',     bucket: 'D', sex: 'F', rank: 'Sergeant',   role: 'Infiltrator',        headwear: 'hood',   hairShape: 'long',     facialHair: 'none',     eyewear: 'visor',   marker: 'mask'    },
  { id: 'dagger',   name: 'Dagger',   bucket: 'D', sex: 'M', rank: 'Sergeant',   role: 'Assassin',           headwear: 'hood',   hairShape: 'spiky',    facialHair: 'mustache', eyewear: 'none',    marker: 'scar'    },
  { id: 'vector',   name: 'Vector',   bucket: 'D', sex: 'F', rank: 'Major',      role: 'Tactical AI',        headwear: 'none',   hairShape: 'short',    facialHair: 'none',     eyewear: 'visor',   marker: 'ar_unit' },
];
