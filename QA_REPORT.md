# QA Test Report — Guess Who (Proof of Spy)

**Date:** 2026-08-20
**Baseline reviewed:** `1075453`; the fixes recorded below are included in this revision.
**Environment:** local checkout; static analysis, build verification, and code review. No live mainnet session was played against the deployed EC2 instance.

> **Status:** the two High-severity correctness defects (Issues 1 and 2), the unauthenticated
> scoring path (Issue 3), the secret-leaking log and false chain claims (Issue 4), the
> client-only question limit (Issue 9), and the pool-stalling session leak (Issue 6) have
> been resolved. Each is marked **Resolved** below with the fix applied. A unit-test suite
> and a CI quality gate have also been added, closing the zero-coverage finding in §2.

---

## 1. Summary

Guess Who is a single-player deduction game on Midnight. The player narrows a 16-card board to identify a hidden spy; the spy's identity is committed on-chain at game start and the final guess is verified by a ZK proof. A Node/Express "sponsor server" holds the wallet and pays all transaction fees, so players need no funds.

The application builds, the on-chain commitment/reveal design is sound, and the two defects that made games unwinnable or unrewardable have been fixed at their root cause — a duplicated character roster and an achievement list that referenced characters who do not exist.

| Area | Status |
|---|---|
| Frontend build (`npm run build`) | Pass |
| Contract typecheck | Pass |
| Server typecheck | 4 errors — `isSynced` property issues in `server/src/api.ts` against the wallet SDK types, pinned as a baseline so new errors fail CI |
| Automated tests for game logic | 43 tests covering the roster, achievements, session logic, and API compatibility |
| CI quality gate | Tests and typechecks gate the deploy |

**Recommendation:** the player-visible correctness defects are resolved and scoring is now server-authoritative, so the leaderboard reflects play rather than client claims. Two things still overstate the product and should be addressed before wider promotion: the contract does not close a game on a wrong guess (Issue 5), and the ZK circuits have no test coverage. Neither blocks a client demo of current status.

---

## 2. Test coverage

Game-logic coverage was previously **0%** — nothing exercised the board, the roster, the achievements, or any endpoint, and the root `package.json` had no `test` script, so `npm test` did nothing. That absence is what allowed Issues 1 and 2 to reach `main` unnoticed.

**A unit-test suite now covers the defects that shipped — 43 tests, all passing (`npm test`):**

| Suite | Covers |
|---|---|
| `lib/__tests__/roster.test.ts` | Roster shape (32 agents, unique ids, all attributes present, four equal draw buckets); that the roster is imported rather than redeclared by **both** the server and the client, so a second hand-maintained copy fails the build; that every agent has exactly one sprite frame; and that the four previously-divergent attributes match the card art. |
| `lib/__tests__/achievements.test.ts` | That no achievement references a character outside the roster, that no roster agent is left without one, and that `achievementForSpy()` resolves for all 32 agents, is case-insensitive, and returns null rather than a dangling id for an unknown name. |
| `lib/__tests__/gameManager.test.ts` | Board generation (16 distinct agents, contiguous ids, attributes preserved from the roster, deduction constraints satisfied across 60 generated boards); `answerQuestion` answering truthfully from the values the client rendered, across every question category; `evaluateGuess` accepting only the spy; and `deleteSession` blocking a re-declare or further questions once a game has ended. |
| `lib/__tests__/apiCompat.test.ts` | That every endpoint consumed by the external site stays mounted (the leaderboard, player-stats, achievement and `/metrics` paths, including `POST /api/scores`), that the retained `POST /api/scores` records nothing from the request body, and that `/metrics/users/:address` is registered before the `/metrics/:channel` catch-all. |

The suite runs against the in-memory session store, so it needs no database.

Both roster and achievement suites were verified to fail on the original defects: reintroducing the Echo `eyewear` typo fails the card-art test, and adding a phantom `spy_rook` achievement fails the catalogue test.

**Still uncovered:**

| Target | Why it matters |
|---|---|
| Contract circuits via a `GuessWhoSimulator` | The ZK logic remains entirely unverified — the largest remaining gap |
| `/api/declare` end to end | The scoring inputs and session teardown are tested; the handler wiring and on-chain fallback are not |
| Frontend rendering and elimination logic | No frontend tests |

**CI.** `.github/workflows/deploy.yml` now runs a `test` job — unit tests, the server typecheck, and the contract typecheck — and the `deploy` job declares `needs: test`, so a failing test or a new type error stops the release instead of deploying unverified.

Because `server/src/api.ts` carries 4 pre-existing wallet-SDK type errors that cannot be fixed without patching the SDK's published types, the server typecheck runs through `scripts/typecheck-server.sh`, which tolerates exactly those 4 known `isSynced` errors and fails on anything else. This was verified by introducing a deliberate type error, which the script rejected. The final deploy health check is still `sleep 5 && pm2 status`, which reports success as long as the process exists.

