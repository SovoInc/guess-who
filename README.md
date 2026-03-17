# Guess Who — Midnight Network

A spy-themed Guess Who game running on the [Midnight Network](https://midnight.network). Players interrogate agents to identify a hidden culprit, with final accusations verified on-chain via zero-knowledge proofs.

## Overview

The game is built with Phaser 3 for the frontend and a Node.js sponsor server that manages wallet operations and smart contract interactions. The core mechanic:

1. A random spy is committed on-chain using a ZK proof (culprit ID + salt hashed, commitment stored publicly)
2. The player asks yes/no questions to narrow down the suspects
3. The player accuses someone — the server generates a ZK proof verifying the guess against the stored commitment, without revealing the culprit ID until the proof is verified

**Player lies**: When answering CPU questions, the player can choose to lie. The chain will detect it.
**CPU truth**: The server always answers player questions truthfully.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (Vite + Phaser 3)                          │
│  game/scenes/  — GameScene, MenuScene, BootScene    │
│  game/api.js   — REST calls to sponsor server       │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP :3001
┌──────────────────────▼──────────────────────────────┐
│  Sponsor Server (Node.js + Express)                 │
│  server/src/sponsor-server.ts                       │
│  ├── /api/session/start  (claims pre-gen pool game) │
│  ├── /api/question       (off-chain answer)         │
│  ├── /api/declare        (ZK proof + on-chain tx)   │
│  ├── /api/scores         (leaderboard)              │
│  ├── /api/players        (stats + spy counts)       │
│  ├── /api/achievements   (all player achievements)  │
│  └── /api/dust           (wallet balance check)     │
│                                                     │
│  lib/gameManager.ts  — session logic                │
│  lib/gamePool.ts     — pre-generated game pool      │
│  lib/scores.ts       — leaderboard + player stats   │
│  lib/achievements.ts — achievement definitions/DB   │
│  lib/db.ts           — PostgreSQL schema            │
│  server/src/poolWorker.ts — background pool filler  │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
    ┌──────▼──────┐    ┌──────────▼──────────────────┐
    │ PostgreSQL  │    │ Midnight Preprod Network      │
    │  sessions  │    │  ZK proof server (Docker)     │
    │  game_pool │    │  Indexer + RPC node           │
    │  scores    │    │  GuessWho smart contract      │
    └────────────┘    └────────────────────────────────┘
```

## Smart Contract

Written in [Compact](https://docs.midnight.network/develop/reference/compact/) (`contract/src/guess_who.compact`).

**Ledger state (public):**
- `next_game_id` — auto-incrementing game counter
- `games: Map<game_id, { commitment, active }>` — per-game commitment hash

**Circuits:**
- `create_game()` — commits `hash(culprit_id, salt)` on-chain, returns `game_id`
- `submit_guess(game_id, guess_id)` — ZK proof verifying guess matches committed culprit; returns correct/incorrect

**Witnesses (private):**
- `culprit_id()` — secret spy index (0–15)
- `salt()` — random 32-byte salt

## Pre-generated Game Pool

Generating a ZK proof for `create_game()` takes ~10–25 seconds. To avoid blocking players at game start, a background worker continuously pre-generates games and stores them in a `game_pool` table. When a player starts a session, a ready game is claimed atomically in milliseconds.

Pool behavior:
- Target size configurable via `POOL_TARGET_SIZE` env var (default: 5)
- Refills immediately after each claim
- Falls back to on-demand generation if pool is empty

## Prerequisites

- Node.js 20+
- Docker (for the ZK proof server)
- A Midnight Network wallet seed (64-char hex)
- DUST tokens for transaction fees (obtained from NIGHT UTXOs)
- PostgreSQL (optional — in-memory fallback available)

### Wallet Setup

Generate a wallet seed:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The wallet must be registered and funded with NIGHT tokens on the preprod network to generate DUST for transaction fees. Each on-chain proof consumes DUST tokens.

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `WALLET_SEED` | 64-char hex seed for the server wallet |
| `GUESS_WHO_CONTRACT_ADDRESS` | Deployed contract address (leave blank to auto-deploy) |
| `VITE_API_URL` | Server URL seen by the browser (default: `http://localhost:3001`) |
| `VITE_CONTRACT_ADDRESS` | Same as `GUESS_WHO_CONTRACT_ADDRESS` (for frontend display) |
| `POSTGRES_URL` | PostgreSQL connection string (optional) |
| `POOL_TARGET_SIZE` | Number of pre-generated games to maintain (default: 5) |

## Running

### 1. Start the ZK Proof Server (Docker)

```bash
cd server
docker compose -f proof-server.yml pull
docker compose -f proof-server.yml up -d
```

### 2. Start the Sponsor Server (Preprod)

```bash
npm run server:preprod
```

On first run, a GuessWho contract will be deployed (takes ~30s). Copy the printed contract address into `.env`:

```
GUESS_WHO_CONTRACT_ADDRESS=<printed address>
VITE_CONTRACT_ADDRESS=<same address>
```

Or to start with the proof server in one step:

```bash
npm run server:preprod-ps  # starts proof server + server
```

### 3. Start the Frontend

```bash
npm run dev
```

Open `http://localhost:5173`.

## Recompiling the Contract

If you modify `contract/src/guess_who.compact`:

```bash
npm run compact:guesswho --workspace=contract
```

**Important:** Recompiling changes the verifier keys. Any previously deployed contract will reject new proofs. Clear `GUESS_WHO_CONTRACT_ADDRESS` in `.env` to force a fresh deployment.

## Scoring

- Asking a question that eliminates N agents and then correctly eliminating all N: **COMBO × N = 200N points**
- Partially using intel from a question: **100 points per correctly eliminated agent**
- Guessing with no prior intel: **0 points**
- Correct accusation bonus: `combo_score + elapsed_seconds × 10`
- Wrong accusation or time expiry: **0 points**

## Development

```bash
# Type-check all packages
npm run typecheck --workspaces

# Lint
npm run lint --workspaces

# Build frontend
npm run build

# Check dust balance
curl http://localhost:3001/api/dust
```

## Project Structure

```
guess-who/
├── contract/
│   └── src/
│       ├── guess_who.compact       # Smart contract source
│       └── managed/guess_who/      # Compiled artifacts (generated)
├── game/
│   ├── scenes/                     # Phaser scenes (GameScene, MenuScene...)
│   ├── ui/                         # UI components (NetworkWindow...)
│   ├── api.js                      # REST client
│   ├── constants.js                # Characters, colors, layout
│   ├── main.js                     # Phaser config
│   └── wallet.js                   # Midnight wallet integration
├── lib/
│   ├── db.ts                       # PostgreSQL schema + queries
│   ├── gameManager.ts              # Session creation, question answering
│   ├── gamePool.ts                 # Pre-generated game pool
│   ├── scores.ts                   # Leaderboard + player stats
│   └── achievements.ts             # Achievement definitions + unlock logic
├── server/
│   └── src/
│       ├── api.ts                  # Wallet + contract provider setup
│       ├── config.ts               # Network configs (standalone/preview/preprod)
│       ├── sponsor-server.ts       # Express API server
│       ├── poolWorker.ts           # Background pool refill
│       └── preprod-start-proof-server.ts
├── public/
│   └── managed/guess_who/          # Contract artifacts (copied from contract/)
├── .env.example
└── vite.config.ts
```

## API Reference

Base URL: `http://games.sovo.com`

All endpoints are JSON over HTTP. No authentication required.

---

### Leaderboard

#### `GET /api/scores`

Returns the top 20 correct guesses, ordered by score (desc) then questions used (asc).

```json
{
  "leaderboard": [
    {
      "shielded_address": "m...",
      "score": 950,
      "questions_used": 3,
      "time_elapsed": 87,
      "correct": true,
      "created_at": "2026-03-17T12:00:00Z"
    }
  ]
}
```

---

### Player Stats

#### `GET /api/players`

All players with spy-caught counts and games played.

```json
{
  "players": [
    {
      "shielded_address": "m...",
      "spies_caught": 12,
      "games_played": 20,
      "updated_at": "2026-03-17T12:00:00Z"
    }
  ]
}
```

#### `GET /api/players/:address/stats`

Stats for a single player.

```json
{
  "spies_caught": 12,
  "games_played": 20
}
```

---

### Achievements

#### `GET /api/achievements`

All achievement definitions and every player's unlocks.

```json
{
  "definitions": [
    { "id": "spy_viper", "name": "Viper Exposed", "description": "Caught Viper as the spy." },
    { "id": "spy_cipher", "name": "Cipher Cracked", "description": "Caught Cipher as the spy." }
  ],
  "players": [
    {
      "shielded_address": "m...",
      "achievements": [
        {
          "id": "spy_viper",
          "name": "Viper Exposed",
          "description": "Caught Viper as the spy.",
          "unlocked_at": "2026-03-17T12:00:00Z"
        }
      ]
    }
  ]
}
```

#### `GET /api/players/:address/achievements`

Achievements for a single player.

```json
{
  "achievements": [
    {
      "id": "spy_viper",
      "name": "Viper Exposed",
      "description": "Caught Viper as the spy.",
      "unlocked_at": "2026-03-17T12:00:00Z"
    }
  ]
}
```

Achievement IDs follow the pattern `spy_<agentname>` — one per agent in the roster. New achievements can be added to `lib/achievements.ts` without schema changes.

---

### Game Endpoints (internal — called by game client)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/session/start` | Start a new game session |
| `POST` | `/api/question` | Ask a yes/no question about the spy |
| `POST` | `/api/declare` | Submit final guess, generate ZK proof on-chain |
| `POST` | `/api/scores` | Submit game result (triggers achievement checks, returns `newAchievements`) |
| `GET`  | `/api/status` | Network health (game server, proof server, node, indexer) |
| `GET`  | `/api/dust` | Sponsor wallet DUST token balance |
| `GET/POST` | `/api/proof-server` | Get or set proof server mode (`remote` / `local`) |

---

## Network Comms Panel

The in-game Network Comms panel has three tabs:

- **ALL** — all messages (system events, questions, answers)
- **INTEL** — player questions with CPU answers (green = YES, red = NO)
- **DEBRIEF** — CPU questions and player responses, flagged `[TRUE]` or `[LIE]`
