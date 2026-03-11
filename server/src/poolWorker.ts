import { randomBytes } from 'crypto';
import { type Logger } from 'pino';
import { createOnChainGame, getDustBalance } from './api.js';
import { addToPool, getPoolSize } from '../../lib/gamePool.js';

const TARGET_SIZE = parseInt(process.env.POOL_TARGET_SIZE ?? '5', 10);
const RETRY_DELAY_MS = 5_000;

// Serialize on-chain calls to avoid LevelDB lock contention
let onChainQueue: Promise<void> = Promise.resolve();
function enqueueOnChain<T>(fn: () => Promise<T>): Promise<T> {
  const next = onChainQueue.then(() => fn());
  onChainQueue = next.then(() => {}, () => {});
  return next;
}

export async function runPoolRefill(
  providers: unknown,
  contractAddress: string,
  log: Logger,
  walletCtx?: import('./api.js').WalletContext,
): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      if (walletCtx) {
        const dust = await getDustBalance(walletCtx.wallet);
        log.info(`Dust balance: ${dust.available} (${dust.availableCoins} coins available, ${dust.pendingCoins} pending)`);
        if (dust.available === 0n && dust.pendingCoins === 0) {
          log.warn('Dust balance is zero — transactions will fail until dust is generated');
        }
      }

      let size = await getPoolSize();
      while (size < TARGET_SIZE) {
        const culpritId = Math.floor(Math.random() * 16);
        const salt = randomBytes(32).toString('hex');
        const index = size + 1;
        log.info(`Pool refill: generating game ${index}/${TARGET_SIZE} (culpritId=${culpritId})`);
        try {
          const privateState = { culpritId, salt: hexToBytes(salt) };
          const onChain = await enqueueOnChain(() =>
            createOnChainGame(providers, contractAddress, privateState)
          );
          await addToPool({
            gameId: onChain.gameId,
            culpritId,
            salt,
            contractAddress,
          });
          log.info(`Pool refill: game added to pool (game_id=${onChain.gameId}, pool size now ${size + 1})`);
          size++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn(`Pool refill: failed to generate game (${msg}), retrying in ${RETRY_DELAY_MS / 1000}s`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`Pool refill: error checking pool size (${msg}), retrying in ${RETRY_DELAY_MS / 1000}s`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
