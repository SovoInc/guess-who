# QA Test Report — Guess Who (Proof of Spy)

**Date:** 2026-08-06
**Commit under test:** `c762ecd`
**Environment:** local checkout; static analysis, build verification, and code review. No live mainnet session was played against the deployed EC2 instance.

---

## 1. Summary

Guess Who is a single-player deduction game on Midnight. The player narrows a 16-card board to identify a hidden spy; the spy's identity is committed on-chain at game start and the final guess is verified by a ZK proof. A Node/Express "sponsor server" holds the wallet and pays all transaction fees, so players need no funds.

The application builds and the on-chain commitment/reveal design is sound. However **automated test coverage for this game is zero**, and testing surfaced two defects that make games unwinnable or unrewardable through no fault of the player.

| Area | Status |
|---|---|
| Frontend build (`npm run build`) | Pass |
| Contract typecheck | Pass |
| Server typecheck | 4 errors — `isSynced` property issues in `server/src/api.ts` against the wallet SDK types |
| Automated tests for game logic | **None** |
| CI quality gate | **None** — deploys unverified |

**Recommendation:** not ready for an unattended public release. Issues 1 and 2 are player-visible correctness bugs and should be fixed before further promotion. The absence of any regression test around the roster and scoring logic is what allowed both to reach `main` unnoticed.

---

## 2. Test coverage

This is the most significant finding of the exercise.

**There are no tests for this game — game-logic coverage is 0%.** Nothing exercises `create_game`, `submit_guess`, `delete_game`, the commitment check, any of the ~15 REST endpoints, or anything in `lib/`. There are no frontend tests, and the root `package.json` has no `test` script, so `npm test` does nothing.

**Untested, and highest-value to cover first:**

| Target | Why it matters |
|---|---|
| `lib/gameManager.ts` — board generation, `answerQuestion`, `evaluateGuess` | Where Issue 1 lives; pure functions, trivial to test |
| Roster parity between server and client | Would have caught Issue 1 outright |
| `lib/achievements.ts` — `achievementForSpy()` | Would have caught Issue 2 outright |
| Contract circuits via a `GuessWhoSimulator` | The ZK logic is entirely unverified |
| `/api/declare` and `/api/scores` | The scoring and on-chain path |

**CI.** `.github/workflows/deploy.yml` is the only workflow. It runs `npm ci && npm run build`, then rsyncs to EC2 and restarts PM2. There is **no test, lint, or typecheck step** — every push to `main` deploys to production unverified. The final health check is `sleep 5 && pm2 status`, which reports success as long as the process exists.

---

## 3. Known issues

Ordered by player impact.

### Issue 1 — Roster desync makes some boards unwinnable (High)

The 32-character roster is hand-copied into two files that disagree on four characters:

| Character | `lib/gameManager.ts` (server) | `game/constants.js` (client) |
|---|---|---|
| Sentinel | `headwear: 'helmet'` | `headwear: 'none'` |
| Echo | `eyewear: 'glasses'` | `eyewear: 'none'` |
| Pulse | `headwear: 'none'` | `headwear: 'cap'` |
| Nomad | `headwear: 'cap'` | `headwear: 'none'` |

The server answers questions from its copy (`lib/gameManager.ts:191`); the client eliminates cards using its own. When the spy is one of these four and the question touches the divergent attribute, the server's truthful answer instructs the player to eliminate their own spy — the board becomes unwinnable and the player cannot tell why.

*Repro:* start sessions until the spy is Echo, ask "Does your spy wear glasses?", and observe that the server answers YES while the client card shows no eyewear.

*Fix:* make the roster a single shared module imported by both sides. The duplication, not the four typos, is the defect.

### Issue 2 — 9 of 16 achievements can never be unlocked (High)

`lib/achievements.ts:21-39` defines achievements for `rook`, `lancer`, `jade`, `steel`, `iris`, `kade`, `sable`, `wren`, and `zara`. **None of these characters exist in the roster.** `achievementForSpy()` (line 46) matches on the character name, so these nine can never fire.

