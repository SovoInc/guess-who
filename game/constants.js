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

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const _CODENAMES = ['GHOST','VIPER','JACKAL','WRAITH','CIPHER','RAVEN','SPECTER','LYNX','COBRA','ORACLE','TITAN','MIRAGE','DAGGER','PHANTOM','BISHOP','NOVA'];
const _RANKS     = ['COLONEL','COLONEL','MAJOR','MAJOR','MAJOR','CAPTAIN','CAPTAIN','LT','LT','LT','LT','SERGEANT','SERGEANT','SERGEANT','SERGEANT','SERGEANT'];
const _SPECS     = ['INFILTRATION','INFILTRATION','INFILTRATION','SNIPER','SNIPER','SNIPER','DEMOLITIONS','DEMOLITIONS','DEMOLITIONS','INTEL','INTEL','INTEL','COMMS','COMMS','MEDIC','MEDIC'];
const _ORIGINS   = ['WESTERN','WESTERN','WESTERN','WESTERN','EASTERN','EASTERN','EASTERN','EASTERN','SOUTHERN','SOUTHERN','SOUTHERN','SOUTHERN','NORTHERN','NORTHERN','NORTHERN','NORTHERN'];
const _FEATURES  = ['SCAR','SCAR','CYBERNETIC_EYE','CYBERNETIC_EYE','TATTOO','TATTOO','GLASSES','GLASSES','BALD','BALD','HEADSET','HEADSET','EYE_PATCH','EYE_PATCH','BEARD','BEARD'];

export const CHARACTERS = (() => {
  const ranks = _shuffle(_RANKS), specs = _shuffle(_SPECS), origins = _shuffle(_ORIGINS), features = _shuffle(_FEATURES);
  return _CODENAMES.map((codename, i) => ({ id: i, codename, rank: ranks[i], specialty: specs[i], origin: origins[i], feature: features[i] }));
})();

// Natural-language question templates per category
// Returns a full sentence suitable for the secure channel log
const FEATURE_PHRASES = {
  SCAR:           'Does the target have a visible scar?',
  CYBERNETIC_EYE: 'Does the target have a cybernetic eye?',
  TATTOO:         'Does the target have a tattoo?',
  GLASSES:        'Does the target wear glasses?',
  BALD:           'Is the target bald?',
  HEADSET:        'Is the target wearing a headset?',
  EYE_PATCH:      'Does the target wear an eye patch?',
  BEARD:          'Does the target have a beard?',
};

export function formatQuestion(category, value) {
  const v = value.replace(/_/g, ' ');
  switch (category) {
    case 'RANK':
      return `Does the target hold the rank of ${v}?`;
    case 'SPECIALTY':
      return `Is the target's specialty ${v}?`;
    case 'ORIGIN':
      return `Does the target originate from the ${v} sector?`;
    case 'FEATURE':
      return FEATURE_PHRASES[value] || `Does the target have a ${v}?`;
    default:
      return `Is the target's ${category}: ${v}?`;
  }
}

export const QUESTION_CATEGORIES = {
  RANK:      ['COLONEL', 'MAJOR', 'CAPTAIN', 'LT', 'SERGEANT'],
  SPECIALTY: ['INFILTRATION', 'SNIPER', 'DEMOLITIONS', 'INTEL', 'COMMS', 'MEDIC'],
  ORIGIN:    ['WESTERN', 'EASTERN', 'SOUTHERN', 'NORTHERN'],
  FEATURE:   ['SCAR', 'CYBERNETIC_EYE', 'TATTOO', 'GLASSES', 'BALD', 'HEADSET', 'EYE_PATCH', 'BEARD'],
};

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
