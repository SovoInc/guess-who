/**
 * Game logic tests: board generation, question answering, guess evaluation,
 * and session teardown.
 *
 * These run against the in-memory session store (no POSTGRES_URL), which is the
 * same code path the server uses when no database is configured.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createSession, answerQuestion, evaluateGuess, deleteSession } from '../gameManager.js';
import { ALL_CHARACTERS } from '../roster.js';

beforeAll(() => {
  // Force the in-memory store so these tests never touch a real database.
  delete process.env.POSTGRES_URL;
});

describe('board generation', () => {
  it('deals 16 distinct agents with contiguous board ids', async () => {
    const { characters } = await createSession();
    expect(characters).toHaveLength(16);
    expect(characters.map(c => c.id)).toEqual([...Array(16).keys()]);
    expect(new Set(characters.map(c => c.name)).size).toBe(16);
  });

  it('only ever deals agents that exist in the roster', async () => {
    const known = new Map(ALL_CHARACTERS.map(c => [c.name, c]));
    const { characters } = await createSession();
    for (const c of characters) {
      const source = known.get(c.name);
      expect(source, `${c.name} is not in the roster`).toBeDefined();
      // Attributes must survive the deal unchanged — the client eliminates
      // cards using these values while the server answers from them.
      expect(c.sex).toBe(source!.sex);
      expect(c.headwear).toBe(source!.headwear);
      expect(c.hairShape).toBe(source!.hairShape);
      expect(c.facialHair).toBe(source!.facialHair);
      expect(c.eyewear).toBe(source!.eyewear);
      expect(c.marker).toBe(source!.marker);
    }
  });

  it('satisfies the deduction constraints on every board', async () => {
    // A board that violates these is hard or impossible to narrow down, so the
    // generator retries; this asserts it never gives up and returns a bad one.
    const rare = ['eyepatch', 'pipe', 'medal', 'badge', 'ar_unit', 'scope'];
    for (let i = 0; i < 60; i++) {
      const { characters: b } = await createSession();
      const count = (fn: (c: typeof b[number]) => boolean) => b.filter(fn).length;
      expect(count(c => c.sex === 'F')).toBeGreaterThanOrEqual(5);
      expect(count(c => c.sex === 'F')).toBeLessThanOrEqual(8);
      expect(count(c => c.headwear === 'helmet')).toBeGreaterThanOrEqual(3);
      expect(count(c => c.headwear === 'helmet')).toBeLessThanOrEqual(6);
      expect(count(c => c.headwear === 'hood')).toBeGreaterThanOrEqual(2);
      expect(count(c => c.headwear === 'hood')).toBeLessThanOrEqual(5);
      expect(count(c => c.eyewear !== 'none')).toBeGreaterThanOrEqual(5);
      expect(count(c => c.eyewear !== 'none')).toBeLessThanOrEqual(8);
      expect(count(c => c.facialHair !== 'none')).toBeGreaterThanOrEqual(4);
      expect(count(c => c.facialHair !== 'none')).toBeLessThanOrEqual(8);
      expect(count(c => rare.includes(c.marker))).toBeGreaterThanOrEqual(2);
    }
  });

  it('places the spy on the board', async () => {
    for (let i = 0; i < 20; i++) {
      const { characters, spyId } = await createSession();
      expect(spyId).toBeGreaterThanOrEqual(0);
      expect(spyId).toBeLessThan(characters.length);
    }
  });
});

describe('answerQuestion', () => {
  it('answers truthfully from the spy the client can see', async () => {
    // This is the defect that made boards unwinnable: the server must answer
    // from the same attribute values the client rendered.
    const { sessionId, characters, spyId } = await createSession();
    const spy = characters[spyId];

    const cases: Array<[string, keyof typeof spy]> = [
      ['sex', 'sex'],
      ['headwear', 'headwear'],
      ['hair', 'hairShape'],
      ['facial_hair', 'facialHair'],
      ['eyewear', 'eyewear'],
      ['marker', 'marker'],
    ];

    for (const [category, prop] of cases) {
      await expect(answerQuestion(sessionId, category, String(spy[prop]))).resolves.toBe('YES');
      await expect(answerQuestion(sessionId, category, 'definitely_not_this')).resolves.toBe('NO');
    }
  });

  it('is case-insensitive on category and value', async () => {
    const { sessionId, characters, spyId } = await createSession();
    const spy = characters[spyId];
    await expect(answerQuestion(sessionId, 'HEADWEAR', String(spy.headwear).toUpperCase()))
      .resolves.toBe('YES');
  });

  it('returns null for an unknown session or category', async () => {
    const { sessionId } = await createSession();
    await expect(answerQuestion('no-such-session', 'sex', 'F')).resolves.toBeNull();
    await expect(answerQuestion(sessionId, 'favourite_colour', 'green')).resolves.toBeNull();
  });
});

describe('evaluateGuess', () => {
  it('accepts the spy and rejects everyone else', async () => {
    const { sessionId, characters, spyId } = await createSession();

    const right = await evaluateGuess(sessionId, characters[spyId].id);
    expect(right?.correct).toBe(true);
    expect(right?.spy.id).toBe(spyId);

    const wrongId = characters.find(c => c.id !== spyId)!.id;
    const wrong = await evaluateGuess(sessionId, wrongId);
    expect(wrong?.correct).toBe(false);
    // Even on a loss the spy is revealed, so the UI can show the answer.
    expect(wrong?.spy.id).toBe(spyId);
  });

  it('returns null for an unknown session', async () => {
    await expect(evaluateGuess('no-such-session', 0)).resolves.toBeNull();
  });
});

describe('deleteSession ends the game', () => {
  // Without this, a declared session stayed alive: a wrong guess revealed the
  // spy and a second declare could be replayed for a free win.
  it('blocks re-declaring and further questions once declared', async () => {
    const { sessionId, characters, spyId } = await createSession();
    const wrongId = characters.find(c => c.id !== spyId)!.id;

    expect((await evaluateGuess(sessionId, wrongId))?.correct).toBe(false);
    await deleteSession(sessionId);

    // The revealed spy is now worthless — the session is gone.
    await expect(evaluateGuess(sessionId, characters[spyId].id)).resolves.toBeNull();
    await expect(answerQuestion(sessionId, 'sex', 'F')).resolves.toBeNull();
  });

  it('is safe to call twice', async () => {
    const { sessionId } = await createSession();
    await deleteSession(sessionId);
    await expect(deleteSession(sessionId)).resolves.toBeUndefined();
  });
});
