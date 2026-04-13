import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';
dotenv({ path: resolve(new URL(import.meta.url).pathname, '..', '..', '..', '.env') });

import { createLogger } from './logger-utils.js';
import { currentDir, MainnetConfig } from './config.js';
import { startSponsorServer, setSponsorLogger } from './sponsor-server.js';
import { buildWalletAndWaitForFunds, withStatus, setLogger } from './api.js';
import { DockerComposeEnvironment, Wait } from 'testcontainers';
import path from 'node:path';

const seed = process.env.WALLET_SEED;
if (!seed) throw new Error('WALLET_SEED environment variable is required for mainnet');

const config = new MainnetConfig();
const logger = await createLogger(config.logDir);
setLogger(logger);
setSponsorLogger(logger);

logger.info('Starting proof server...');
const dockerEnv = new DockerComposeEnvironment(path.resolve(currentDir, '..'), 'proof-server.yml')
  .withWaitStrategy('proof-server', Wait.forLogMessage('Actix runtime found; starting in Actix runtime', 1))
  .withStartupTimeout(180_000);
await dockerEnv.up();
logger.info('Proof server ready');

const walletCtx = await withStatus('Building wallet and waiting for funds', () =>
  buildWalletAndWaitForFunds(config, seed),
);

await startSponsorServer(walletCtx, config);