### Deployment status

Worth recording separately, because it is independent of the application code:

**The production deploy is failing at the EC2 connection step**, and was already failing before these changes. The `Deploy to EC2` step ends in:

```
ssh: connect to host *** port 22: Connection timed out
```

so nothing reaches the instance — the frontend build succeeds, then every rsync and the PM2 restart are skipped.

**Root cause: the EC2 instance has failed its AWS reachability check.** The host is `mf-games` (`i-0364549066b2aab49`, `t3.medium`, us-east-2, Elastic IP `18.116.1.62`), shared with the sibling shadow-cipher deployment:

```
InstanceState: running
SystemStatus:  ok
InstanceStatus: impaired
  reachability: failed, ImpairedSince 2026-08-10T06:36:00Z
```

It has been unreachable since **10 August**, ten days before these deploys were attempted. This is not a configuration problem: the `proof-of-spy-sg` security group allows port 22 from `0.0.0.0/0`, the subnet's network ACL has only the default catch-all denies, and SSH with the correct key still times out. The console log shows a normal boot that subsequently went unresponsive, consistent with a wedged instance.

Note that `games.sovo.com` resolves to CloudFront, so the site answering HTTPS `200` reflects the CDN serving previously-deployed assets, **not** a healthy origin.

**Recovery.** A stop/start migrates the instance to different underlying hardware and is the standard remedy for a failed reachability check; a plain reboot usually does not clear it. The public address is an Elastic IP, so it survives a stop/start and no DNS change is needed.

One precaution has already been taken: the 20 GB gp3 root volume (`vol-01ca8f98b7bf06c19`) **had no snapshots at all and is flagged delete-on-termination**. This app's leaderboard lives in an external Postgres (`POSTGRES_URL`) and so is not at risk, but the volume does hold `server/wallet-cache/`, the private-state store, and the sibling shadow-cipher app's entire SQLite database. A full snapshot now exists — `snap-0e32c606a5cd054d0`, tagged `mf-games-pre-recovery`, **completed** — so the stop/start is safe to attempt against that backup.

**A recurring snapshot schedule should be added regardless of how this is resolved** — an AWS Backup plan or DLM lifecycle policy on this volume is a few minutes of setup, and its absence is the largest operational risk across both deployments.

**Until the instance is recovered, the live site does not reflect any of the fixes in this report.**

The `test` job runs before the deploy job and passes, so the quality gate is not what is blocking the release.

---

## 3. Known issues

Ordered by player impact.

### Issue 1 — Roster desync makes some boards unwinnable (High) — **Resolved**

The 32-character roster was hand-copied into two files that disagreed on four characters:

| Character | `lib/gameManager.ts` (server) | `game/constants.js` (client) | Card art |
|---|---|---|---|
| Sentinel | `headwear: 'helmet'` | `headwear: 'none'` | bald, no helmet |
| Echo | `eyewear: 'glasses'` | `eyewear: 'none'` | ponytail, no glasses |
| Pulse | `headwear: 'none'` | `headwear: 'cap'` | cap, glasses, headset |
| Nomad | `headwear: 'cap'` | `headwear: 'none'` | bare head, beard |

The server answered questions from its copy; the client eliminated cards using its own. When the spy was one of these four and the question touched the divergent attribute, the server's truthful answer instructed the player to eliminate their own spy — the board became unwinnable with no indication why.

**Fix.** The roster now lives in a single module, `lib/roster.js`, imported by the server (`lib/gameManager.ts`) and the client (`game/constants.js`); neither declares character data any more. The duplication, not the four typos, was the defect, so removing it is what closes the issue.

The four disputed values were resolved against `public/assets/roster.png` — the 96×96 sprite frames the player actually sees, indexed by `ROSTER_FRAME` — and in all four cases the client copy was correct and the server copy carried the typo. The card-art column above records what each frame shows, and `lib/__tests__/roster.test.ts` asserts those four values plus the no-second-copy rule.

### Issue 2 — 9 of 16 achievements can never be unlocked (High) — **Resolved**

`lib/achievements.ts` defined achievements for `rook`, `lancer`, `jade`, `steel`, `iris`, `kade`, `sable`, `wren`, and `zara`. **None of those characters exist in the roster.** `achievementForSpy()` matches on the character name, so those nine could never fire.

The inverse was also true: 23 real characters (Atlas, Falcon, Vega, Titan, Halo, Razor, Sentinel, Raven, Bishop, Hydra, Pulse, Archer, Kraken, Wolf, Talon, Zenith, Frost, Nomad, Ghost, Cobra, Shade, Striker, Loki, Dagger, Vector) awarded nothing when caught. The phantom achievements were published to the Midnight platform via `GET /metrics` and listed as real in `docs/gameplay.md`.