The inverse is also true: 23 real characters (Atlas, Falcon, Vega, Titan, Halo, Razor, Sentinel, Raven, Bishop, Hydra, Pulse, Archer, Kraken, Wolf, Talon, Zenith, Frost, Nomad, Ghost, Cobra, Shade, Striker, Loki, Dagger, Vector) award nothing when caught.

These phantom achievements are published to the Midnight platform via `GET /metrics` (`server/src/sponsor-server.ts:459-472`) and listed as real in `docs/gameplay.md:117-119`.

### Issue 3 — Scores are client-supplied and unauthenticated (High, security)

`POST /api/scores` accepts `score`, `correct`, `questionsUsed`, and `timeElapsed` directly from the request body and writes them to the leaderboard with no server-side validation (`server/src/sponsor-server.ts:356-390`). There is no auth on any endpoint and no rate limiting. Anyone can `curl` an arbitrary score onto the leaderboard for any wallet address, and `recordGameResult` will also credit a spy catch.

The server already knows the true outcome — `evaluateGuess()` computes it during `/api/declare`. The score should be derived there, not accepted from the client.

### Issue 4 — "Chain verification" of lies is cosmetic (High, correctness of claims)

`README.md:13` states the chain will detect a dishonest answer, and `docs/gameplay.md:71` says "the chain verification catches it". Neither is true.

Lie detection is computed entirely in the browser from client-side data (`game/scenes/GameScene.js:1687-1693`), and `_runChainVerify()` (`game/scenes/GameScene.js:1024-1049`) is a 1800 ms animated progress bar with deliberate randomised stutter:

```js
const totalMs = 1800;
// Slightly erratic speed — stalls and bursts like real chain confirmation
const jitter = Math.random() < 0.15 ? 0 : stepSize * (0.5 + Math.random() * 1.5);
```

No network or chain call occurs. The `⛓ CHAIN: VERIFIED / DECEPTION DETECTED` banner is presentation only. Either implement the check or reword the docs — as written the product overstates what the chain does.

Related: line 1693 logs `[LIE CHECK] spy=<name> ...` to the browser console, **printing the player's secret spy**. Anyone with devtools open wins immediately.

### Issue 5 — A wrong guess never closes the game on-chain (Medium)

`contract/src/guess_who.compact:66` only sets `active: false` when the guess is correct:

```
if (is_correct) {
  games.insert(pub_game_id, Game { commitment: game.commitment, active: false });
}
```

The off-chain rule is "a wrong guess ends the game" (`docs/gameplay.md:66`), but the chain does not enforce it. A lost game stays `active: true` forever, can be re-guessed on-chain without limit, and is permanently ineligible for `delete_game` (which asserts `!game.active`).

This undercuts `RUBRIC_ASSESSMENT`, which revises State-Space risk from 2 to 1 on the grounds that completed games can be pruned. In practice **`delete_game` has no caller anywhere in the codebase**, and lost games could not be pruned even if it did. The score revision is not supported by the shipped code.

### Issue 6 — Abandoned sessions permanently stall the game pool (Medium)

`activeGameSessions` is incremented at `server/src/sponsor-server.ts:210` but decremented only inside `/api/declare` (line 272). A player who closes the tab never decrements it. The TTL sweep at lines 34-39 deletes the session entry but **does not touch the counter**.

Because `poolWorker.ts:30` refuses to refill while `isGameSessionActive()` is true, a handful of abandoned games permanently disables pool generation. Every subsequent player then falls through to the slow on-demand path (~10-25 s of proving) or gets no on-chain game at all. This is a plausible cause of gradual production degradation that would not appear in any log as an error.

### Issue 7 — On-chain failures are reported to the player as success (Medium)

`server/src/sponsor-server.ts:264-267` swallows a failed proof submission:

```js
} catch (onChainErr) {
  logger.warn(`On-chain guess skipped (${msg})`);
}
```

The response still returns the off-chain `correct` value with `onChain: null`. The player wins, the score is recorded, and no proof ever reached the chain. The only signal is a small orange `ON-CHAIN: PROOF SKIPPED` line (`GameScene.js:1499`). For a product whose value proposition is on-chain verification, a silent fallback to unverified play should at minimum be surfaced clearly.

