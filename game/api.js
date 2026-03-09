const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function startSession() {
  const res = await fetch(`${BASE}/api/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export async function declareSpy(sessionId, guessId, shieldedAddress) {
  const res = await fetch(`${BASE}/api/declare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, guessId, shieldedAddress }),
  });
  if (!res.ok) throw new Error('Failed to declare spy');
  return res.json(); // { correct, spyId, spy, proof }
}

export async function getScores() {
  const res = await fetch(`${BASE}/api/scores`);
  if (!res.ok) throw new Error('Failed to get scores');
  return res.json(); // { leaderboard: [...] }
}

export async function submitScore(shieldedAddress, score) {
  const res = await fetch(`${BASE}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shieldedAddress, score }),
  });
  if (!res.ok) throw new Error('Failed to submit score');
  return res.json();
}