**Fix.** The catalogue is rewritten as exactly one achievement per roster agent — 32 in total, up from 16 — with the seven previously-valid entries kept unchanged. `docs/gameplay.md` now lists the same 32 names. `GET /metrics` needed no change: it derives its list from `ACHIEVEMENTS`, so it stays consistent automatically.

`lib/__tests__/achievements.test.ts` asserts the catalogue and the roster agree in both directions, so neither a phantom entry nor an uncovered agent can reappear.

### Issue 3 — Scores are client-supplied and unauthenticated (High, security) — **Resolved**

`POST /api/scores` accepted `score`, `correct`, `questionsUsed`, and `timeElapsed` directly from the request body and wrote them to the leaderboard with no validation. Anyone could `curl` an arbitrary score onto the leaderboard for any wallet address, and `recordGameResult` would also credit a spy catch.

**Fix.** `/api/declare` now derives every scoring input server-side and records the result itself: `questionsUsed` from a server-side counter, `timeElapsed` from the server's own clock, and the score from those two values, with a wrong guess always scoring zero. The game client displays what the server recorded rather than reporting its own figures. Demo sessions are excluded from recording.

`POST /api/scores` is **retained as a compatibility endpoint**, since it is part of the published API that external callers use. It keeps its exact path and `{ ok, newAchievements }` response shape, but it no longer writes the submitted numbers — it reports the achievements already unlocked for the address and is safe to call repeatedly. That closes the forgery hole and the double-count without breaking any existing caller.

One behavioural difference for integrators: `newAchievements` now reports the spy achievement whenever the player holds it, rather than only on the call that first unlocked it. A caller that announces "new achievement" directly from this field will announce it on every call, and should compare against what it has already shown.

**All read endpoints are unchanged** — `GET /api/scores`, `/api/players`, `/api/players/:address/stats`, `/api/players/:address/achievements`, `/api/achievements`, `/metrics`, `/metrics/users/:address`, and `/metrics/:channel` keep their paths and response shapes, and are still populated by the same recording calls. Anything consuming the leaderboard or achievement data is unaffected.

**A replay hole was found and closed while verifying this.** `/api/declare` previously left the session alive, and because it reveals the spy even on a wrong guess, a player could declare wrongly, read the answer, then declare again for a credited win. The session is now deleted once a guess is evaluated, so a second declare and any further question both fail. This also enforces "a wrong guess ends the game" off-chain; the on-chain half remains open as Issue 5.

One consequence worth flagging: the recorded score formula necessarily changed, because the old client-side combo points cannot be verified by the server. The in-game combo meter is retained as feedback and relabelled `COMBO`, and the scoring section of `docs/gameplay.md` was rewritten to describe what is actually recorded.

### Issue 4 — "Chain verification" of lies is cosmetic (High, correctness of claims) — **Resolved (documentation and labelling)**

`README.md` stated the chain would detect a dishonest answer, and `docs/gameplay.md` said "the chain verification catches it". Neither was true. Lie detection is computed entirely in the browser, and the routine presenting it was a 1800 ms animated progress bar with deliberate randomised stutter:

```js
const totalMs = 1800;
// Slightly erratic speed — stalls and bursts like real chain confirmation
const jitter = Math.random() < 0.15 ? 0 : stepSize * (0.5 + Math.random() * 1.5);
```

No network or chain call occurred, so the `⛓ CHAIN: VERIFIED / DECEPTION DETECTED` banner was presentation only.

Worse, the same code path logged `[LIE CHECK] spy=<name> ...` to the browser console, **printing the player's secret spy** — anyone with devtools open won immediately.

**Fix.** The spy-leaking log is removed. The claims are corrected rather than the mechanism implemented, which the product can support honestly: `README.md` and `docs/gameplay.md` now state that answer consistency is checked locally and that the **final guess** is what a ZK proof verifies on-chain. The UI is relabelled to match — `_runChainVerify` is now `_runAnswerCheck`, and the banner reads `ANSWER CHECK: CONSISTENT / DECEPTION DETECTED`. The animation is retained as feedback, but nothing claims chain involvement for the lie check.

**Still open:** real on-chain lie verification is not implemented. The product no longer claims it, so this is a feature gap rather than a false statement.

### Issue 5 — A wrong guess never closes the game on-chain (Medium)

`contract/src/guess_who.compact:66` only sets `active: false` when the guess is correct:

```
if (is_correct) {
  games.insert(pub_game_id, Game { commitment: game.commitment, active: false });
}
```

The off-chain rule is "a wrong guess ends the game", and the server now enforces it by deleting the session once a guess is evaluated (see Issue 3). The chain, however, still does not: a lost game stays `active: true` forever, can be re-guessed on-chain without limit, and is permanently ineligible for `delete_game` (which asserts `!game.active`).

