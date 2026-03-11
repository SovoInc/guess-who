// Counter private state (kept for counter compat)
export type CounterPrivateState = {
  privateCounter: number;
};

export const witnesses = {};

// GuessWho private state — holds the secret culprit id and per-game salt
export type GuessWhoPrivateState = {
  culpritId: number;   // 0–15, the character index — stays private
  salt: Uint8Array;    // 32 random bytes, generated fresh per game
};

export const guessWhoWitnesses = {
  culprit_id: ({ privateState }: { privateState: GuessWhoPrivateState }): [GuessWhoPrivateState, bigint] => {
    return [privateState, BigInt(privateState.culpritId)];
  },
  salt: ({ privateState }: { privateState: GuessWhoPrivateState }): [GuessWhoPrivateState, Uint8Array] => {
    return [privateState, privateState.salt];
  },
};
