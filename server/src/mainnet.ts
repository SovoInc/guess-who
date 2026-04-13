import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';
dotenv({ path: resolve(new URL(import.meta.url).pathname, '..', '..', '..', '.env') });
import { createLogger } from './logger-utils.js';
import { MainnetConfig } from './config.js';
import { startSponsorServer, setSponsorLogger } from './sponsor-server.js';
import { buildWalletAndWaitForFunds, withStatus, setLogger } from './api.js';

const seed = process.env.WALLET_SEED;
if (!seed) throw new Error('WALLET_SEED environment variable is required for mainnet');

const config = new MainnetConfig();
const logger = await createLogger(config.logDir);
setLogger(logger);
setSponsorLogger(logger);

const walletCtx = await withStatus('Building wallet and waiting for funds', () =>
  buildWalletAndWaitForFunds(config, seed),
);

await startSponsorServer(walletCtx, config);
