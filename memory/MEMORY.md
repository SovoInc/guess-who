# Guess Who / Ghost Cypher — Project Memory

## Architecture
- Game: Phaser 3 frontend (`game/`)
- Server: Express sponsor server (`server/src/sponsor-server.ts`) on port 3001
- Contract: GuessWho Compact contract (`contract/src/guess_who.compact`) — NOT the Counter contract
- The Counter contract is legacy/example code only — do not use it for game logic
- All on-chain interactions go through the sponsor server; the frontend only needs the shielded address from Lace

## Contract
- GuessWho contract has two circuits: `create_game(commitment)` and `submit_guess(game_id, guess_id)`
- Contract address stored in `GUESS_WHO_CONTRACT_ADDRESS` env var
- `src/midnight.ts` still has Counter references — these are dead code

## Wallet Connect
- Frontend connects Lace wallet only to get the shielded address
- No contract joining needed on the frontend side
- `window.__midnightConnectedApi` stores the connected API

## DB
- Uses Postgres when `POSTGRES_URL` is set, otherwise in-memory (`memSessions`)
- DB errors surface with `{ err }` in pino logger for full stack traces
