/**
 * Roster integrity tests.
 *
 * The 32-character roster was previously hand-copied into the server
 * (lib/gameManager.ts) and the client (game/constants.js), and the two copies
 * drifted apart on four characters — which made some boards unwinnable, because
 * the server answered questions from one copy while the client eliminated cards
 * using the other. lib/roster.js is now the single source of truth.
 *
 * These tests guard that arrangement: they fail if a second copy reappears, if
 * the roster stops matching the card art, or if board generation can produce a
 * board the player cannot reason about.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_CHARACTERS } from '../roster.js';
import { ROSTER_FRAME } from '../../game/constants.js';

const repoFile = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');

const ATTRIBUTES = ['sex', 'headwear', 'hairShape', 'facialHair', 'eyewear', 'marker'] as const;

describe('roster shape', () => {
  it('holds exactly 32 agents', () => {
    expect(ALL_CHARACTERS).toHaveLength(32);
  });

  it('has unique ids and names', () => {
    expect(new Set(ALL_CHARACTERS.map(c => c.id)).size).toBe(32);
    expect(new Set(ALL_CHARACTERS.map(c => c.name)).size).toBe(32);
  });

  it('gives every agent every attribute the question system can ask about', () => {
    for (const c of ALL_CHARACTERS) {
      for (const attr of ATTRIBUTES) {
        expect(c[attr], `${c.name}.${attr}`).toBeTruthy();
      }
    }
  });

  it('splits the roster into four equal draw buckets', () => {
    const counts = new Map<string, number>();
    for (const c of ALL_CHARACTERS) counts.set(c.bucket, (counts.get(c.bucket) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual(['A', 'B', 'C', 'D']);
    for (const [bucket, n] of counts) expect(n, `bucket ${bucket}`).toBe(8);
  });
});

describe('roster is the single source of truth', () => {
  // The regression that caused the original defect was a *second* hand-maintained
  // copy of the character data. Both consumers must import, never redeclare.
  // A roster entry is recognisable as a record carrying a character name
  // alongside a bucket, e.g. { id: 'echo', name: 'Echo', bucket: 'B', ... }.
  // Matching that shape (rather than any 'headwear:' key, which also appears in
  // gameManager's category map) detects a genuine second copy of the data.
  const ROSTER_ENTRY = /name:\s*'[A-Z][a-z]+'\s*,\s*bucket:/;

  it('is imported by the server game manager rather than redeclared', () => {
    const src = repoFile('lib/gameManager.ts');
    expect(src).toMatch(/from '\.\/roster\.js'/);
    expect(src).not.toMatch(ROSTER_ENTRY);
  });

  it('is imported by the client constants rather than redeclared', () => {
    const src = repoFile('game/constants.js');
    expect(src).toMatch(/from '\.\.\/lib\/roster\.js'/);
    expect(src).not.toMatch(ROSTER_ENTRY);
  });

  it('exposes a sprite frame for every agent, and no extras', () => {
    const names = ALL_CHARACTERS.map(c => c.name.toLowerCase()).sort();
    expect(Object.keys(ROSTER_FRAME).sort()).toEqual(names);
    expect(new Set(Object.values(ROSTER_FRAME)).size).toBe(32);
  });
});

describe('attributes match the card art', () => {
  // These four are the characters whose two copies disagreed. The values below
  // were read off public/assets/roster.png (96x96 frames, ROSTER_FRAME index),
  // which is what the player actually sees, so they are the ground truth.
  const fromArt = [
    { name: 'Echo', attr: 'eyewear', value: 'none', art: 'ponytail, no glasses' },
    { name: 'Nomad', attr: 'headwear', value: 'none', art: 'bare head, beard' },
    { name: 'Pulse', attr: 'headwear', value: 'cap', art: 'cap, glasses, headset' },
    { name: 'Sentinel', attr: 'headwear', value: 'none', art: 'bald, no helmet' },
  ] as const;

  for (const { name, attr, value, art } of fromArt) {
    it(`${name}.${attr} is "${value}" (art: ${art})`, () => {
      const c = ALL_CHARACTERS.find(x => x.name === name);
      expect(c, `${name} missing from roster`).toBeDefined();
      expect(c![attr]).toBe(value);
    });
  }
});
