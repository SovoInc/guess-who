#!/usr/bin/env bash
# Server typecheck with a known-error baseline.
#
# server/src/api.ts has 4 pre-existing errors: the wallet SDK's published types
# omit `isSynced` on UnshieldedWalletState and DustWalletState, which the code
# reads. They are unrelated to game logic and cannot be fixed here without
# patching the SDK types, so they are tolerated — but the count is pinned, so any
# NEW type error fails the build instead of hiding behind them.
#
# When the SDK is upgraded and the property is typed, drop BASELINE to 0.
set -uo pipefail

BASELINE=4

cd "$(dirname "$0")/.."
output=$(npx tsc -p server/tsconfig.json --noEmit 2>&1)
count=$(printf '%s\n' "$output" | grep -c 'error TS' || true)

unexpected=$(printf '%s\n' "$output" | grep 'error TS' | grep -v "Property 'isSynced' does not exist" || true)

if [ -n "$unexpected" ]; then
  echo "New type errors (not in the isSynced baseline):"
  printf '%s\n' "$unexpected"
  exit 1
fi

if [ "$count" -gt "$BASELINE" ]; then
  echo "Type error count rose to $count (baseline $BASELINE):"
  printf '%s\n' "$output" | grep 'error TS'
  exit 1
fi

echo "Server typecheck OK — $count/$BASELINE known SDK errors, no new ones."
