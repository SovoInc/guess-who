/**
 * Contract circuit tests, run against the committed build of the contract
 * (no Compact compiler required — the toolchain on hand is older than the
 * `pragma language_version >= 0.20` the source declares).
 *
 * The commit/reveal design is the product's core claim: the spy's identity is
 * committed on chain at game start and the final guess is verified by a ZK proof
 * without revealing the spy. None of it had coverage.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GuessWho, guessWhoWitnesses, type GuessWhoPrivateState } from '../../contract/src/index.js';

const SALT_A = new Uint8Array(32).fill(3);
const SALT_B = new Uint8Array(32).fill(11);

const privateState = (culpritId: number, salt: Uint8Array = SALT_A): GuessWhoPrivateState => ({
  culpritId,
  salt,
});

describe('the shipped contract surface', () => {
  it('exposes exactly the three circuits the product uses', () => {
    const contract = new GuessWho.Contract(guessWhoWitnesses);
    expect(Object.keys(contract.circuits).sort()).toEqual([
      'create_game',
      'delete_game',
      'submit_guess',
    ]);
  });

  it('offers each circuit in both impure and provable form', () => {
    // The server calls through contract.circuits; the proof path uses
    // impureCircuits. Both must carry all three or a call site breaks.
    const contract = new GuessWho.Contract(guessWhoWitnesses);
    for (const name of ['create_game', 'submit_guess', 'delete_game'] as const) {
      expect(typeof contract.circuits[name], name).toBe('function');
      expect(typeof contract.impureCircuits[name], name).toBe('function');
    }
  });

  it('exposes a ledger reader for the games map', () => {
    expect(typeof GuessWho.ledger).toBe('function');
  });
});

describe('the witnesses that feed the commitment', () => {
  it('returns the culprit id as a field element', () => {
    const [, id] = guessWhoWitnesses.culprit_id({ privateState: privateState(7) } as never);
    expect(id).toBe(7n);
  });

  it('covers every board position, 0 through 15', () => {
    for (let i = 0; i <= 15; i++) {
      const [, id] = guessWhoWitnesses.culprit_id({ privateState: privateState(i) } as never);
      expect(id).toBe(BigInt(i));
    }
  });

  it('returns a 32-byte salt byte-for-byte', () => {
    const [, salt] = guessWhoWitnesses.salt({ privateState: privateState(0, SALT_B) } as never);
    expect(salt.length).toBe(32);
    expect(Buffer.from(salt).equals(Buffer.from(SALT_B))).toBe(true);
  });

  it('leaves the private state unmodified', () => {
    // A witness that mutated state would desynchronise the commitment from what
    // submit_guess later proves against.
    const ps = privateState(9);
    const snapshot = { culpritId: ps.culpritId, salt: Uint8Array.from(ps.salt) };

    const [afterId] = guessWhoWitnesses.culprit_id({ privateState: ps } as never);
    const [afterSalt] = guessWhoWitnesses.salt({ privateState: ps } as never);

    expect(afterId).toBe(ps);
    expect(afterSalt).toBe(ps);
    expect(ps.culpritId).toBe(snapshot.culpritId);
    expect(Buffer.from(ps.salt).equals(Buffer.from(snapshot.salt))).toBe(true);
  });

  it('distinguishes two games that share a culprit but not a salt', () => {
    const [, a] = guessWhoWitnesses.salt({ privateState: privateState(4, SALT_A) } as never);
    const [, b] = guessWhoWitnesses.salt({ privateState: privateState(4, SALT_B) } as never);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe('submit_guess closes the game (QA Issue 5)', () => {
  // The documented rule is that a wrong guess ends the game. The server enforces
  // it off-chain by deleting the session, but the circuit still writes
  // `active: false` only when the guess is correct — so a lost game stays active
  // on chain forever, re-guessable and never prunable by delete_game.
  //
  // This test asserts the CURRENT (defective) shape so the omission is visible
  // in the suite rather than only in prose. When the circuit is fixed — moving
  // the games.insert out of the `if (is_correct)` block, which needs a Compact
  // >= 0.20 toolchain to recompile the keys — this test should be inverted to
  // assert the unconditional write instead.
  const source = readFileSync(
    fileURLToPath(new URL('../../contract/src/guess_who.compact', import.meta.url)),
    'utf8',
  );

  it('still writes active:false only inside the is_correct branch', () => {
    const guard = source.indexOf('if (is_correct)');
    const write = source.indexOf('active: false');
    expect(guard, 'is_correct guard not found').toBeGreaterThan(-1);
    expect(write, 'active:false write not found').toBeGreaterThan(-1);
    // The write sits after the guard, i.e. inside it — the defect.
    expect(write).toBeGreaterThan(guard);
  });

  it('documents that delete_game requires an inactive game', () => {
    // This is why the omission above matters: a lost game can never be pruned.
    expect(source).toMatch(/!game\.active|not active/);
  });
});
