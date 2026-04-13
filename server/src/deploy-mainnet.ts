import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';
dotenv({ path: resolve(new URL(import.meta.url).pathname, '..', '..', '..', '.env') });
import { MainnetConfig } from './config.js';
import { buildWalletAndWaitForFunds, configureGuessWhoProviders, deployGuessWho, withStatus, setLogger } from './api.js';
import { createLogger } from './logger-utils.js';

const seed = process.env.WALLET_SEED;
if (!seed) throw new Error('WALLET_SEED environment variable is required');

const config = new MainnetConfig();
const logger = await createLogger(config.logDir);
setLogger(logger);

const walletCtx = await withStatus('Building wallet and waiting for funds', () =>
  buildWalletAndWaitForFunds(config, seed),
);

const providers = await withStatus('Configuring providers', () =>
  configureGuessWhoProviders(walletCtx, config),
);

const { contractAddress } = await withStatus('Deploying GuessWho contract', () =>
  deployGuessWho(providers),
);

console.log(`
──────────────────────────────────────────────────────────────
  GUESS WHO CONTRACT DEPLOYED
  Address: ${contractAddress}
  Add to .env:
    GUESS_WHO_CONTRACT_ADDRESS=${contractAddress}
    VITE_CONTRACT_ADDRESS=${contractAddress}
──────────────────────────────────────────────────────────────
`);

process.exit(0);