This undercuts `RUBRIC_ASSESSMENT`, which revises State-Space risk from 2 to 1 on the grounds that completed games can be pruned. In practice **`delete_game` has no caller anywhere in the codebase**, and lost games could not be pruned even if it did. The score revision is not supported by the shipped code.

### Issue 6 — Abandoned sessions permanently stall the game pool (Medium) — **Resolved**

`activeGameSessions` was incremented when a session was created but decremented only inside `/api/declare`. A player who closed the tab never decremented it, and the TTL sweep deleted the session entry without touching the counter.

Because `poolWorker.ts` refuses to refill while `isGameSessionActive()` is true, a handful of abandoned games permanently disabled pool generation. Every subsequent player then fell through to the slow on-demand path (~10-25 s of proving) or got no on-chain game at all — gradual production degradation that would never appear in a log as an error.

**Fix.** The TTL sweep now decrements the counter for each session it expires, clamped at zero, and prunes the per-session question/timing state at the same time, so pool refill recovers after abandoned games.

### Issue 7 — On-chain failures are reported to the player as success (Medium)

`server/src/sponsor-server.ts:312-315` swallows a failed proof submission:

```js
} catch (onChainErr) {
  logger.warn(`On-chain guess skipped (${msg})`);
}
```

The response still returns the off-chain `correct` value with `onChain: null`. The player wins, the score is recorded, and no proof ever reached the chain. The only signal is a small orange `ON-CHAIN: PROOF SKIPPED` line (`GameScene.js:1499`). For a product whose value proposition is on-chain verification, a silent fallback to unverified play should at minimum be surfaced clearly.

### Issue 8 — Single DUST coin limits the game to one concurrent player (Medium, by design)

Documented honestly in `docs/midnight-integration.md`: the sponsor wallet holds one DUST coin, so `onChainQueue.ts` serialises all transactions and pool refill pauses during active sessions. Effectively single-concurrent-player.

Note the reservation logic does not work as intended. `onChainQueue.ts:6` sets `MAX_POOL_CONCURRENT = MAX_CONCURRENT` (both 1), so the guard at line 20 intended to stop a pool refill taking the last slot is unreachable — line 13 has already returned. A pool refill can occupy the only slot ahead of a queued player declare. `poolInFlight` is incremented and decremented but never read.

### Issue 9 — Question limit is enforced only on the client (Low) — **Resolved**

`MAX_QUESTIONS = 10` was enforced only in `GameScene.js`; `POST /api/question` had no counter and would answer indefinitely. Combined with Issue 3, the "questions used" figure on the leaderboard was not trustworthy.

**Fix.** The server keeps an authoritative per-session question counter, `POST /api/question` rejects with 403 once the limit is reached, and `/api/declare` scores from that counter rather than from a client-supplied figure.

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

- ~~`GameScene.js:1493` — `} catch (e) {}` around the entire `submitScore()` call. Score and achievements are lost with no user feedback.~~ **Fixed** — that call is gone; the server records the score during `/api/declare`, so there is no separate client submission to swallow.
- `sponsor-server.ts:293` — bare `catch` in `/api/status` flattens every failure to `ok: false` with no reason.
- `lib/db.ts:42,43,56,57,87` — five `.catch(() => {})` on schema migrations. A failed migration is invisible.
- `poolWorker.ts:58-63` — retry loop with no backoff and no attempt cap; a persistent failure such as zero DUST produces an endless 5-second error loop.

---

## 5. Suggested priorities

Resolved in this revision: Issues 1, 2, 3, 4 (claims and the spy leak), 6, and 9, plus the zero test coverage and missing CI gate from §2.

Remaining, in recommended order:

1. **Set `active: false` on an incorrect guess and wire up `delete_game`** (Issue 5). The off-chain rule is now enforced — a declared session is deleted — but the contract still leaves a lost game `active: true` forever, so it can be re-guessed on-chain and never pruned. This is the largest remaining gap between the shipped code and the documented design.
2. Add a `GuessWhoSimulator` test suite for the circuits — the ZK logic has no coverage at all.
3. Surface on-chain failure to the player instead of reporting a skipped proof as a win (Issue 7).
4. Fix the `MAX_POOL_CONCURRENT` reservation logic, which is unreachable as written (Issue 8).
5. Point the wallet at the configured network rather than hardcoding mainnet (Issue 10).
6. Clear the documentation and configuration drift, and delete the dead `/api/game/*` client calls (Issue 11).
7. Untrack the committed runtime state and review `server/wallet-cache/` for secrets (Issue 12).
8. Either implement real on-chain lie verification or leave the now-honest local check as designed (Issue 4).
