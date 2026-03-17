// Semaphore-based concurrency control for on-chain transactions.
// We have a single DUST coin so only one transaction can run at a time.
// User transactions (declare) take priority over pool refill transactions.

const MAX_CONCURRENT = 1;
const MAX_POOL_CONCURRENT = MAX_CONCURRENT; // pool can use the slot, user declares take priority

let inFlight = 0;
let poolInFlight = 0;
const waiters: Array<{ priority: boolean; resolve: () => void }> = [];

function tryDispatch() {
  if (inFlight >= MAX_CONCURRENT) return;
  // Prefer user (priority) waiters first
  const priorityIdx = waiters.findIndex(w => w.priority);
  const idx = priorityIdx !== -1 ? priorityIdx : 0;
  if (waiters.length === 0) return;
  // Don't dispatch a pool waiter if it would consume the last slot
  const candidate = waiters[idx];
  if (!candidate.priority && inFlight >= MAX_POOL_CONCURRENT) return;
  waiters.splice(idx, 1);
  inFlight++;
  if (!candidate.priority) poolInFlight++;
  candidate.resolve();
}

function acquire(priority: boolean): Promise<void> {
  return new Promise(resolve => {
    waiters.push({ priority, resolve });
    tryDispatch();
  });
}

function release(wasPool: boolean) {
  inFlight--;
  if (wasPool) poolInFlight--;
  tryDispatch();
}

export async function enqueueOnChain<T>(fn: () => Promise<T>): Promise<T> {
  await acquire(true);
  try {
    return await fn();
  } finally {
    release(false);
  }
}

export async function enqueuePoolRefill<T>(fn: () => Promise<T>): Promise<T> {
  await acquire(false);
  try {
    return await fn();
  } finally {
    release(true);
  }
}
