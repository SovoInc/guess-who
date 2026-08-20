/**
 * Achievement catalogue tests.
 *
 * Nine achievements previously referenced characters that do not exist in the
 * roster (rook, lancer, jade, ...), so they could never fire, while 23 real
 * agents awarded nothing. achievementForSpy() matches on the agent name, so the
 * catalogue and the roster have to agree exactly.
 */

import { describe, it, expect } from 'vitest';
import { ACHIEVEMENTS, achievementForSpy, getAchievementDef } from '../achievements.js';
import { ALL_CHARACTERS } from '../roster.js';

const slugFor = (name: string) => `spy_${name.toLowerCase().replace(/\s+/g, '_')}`;

describe('achievement catalogue', () => {
  it('has unique ids and names', () => {
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(new Set(ACHIEVEMENTS.map(a => a.name)).size).toBe(ACHIEVEMENTS.length);
  });

  it('gives every achievement a name and description', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.name, a.id).toBeTruthy();
      expect(a.description, a.id).toBeTruthy();
    }
  });

  it('defines no achievement for a character outside the roster', () => {
    const real = new Set(ALL_CHARACTERS.map(c => slugFor(c.name)));
    const phantom = ACHIEVEMENTS.filter(a => a.id.startsWith('spy_') && !real.has(a.id));
    expect(phantom.map(a => a.id)).toEqual([]);
  });

  it('leaves no roster agent without an achievement', () => {
    const defined = new Set(ACHIEVEMENTS.map(a => a.id));
    const uncovered = ALL_CHARACTERS.filter(c => !defined.has(slugFor(c.name)));
    expect(uncovered.map(c => c.name)).toEqual([]);
  });
});

describe('achievementForSpy', () => {
  it('resolves for every agent in the roster', () => {
    for (const c of ALL_CHARACTERS) {
      const id = achievementForSpy(c.name);
      expect(id, `no achievement for ${c.name}`).not.toBeNull();
      expect(getAchievementDef(id!), `dangling id for ${c.name}`).toBeDefined();
    }
  });

  it('is case-insensitive, matching however the client sends the name', () => {
    const name = ALL_CHARACTERS[0].name;
    const expected = slugFor(name);
    expect(achievementForSpy(name.toUpperCase())).toBe(expected);
    expect(achievementForSpy(name.toLowerCase())).toBe(expected);
  });

  it('returns null for an unknown name rather than a dangling id', () => {
    expect(achievementForSpy('Rook')).toBeNull();
    expect(achievementForSpy('')).toBeNull();
  });
});
