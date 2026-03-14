// Semaphore-based concurrency control for on-chain transactions.
// Each dust coin can fund one transaction at a time. We allow up to
// MAX_CONCURRENT transactions in parallel (one per available dust coin).
// User transactions (declare) take priority over pool refill transactions.

const MAX_CONCURRENT = 2;

let inFlight = 0;
let userPending = 0;
const waiters: Array<{ priority: boolean; resolve: () => void }> = [];

function tryDispatch() {
  if (inFlight >= MAX_CONCURRENT) return;
  // Prefer user (priority) waiters first
  const idx = waiters.findIndex(w => w.priority) !== -1
    ? waiters.findIndex(w => w.priority)
    : 0;
  if (waiters.length === 0) return;
  const [waiter] = waiters.splice(idx, 1);
  inFlight++;
  waiter.resolve();
}

function acquire(priority: boolean): Promise<void> {
  return new Promise(resolve => {
    waiters.push({ priority, resolve });
    tryDispatch();
  });
}

function release() {
  inFlight--;
  tryDispatch();
}

export async function enqueueOnChain<T>(fn: () => Promise<T>): Promise<T> {
  userPending++;
  await acquire(true);
  userPending--;
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function enqueuePoolRefill<T>(fn: () => Promise<T>): Promise<T> {
  await acquire(false);
  try {
    return await fn();
  } finally {
    release();
  }
}
