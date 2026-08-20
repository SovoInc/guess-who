/**
 * API compatibility tests.
 *
 * The leaderboard, player and achievement endpoints are consumed by an external
 * site, so their paths are a published contract: removing or renaming one breaks
 * a caller we do not control. POST /api/scores in particular was kept (rather
 * than deleted) when scoring moved server-side, and it must stay mounted while
 * no longer writing client-supplied results.
 *
 * The routes are registered inside startSponsorServer(), which needs a wallet
 * and providers, so this reads the source rather than booting the server.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('../../server/src/sponsor-server.ts', import.meta.url)),
  'utf8',
);

const mounts = (method: 'get' | 'post', path: string) =>
  source.includes(`app.${method}('${path}'`);

describe('published endpoint paths', () => {
  // Each of these is called by the external site or the game client. Deleting
  // one is a breaking change, so this list should only ever grow.
  const required: Array<['get' | 'post', string]> = [
    ['get', '/api/scores'],
    ['post', '/api/scores'],
    ['get', '/api/players'],
    ['get', '/api/players/:address/stats'],
    ['get', '/api/players/:address/achievements'],
    ['get', '/api/achievements'],
    ['get', '/metrics'],
    ['get', '/metrics/users/:address'],
    ['get', '/metrics/:channel'],
    ['post', '/api/session/start'],
    ['post', '/api/question'],
    ['post', '/api/declare'],
  ];

  for (const [method, path] of required) {
    it(`serves ${method.toUpperCase()} ${path}`, () => {
      expect(mounts(method, path), `${method.toUpperCase()} ${path} is not mounted`).toBe(true);
    });
  }
});

describe('POST /api/scores no longer trusts client figures', () => {
  it('does not record a score from the request body', () => {
    // The handler must not call recordGameScore/recordGameResult — those belong
    // to /api/declare, which derives the values itself. Reading the handler body
    // keeps this honest even if the endpoint is refactored.
    const start = source.indexOf("app.post('/api/scores'");
    expect(start, 'POST /api/scores is not mounted').toBeGreaterThan(-1);

    const next = source.indexOf('app.get(', start);
    const handler = source.slice(start, next === -1 ? undefined : next);

    expect(handler).not.toMatch(/recordGameScore\(/);
    expect(handler).not.toMatch(/recordGameResult\(/);
    expect(handler).not.toMatch(/awardAchievement\(/);
  });
});

describe('/metrics route ordering', () => {
  it('registers /metrics/users/:address before the :channel catch-all', () => {
    // Express matches in declaration order, so /metrics/:channel would swallow
    // /metrics/users/:address if it were registered first.
    const users = source.indexOf("app.get('/metrics/users/:address'");
    const channel = source.indexOf("app.get('/metrics/:channel'");
    expect(users).toBeGreaterThan(-1);
    expect(channel).toBeGreaterThan(users);
  });
});
