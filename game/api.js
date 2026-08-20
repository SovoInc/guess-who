const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function startSession(demo = false) {
  const res = await fetch(`${BASE}/api/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ demo }),
  });
  if (!res.ok) throw new Error('Failed to start session');
  return res.json();
}

export async function askQuestion(sessionId, category, value) {
  const res = await fetch(`${BASE}/api/question`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, category, value }),
  });
  if (!res.ok) throw new Error('Failed to ask question');
  return res.json(); // { answer: 'YES' | 'NO' }
}

export async function declareSpy(sessionId, guessId, shieldedAddress, contractAddress = null, gameId = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min
  try {
    const res = await fetch(`${BASE}/api/declare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, guessId, shieldedAddress, contractAddress, gameId }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('Failed to declare spy');
    // Score, questionsUsed and timeElapsed are computed server-side;
    // achievements are awarded server-side in the same call.
    return res.json(); // { correct, spy, onChain, score, questionsUsed, timeElapsed, newAchievements }
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkLocalProofServer() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('http://localhost:6300', { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok || res.status < 500; // any response means it's running
  } catch {
    return false;
  }
}

export async function getNetworkStatus() {
  const res = await fetch(`${BASE}/api/status`);
  if (!res.ok) throw new Error('Failed to get status');
  return res.json(); // { proofServer: bool, node: bool, indexer: bool }
}

export async function getProofServerMode() {
  const res = await fetch(`${BASE}/api/proof-server`);
  if (!res.ok) throw new Error('Failed to get proof server mode');
  return res.json(); // { url, mode: 'local' | 'remote' }
}

export async function setProofServerMode(mode) {
  const res = await fetch(`${BASE}/api/proof-server`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error('Failed to set proof server mode');
  return res.json();
}

export async function getScores() {
  const res = await fetch(`${BASE}/api/scores`);
  if (!res.ok) throw new Error('Failed to get scores');
  return res.json(); // { leaderboard: [...] }
}

export async function getPlayerStats(shieldedAddress) {
  const res = await fetch(`${BASE}/api/players/${encodeURIComponent(shieldedAddress)}/stats`);
  if (!res.ok) throw new Error('Failed to get player stats');
  return res.json(); // { spies_caught, games_played }
}

export async function getPlayerAchievements(shieldedAddress) {
  const res = await fetch(`${BASE}/api/players/${encodeURIComponent(shieldedAddress)}/achievements`);
  if (!res.ok) throw new Error('Failed to get achievements');
  return res.json(); // { achievements: [{id, name, description, unlocked_at}] }
}

export async function getAllAchievements() {
  const res = await fetch(`${BASE}/api/achievements`);
  if (!res.ok) throw new Error('Failed to get achievements');
  return res.json(); // { definitions, players }
}

/**
 * Deploy a GuessWho contract on-chain for a new game.
 * Sends the commitment (hash of culpritId + salt) to the server which deploys the contract.
 * Returns { contractAddress } — the address is the on-chain game ID.
 *
 * NOTE: culpritId and salt are sent to the server here so it can hold the private state
 * for the submitGuess proof. This is acceptable for the current architecture where the
 * server is trusted (it knows the culprit anyway via gameManager).
 *
 * @param {string} commitment - hex-encoded 32-byte commitment
 * @param {number} culpritId - 0–15
 * @param {string} salt - hex-encoded 32-byte salt
 */
export async function createOnChainGame(commitment, culpritId, salt) {
  const res = await fetch(`${BASE}/api/game/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commitment, culpritId, salt }),
  });
  if (res.status === 501) return null; // contract not compiled yet — skip gracefully
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to create on-chain game');
  }
  return res.json(); // { contractAddress }
}

/**
 * Submit the player's final guess on-chain.
 * The server holds the private state (culpritId + salt) and generates the ZK proof.
 * Returns { correct, txId }.
 *
 * @param {string} contractAddress - the game's contract address (from createOnChainGame)
 * @param {number} guessId - the character id the player is accusing
 * @param {number} culpritId - the actual culprit (server validates this)
 * @param {string} salt - hex-encoded salt
 */
export async function submitOnChainGuess(contractAddress, guessId, culpritId, salt) {
  const res = await fetch(`${BASE}/api/game/guess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contractAddress, guessId, culpritId, salt }),
  });
  if (res.status === 501) return null; // contract not compiled yet — skip gracefully
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to submit on-chain guess');
  }
  return res.json(); // { correct, txId }
}
