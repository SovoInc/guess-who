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
// The roster lives in lib/roster.js — the single source of truth shared with
// the server (lib/gameManager.ts). Do not duplicate it here.

import { ALL_CHARACTERS } from '../lib/roster.js';
export { ALL_CHARACTERS };

// ── Spritesheet frame index (alphabetical order, 6-column grid) ──────────────
// Archer=0, Atlas=1, Bishop=2, Blaze=3, Cipher=4, Cobra=5,
// Dagger=6, Echo=7, Falcon=8, Frost=9, Ghost=10, Halo=11,
// Hydra=12, Kraken=13, Loki=14, Nomad=15, Nova=16, Orion=17,
// Phantom=18, Pulse=19, Raven=20, Razor=21, Sentinel=22, Shade=23,
// Striker=24, Talon=25, Titan=26, Vector=27, Vega=28, Viper=29,
// Wolf=30, Zenith=31
export const ROSTER_FRAME = {
  archer: 0, atlas: 1, bishop: 2, blaze: 3, cipher: 4, cobra: 5,
  dagger: 6, echo: 7, falcon: 8, frost: 9, ghost: 10, halo: 11,
  hydra: 12, kraken: 13, loki: 14, nomad: 15, nova: 16, orion: 17,
  phantom: 18, pulse: 19, raven: 20, razor: 21, sentinel: 22, shade: 23,
  striker: 24, talon: 25, titan: 26, vector: 27, vega: 28, viper: 29,
  wolf: 30, zenith: 31,
};

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
      return _sample(board, 16).map((c, i) => ({ ...c, charId: c.id, id: i }));
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
  MARKER:      ['none', 'scar', 'patch', 'radio', 'headset', 'tablet', 'mask', 'eyepatch', 'scope', 'pipe', 'medal', 'badge', 'ar_unit', 'scarf'],
};

export function formatQuestion(category, value) {
  const v = value.replace(/_/g, ' ');
  switch (category) {
    case 'SEX':
      return value === 'F' ? 'Is the target female?' : 'Is the target male?';
    case 'HEADWEAR':
      if (value === 'none') return 'Is the target bare-headed?';
      if (value === 'helmet') return 'Is the target wearing a combat helmet?';
      if (value === 'cap')    return 'Is the target wearing a cap?';
      if (value === 'beret')  return 'Is the target wearing a beret?';
      if (value === 'hood')   return 'Is the target wearing a hood?';
      return `Is the target wearing a ${v}?`;
    case 'HAIR':
      if (value === 'bald')     return 'Is the target bald?';
      if (value === 'buzz')     return 'Does the target have a buzz cut?';
      if (value === 'short')    return 'Does the target have short hair?';
      if (value === 'spiky')    return 'Does the target have spiky hair?';
      if (value === 'long')     return 'Does the target have long hair?';
      if (value === 'ponytail') return 'Does the target have a ponytail?';
      return `Does the target have ${v} hair?`;
    case 'FACIAL_HAIR':
      if (value === 'none')     return 'Is the target clean-shaven?';
      if (value === 'mustache') return 'Does the target have a mustache?';
      if (value === 'beard')    return 'Does the target have a beard?';
      if (value === 'goatee')   return 'Does the target have a goatee?';
      return `Does the target have a ${v}?`;
    case 'EYEWEAR':
      if (value === 'none')    return 'Is the target wearing no eyewear?';
      if (value === 'glasses') return 'Is the target wearing glasses?';
      if (value === 'goggles') return 'Is the target wearing goggles?';
      if (value === 'visor')   return 'Is the target wearing a visor?';
      return `Is the target wearing ${v}?`;
    case 'MARKER':
      if (value === 'none')    return 'Is the target unmarked?';
      if (value === 'scar')    return 'Does the target have a visible scar?';
      if (value === 'patch')   return 'Does the target have a shoulder patch?';
      if (value === 'radio')   return 'Does the target carry a radio?';
      if (value === 'headset') return 'Does the target wear a headset?';
      if (value === 'tablet')  return 'Does the target carry a tablet?';
      if (value === 'mask')    return 'Does the target wear a face mask?';
      if (value === 'eyepatch') return 'Does the target wear an eyepatch?';
      if (value === 'scope')   return 'Does the target carry a scope?';
      if (value === 'pipe')    return 'Does the target smoke a pipe?';
      if (value === 'medal')   return 'Does the target wear a medal?';
      if (value === 'badge')   return 'Does the target wear a badge?';
      if (value === 'ar_unit') return 'Does the target have an AR unit?';
      if (value === 'scarf')   return 'Does the target wear a scarf?';
      return `Does the target have a ${v}?`;
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
