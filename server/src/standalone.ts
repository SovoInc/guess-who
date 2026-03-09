import { createLogger } from './logger-utils.js';
import path from 'node:path';
import { DockerComposeEnvironment, Wait } from 'testcontainers';
import { currentDir, StandaloneConfig } from './config.js';
import { startSponsorServer, setSponsorLogger } from './sponsor-server.js';
import { buildWalletAndWaitForFunds, configureProviders, deploy, withStatus, setLogger } from './api.js';

const config = new StandaloneConfig();
const logger = await createLogger(config.logDir);
setLogger(logger);
setSponsorLogger(logger);

const dockerEnv = new DockerComposeEnvironment(path.resolve(currentDir, '..'), 'standalone.yml')
  .withWaitStrategy('counter-proof-server', Wait.forLogMessage('Actix runtime found; starting in Actix runtime', 1))
  .withWaitStrategy('counter-indexer', Wait.forLogMessage(/starting indexing/, 1));

const env = await dockerEnv.up();

const mapPort = (url: string, container: string) => {
  const u = new URL(url);
  u.port = String(env.getContainer(container).getFirstMappedPort());
  return u.toString().replace(/\/+$/, '');
};
config.indexer    = mapPort(config.indexer,    'counter-indexer');
config.indexerWS  = mapPort(config.indexerWS,  'counter-indexer');
config.node       = mapPort(config.node,       'counter-node');
config.proofServer = mapPort(config.proofServer, 'counter-proof-server');

const GENESIS_SEED = '0000000000000000000000000000000000000000000000000000000000000001';
const walletCtx = await buildWalletAndWaitForFunds(config, GENESIS_SEED);
const providers  = await withStatus('Configuring providers', () => configureProviders(walletCtx, config));
const contract   = await withStatus('Deploying counter contract', () => deploy(providers, { privateCounter: 0 }));

const contractAddress = contract.deployTxData.public.contractAddress;
console.log(`
──────────────────────────────────────────────────────────────
  CONTRACT ADDRESS:
  ${contractAddress}

  Paste this into the Guess Who web app.
──────────────────────────────────────────────────────────────
`);

startSponsorServer(walletCtx);