### Issue 8 — Single DUST coin limits the game to one concurrent player (Medium, by design)

Documented honestly in `docs/midnight-integration.md`: the sponsor wallet holds one DUST coin, so `onChainQueue.ts` serialises all transactions and pool refill pauses during active sessions. Effectively single-concurrent-player.

Note the reservation logic does not work as intended. `onChainQueue.ts:6` sets `MAX_POOL_CONCURRENT = MAX_CONCURRENT` (both 1), so the guard at line 20 intended to stop a pool refill taking the last slot is unreachable — line 13 has already returned. A pool refill can occupy the only slot ahead of a queued player declare. `poolInFlight` is incremented and decremented but never read.

### Issue 9 — Question limit is enforced only on the client (Low)

`MAX_QUESTIONS = 10` is enforced in `GameScene.js`; `POST /api/question` has no counter and will answer indefinitely. Combined with Issue 3, the "questions used" figure on the leaderboard is not trustworthy.

### Issue 10 — Wallet connects to the wrong network (Low)

`game/wallet.js:44` hardcodes `walletEntry.connect('mainnet')` while the server can be started against preprod (`npm run server:preprod`).

### Issue 11 — Documentation and configuration drift (Low)

- `src/midnight.ts:1` imports `@midnight-ntwrk/ledger-v7`, which is not in `package.json`; the rest of the app uses `ledger-v8`.
- `README.md:110` gives `POOL_TARGET_SIZE` default as 5; `poolWorker.ts:8` uses 10.
- README's circuit list omits `delete_game`.
- Session TTL is 30 min in `gameManager.ts:141` / `db.ts:38` but 1 hour in `sponsor-server.ts:35`.
- `game/api.js:121,145` call `POST /api/game/create` and `POST /api/game/guess`, neither of which is registered on the server. Dead code.
- `POST /api/proof-server` (`sponsor-server.ts:320`) is unauthenticated and lets any caller repoint the server's proof provider at runtime.
- `index.html` sets `min-width: 1280px` — the game is desktop-only with no mobile or responsive support.
- `components/WalletConnect.tsx:65` dynamically imports `joinCounter` from `src/midnight.ts`, which does not export it. The component is unreferenced dead code and the import is dynamic, so the build does not catch it — but it would throw at runtime if ever mounted.

### Issue 12 — Runtime state committed to the repository (Low, hygiene)

`.env` is correctly gitignored. However `server/logs/`, `server/midnight-level-db*/` (the private-state store), `server/wallet-cache/`, `dist/`, and `.next/` are tracked despite matching `.gitignore` patterns — they were committed before the rules were added. `server/wallet-cache/` warrants a secrets review.

---

## 4. Silent failure paths

Worth noting collectively, since they make the issues above harder to diagnose in production:

- `GameScene.js:1493` — `} catch (e) {}` around the entire `submitScore()` call. Score and achievements are lost with no user feedback.
- `sponsor-server.ts:293` — bare `catch` in `/api/status` flattens every failure to `ok: false` with no reason.
- `lib/db.ts:42,43,56,57,87` — five `.catch(() => {})` on schema migrations. A failed migration is invisible.
- `poolWorker.ts:58-63` — retry loop with no backoff and no attempt cap; a persistent failure such as zero DUST produces an endless 5-second error loop.

---

## 5. Suggested priorities

1. Fix the roster desync (Issue 1) and add a parity test — highest player impact, cheapest fix.
2. Reconcile the achievement list against the roster (Issue 2).
3. Derive scores server-side in `/api/declare` (Issue 3).
4. Either implement on-chain lie verification or correct the docs (Issue 4).
5. Add a CI job running typecheck and lint before deploy; the deploy workflow currently gates on nothing.
6. Decrement `activeGameSessions` in the TTL sweep (Issue 6).
7. Set `active: false` on an incorrect guess and wire up `delete_game` (Issue 5).
