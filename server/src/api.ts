/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { createHash } from 'crypto';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { type MidnightProvider, type WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
  type UnshieldedKeystore,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { type Logger } from 'pino';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import { type Config, contractConfig, currentDir } from './config';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Buffer } from 'buffer';
import { mnemonicToSeed, validateMnemonic } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english';
import fs from 'node:fs';
import path from 'node:path';
import {
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';

let logger: Logger;

// Required for GraphQL subscriptions (wallet sync) to work in Node.js
// @ts-expect-error: It's needed to enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

export interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
  cacheKey: string;
}

// ── GuessWho contract ──────────────────────────────────────────────────────

export type GuessWhoPrivateState = {
  culpritId: number;
  salt: Uint8Array;
};

let guessWhoCompiledContract: any = null;

async function getGuessWhoCompiledContract() {
  if (guessWhoCompiledContract) return guessWhoCompiledContract;
  const { GuessWho, guessWhoWitnesses } = await import('@midnight-ntwrk/guess-who-contract');
  guessWhoCompiledContract = CompiledContract.make('guess_who', GuessWho.Contract).pipe(
    CompiledContract.withWitnesses(guessWhoWitnesses),
    CompiledContract.withCompiledFileAssets(contractConfig.guessWhoZkConfigPath),
  );
  return guessWhoCompiledContract;
}

export const configureGuessWhoProviders = async (ctx: WalletContext, config: Config) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(ctx);
  const zkConfigProvider = new NodeZkConfigProvider<any>(contractConfig.guessWhoZkConfigPath);
  return {
    privateStateProvider: levelPrivateStateProvider<'guessWhoPrivateState'>({
      privateStateStoreName: 'guess-who-private-state',
      accountId: walletAndMidnightProvider.getCoinPublicKey(),
      privateStoragePasswordProvider: () => `${walletAndMidnightProvider.getCoinPublicKey()}!A`,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

export const deployGuessWho = async (
  providers: any,
): Promise<{ contractAddress: string; contract: any }> => {
  logger.info('Deploying GuessWho contract...');
  const compiled = await getGuessWhoCompiledContract();
  const contract = await (deployContract as any)(providers, {
    compiledContract: compiled,
    privateStateId: 'guessWhoPrivateState',
    initialPrivateState: { culpritId: 0, salt: new Uint8Array(32) },
  });
  const contractAddress = contract.deployTxData.public.contractAddress as string;
  logger.info(`GuessWho contract deployed at: ${contractAddress}`);
  return { contractAddress, contract };
};

export const joinGuessWho = async (
  providers: any,
  contractAddress: string,
  privateState: GuessWhoPrivateState,
): Promise<any> => {
  const compiled = await getGuessWhoCompiledContract();
  return (findDeployedContract as any)(providers, {
    contractAddress,
    compiledContract: compiled,
    privateStateId: 'guessWhoPrivateState',
    initialPrivateState: privateState,
  });
};

export const createOnChainGame = async (
  providers: any,
  contractAddress: string,
  privateState: GuessWhoPrivateState,
): Promise<{ gameId: bigint }> => {
  logger.info('Creating on-chain game...');
  const contract = await joinGuessWho(providers, contractAddress, privateState);
  const finalizedTxData = await contract.callTx.create_game();
  const gameId = finalizedTxData.private.result as bigint;
  logger.info(`On-chain game created with game_id: ${gameId}`);
  return { gameId };
};

export const submitGuessOnChain = async (
  providers: any,
  contractAddress: string,
  privateState: GuessWhoPrivateState,
  gameId: bigint,
  guessId: number,
): Promise<{ correct: boolean; txId: string }> => {
  logger.info(`Submitting guess ${guessId} for game_id ${gameId}`);
  const contract = await joinGuessWho(providers, contractAddress, privateState);
  const finalizedTxData = await contract.callTx.submit_guess(gameId, BigInt(guessId));
  const txId = String(finalizedTxData.public.txId);
  const correct = Boolean(finalizedTxData.private.result);
  logger.info(`submitGuessOnChain: correct=${correct}, txId=${txId}`);
  return { correct, txId };
};

// ── Transaction signing ────────────────────────────────────────────────────

/**
 * Sign all unshielded offers in a transaction's intents, using the correct
 * proof marker for Intent.deserialize. This works around a bug in the wallet
 * SDK where signRecipe hardcodes 'pre-proof', which fails for proven
 * (UnboundTransaction) intents that contain 'proof' data.
 */
export const signTransactionIntents = (
  tx: { intents?: Map<number, any> },
  signFn: (payload: Uint8Array) => ledger.Signature,
  proofMarker: 'proof' | 'pre-proof',
): void => {
  if (!tx.intents || tx.intents.size === 0) return;

  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;

    const cloned = ledger.Intent.deserialize<ledger.SignatureEnabled, ledger.Proofish, ledger.PreBinding>(
      'signature',
      proofMarker,
      'pre-binding',
      intent.serialize(),
    );

    const sigData = cloned.signatureData(segment);
    const signature = signFn(sigData);

    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_: ledger.UtxoSpend, i: number) => cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }

    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: ledger.UtxoSpend, i: number) => cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }

    tx.intents.set(segment, cloned);
  }
};

// ── Wallet & provider setup ────────────────────────────────────────────────

export const createWalletAndMidnightProvider = async (
  ctx: WalletContext,
): Promise<WalletProvider & MidnightProvider> => {
  // Derive public keys directly — no sync required
  const coinPublicKey = ctx.shieldedSecretKeys.coinPublicKey;
  const encPublicKey = ctx.shieldedSecretKeys.encryptionPublicKey;
  return {
    getCoinPublicKey() {
      return coinPublicKey;
    },
    getEncryptionPublicKey() {
      return encPublicKey;
    },
    async balanceTx(tx, ttl?) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );

      const signFn = (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
      }

      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx(tx) {
      return ctx.wallet.submitTransaction(tx) as any;
    },
  };
};

export const configureProviders = async (ctx: WalletContext, config: Config) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(ctx);
  const zkConfigProvider = new NodeZkConfigProvider<any>(contractConfig.guessWhoZkConfigPath);
  return {
    privateStateProvider: levelPrivateStateProvider<'guessWhoPrivateState'>({
      privateStateStoreName: 'guess-who-private-state',
      accountId: walletAndMidnightProvider.getCoinPublicKey(),
      privateStoragePasswordProvider: () => `${walletAndMidnightProvider.getCoinPublicKey()}!A`,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

/** Wait until dust wallet has synced — only dust is needed for server operations. */
export const waitForSync = (wallet: WalletFacade) => {
  let lastPct = -1;

  const sub = wallet.dust.state.subscribe((s) => {
    const p = (s as any).progress;
    if (p) {
      const applied = p.appliedIndex ?? 0n;
      const highest = p.highestRelevantWalletIndex ?? 0n;
      const pct = highest > 0n ? Number((applied * 100n) / highest) : 0;
      if (pct !== lastPct) {
        lastPct = pct;
        process.stdout.write(`\r  … Syncing dust: ${pct}% (${applied}/${highest})   `);
      }
    }
  });

  // isSynced is undefined on the dust WASM state object — use progress indices instead.
  // Synced when appliedIndex >= highestRelevantWalletIndex and highest > 0.
  return Rx.firstValueFrom(
    wallet.dust.state.pipe(
      Rx.filter((s) => {
        const p = (s as any).progress;
        if (!p) return false;
        const applied = p.appliedIndex ?? 0n;
        const highest = p.highestRelevantWalletIndex ?? 0n;
        return highest > 0n && applied >= highest;
      }),
    ),
  ).then(async (dustState) => {
    sub.unsubscribe();
    process.stdout.write('\n');
    return dustState;
  });
};

/** Wait until the wallet has a non-zero unshielded balance. */
export const waitForFunds = (wallet: WalletFacade): Promise<bigint> =>
  Rx.firstValueFrom(
    wallet.unshielded.state.pipe(
      Rx.throttleTime(10_000),
      Rx.filter((state) => state.isSynced),
      Rx.map((s) => s.balances[unshieldedToken().raw] ?? 0n),
      Rx.filter((balance) => balance > 0n),
    ),
  );

const buildShieldedConfig = ({ indexer, indexerWS, node, proofServer }: Config) => ({
  networkId: getNetworkId(),
  indexerClientConnection: { indexerHttpUrl: indexer, indexerWsUrl: indexerWS },
  provingServerUrl: new URL(proofServer),
  relayURL: new URL(node.replace(/^http/, 'ws')),
});

const buildUnshieldedConfig = ({ indexer, indexerWS }: Config) => ({
  networkId: getNetworkId(),
  indexerClientConnection: { indexerHttpUrl: indexer, indexerWsUrl: indexerWS },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
});

const buildDustConfig = ({ indexer, indexerWS, node, proofServer }: Config) => ({
  networkId: getNetworkId(),
  costParameters: {
    additionalFeeOverhead: 300_000_000_000_000n,
    feeBlocksMargin: 5,
  },
  indexerClientConnection: { indexerHttpUrl: indexer, indexerWsUrl: indexerWS },
  provingServerUrl: new URL(proofServer),
  relayURL: new URL(node.replace(/^http/, 'ws')),
});

const deriveKeysFromSeed = async (seed: string) => {
  let seedBytes: Uint8Array;
  if (validateMnemonic(seed.trim(), english)) {
    // Full 64-byte BIP39 seed — same as what the Lace wallet uses
    seedBytes = await mnemonicToSeed(seed.trim());
  } else {
    seedBytes = Buffer.from(seed, 'hex');
  }
  const hdWallet = HDWallet.fromSeed(seedBytes);
  if (hdWallet.type !== 'seedOk') {
    throw new Error('Failed to initialize HDWallet from seed');
  }

  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (derivationResult.type !== 'keysDerived') {
    throw new Error('Failed to derive keys');
  }

  hdWallet.hdWallet.clear();
  return derivationResult.keys;
};

const formatBalance = (balance: bigint): string => balance.toLocaleString();

export const withStatus = async <T>(message: string, fn: () => Promise<T>): Promise<T> => {
  process.stdout.write(`  … ${message}\n`);
  try {
    const result = await fn();
    process.stdout.write(`  ✓ ${message}\n`);
    return result;
  } catch (e) {
    process.stdout.write(`  ✗ ${message}\n`);
    const detail = e instanceof Error
      ? e.message
      : (() => { try { return JSON.stringify(e, Object.getOwnPropertyNames(e as object), 2); } catch { return String(e); } })();
    process.stdout.write(`  Error: ${detail}\n`);
    throw e;
  }
};

const registerForDustGeneration = async (
  wallet: WalletFacade,
  unshieldedKeystore: UnshieldedKeystore,
): Promise<void> => {
  const dustState = await Rx.firstValueFrom(
    wallet.dust.state.pipe(
      Rx.filter((s) => {
        const p = (s as any).progress;
        if (!p) return false;
        const applied = p.appliedIndex ?? 0n;
        const highest = p.highestRelevantWalletIndex ?? 0n;
        return highest > 0n && applied >= highest;
      }),
    ),
  );
  const unshieldedState = await Rx.firstValueFrom(wallet.unshielded.state.pipe(Rx.filter((s) => s.isSynced)));

  if (dustState.availableCoins.length > 0) {
    const dustBal = dustState.balance(new Date());
    console.log(`  ✓ Dust tokens already available (${formatBalance(dustBal)} DUST)`);
    return;
  }

  const nightUtxos = unshieldedState.availableCoins.filter(
    (coin: any) => coin.meta?.registeredForDustGeneration !== true,
  );
  if (nightUtxos.length === 0) {
    await withStatus('Waiting for dust tokens to generate', () =>
      Rx.firstValueFrom(
        wallet.dust.state.pipe(
          Rx.throttleTime(5_000),
          Rx.filter((s) => s.isSynced),
          Rx.filter((s) => s.balance(new Date()) > 0n),
        ),
      ),
    );
    return;
  }

  await withStatus(`Registering ${nightUtxos.length} NIGHT UTXO(s) for dust generation`, async () => {
    const recipe = await wallet.registerNightUtxosForDustGeneration(
      nightUtxos,
      unshieldedKeystore.getPublicKey(),
      (payload) => unshieldedKeystore.signData(payload),
    );
    const finalized = await wallet.finalizeRecipe(recipe);
    await wallet.submitTransaction(finalized);
  });

  await withStatus('Waiting for dust tokens to generate', () =>
    Rx.firstValueFrom(
      wallet.dust.state.pipe(
        Rx.throttleTime(5_000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.balance(new Date()) > 0n),
      ),
    ),
  );
};

const printWalletSummary = (seed: string, dustState: any, unshieldedKeystore: UnshieldedKeystore, shieldedSecretKeys: ledger.ZswapSecretKeys) => {
  const networkId = getNetworkId();
  const dustBalance = dustState?.balance ? formatBalance(dustState.balance(new Date())) : 'unknown';

  const DIV = '──────────────────────────────────────────────────────────────';
  console.log(`
${DIV}
  Wallet Overview                            Network: ${networkId}
${DIV}
  Seed: ${'*'.repeat(seed.length)}
${DIV}

  Dust
  └─ Balance: ${dustBalance}
  └─ Address: ${dustState?.dustAddress ?? 'unknown'}

${DIV}`);
};

const WALLET_CACHE_DIR = path.resolve(currentDir, '..', 'wallet-cache');

const loadWalletCache = (cacheKey: string): { dust?: string; shielded?: string; unshielded?: string } | null => {
  const file = path.join(WALLET_CACHE_DIR, `${cacheKey}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const saveWalletCache = (cacheKey: string, data: { dust?: string; shielded?: string; unshielded?: string }) => {
  fs.mkdirSync(WALLET_CACHE_DIR, { recursive: true });
  const file = path.join(WALLET_CACHE_DIR, `${cacheKey}.json`);
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
};

export const buildWalletAndWaitForFunds = async (config: Config, seed: string): Promise<WalletContext> => {
  console.log('');

  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore, cacheKey } = await withStatus(
    'Building wallet',
    async () => {
      const keys = await deriveKeysFromSeed(seed);
      const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
      const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
      const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

      const cacheKey = `${getNetworkId()}-${createHash('sha256').update(seed.trim()).digest('hex').slice(0, 12)}`;
      const cache = loadWalletCache(cacheKey);

      const walletConfig = {
        ...buildShieldedConfig(config),
        ...buildUnshieldedConfig(config),
        ...buildDustConfig(config),
      };
      const wallet = await WalletFacade.init({
        configuration: walletConfig,
        shielded: (cfg) => cache?.shielded
          ? ShieldedWallet(cfg).restore(cache.shielded)
          : ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
        unshielded: (cfg) => cache?.unshielded
          ? UnshieldedWallet(cfg).restore(cache.unshielded)
          : UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
        dust: (cfg) => cache?.dust
          ? DustWallet(cfg).restore(cache.dust)
          : DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
      });
      await wallet.start(shieldedSecretKeys, dustSecretKey);

      if (cache) {
        process.stdout.write('  ✓ Restored wallet from cache\n');
      }

      return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore, cacheKey };
    },
  );

  const networkId = getNetworkId();
  const DIV = '──────────────────────────────────────────────────────────────';
  console.log(`
${DIV}
  Wallet Overview                            Network: ${networkId}
${DIV}
  Seed: ${'*'.repeat(seed.length)}

  Unshielded Address (send tNight here):
  ${unshieldedKeystore.getBech32Address()}

  Fund your wallet with tNight from the Preprod faucet:
  https://faucet.preprod.midnight.network/
${DIV}
`);

  // Save dust state periodically during sync so Ctrl+C mid-sync still checkpoints progress
  const saveDustCache = async () => {
    try {
      const dust = await wallet.dust.serializeState();
      const existing = loadWalletCache(cacheKey) ?? {};
      saveWalletCache(cacheKey, { ...existing, dust });
    } catch { /* ignore */ }
  };
  const midSyncInterval = setInterval(saveDustCache, 15_000);

  // Flush cache on SIGINT so killing the process mid-sync preserves progress
  const sigintHandler = async () => {
    clearInterval(midSyncInterval);
    process.stdout.write('\n  … Saving wallet checkpoint before exit…\n');
    await saveDustCache();
    process.exit(0);
  };
  process.once('SIGINT', sigintHandler);

  process.stdout.write('  … Syncing with network\n');
  const syncedState = await waitForSync(wallet);
  clearInterval(midSyncInterval);
  process.removeListener('SIGINT', sigintHandler);
  process.stdout.write('  ✓ Syncing with network\n');
  printWalletSummary(seed, syncedState, unshieldedKeystore, shieldedSecretKeys);

  // Save wallet state so next startup can resume from checkpoint
  // Only serialize dust + unshielded — shielded never connects on mainnet so we skip it
  try {
    const [dust, unshielded] = await Promise.all([
      wallet.dust.serializeState(),
      wallet.unshielded.serializeState(),
    ]);
    saveWalletCache(cacheKey, { dust, unshielded });
    process.stdout.write('  ✓ Wallet state cached\n');
  } catch (e) {
    process.stdout.write(`  ⚠ Failed to cache wallet state: ${e}\n`);
  }

  // Keep cache updated as dust state changes
  wallet.dust.state.pipe(Rx.throttleTime(30_000)).subscribe(async () => {
    try {
      const dust = await wallet.dust.serializeState();
      const existing = loadWalletCache(cacheKey) ?? {};
      saveWalletCache(cacheKey, { ...existing, dust });
    } catch { /* ignore */ }
  });

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore, cacheKey };
};


export const buildFreshWallet = async (config: Config): Promise<WalletContext> =>
  await buildWalletAndWaitForFunds(config, toHex(Buffer.from(generateRandomSeed())));

export const getDustBalance = async (
  wallet: WalletFacade,
): Promise<{ available: bigint; pending: bigint; availableCoins: number; pendingCoins: number }> => {
  const state = await Rx.firstValueFrom(
    wallet.dust.state.pipe(
      Rx.filter((s) => {
        const p = (s as any).progress;
        if (!p) return false;
        const applied = p.appliedIndex ?? 0n;
        const highest = p.highestRelevantWalletIndex ?? 0n;
        return highest > 0n && applied >= highest;
      }),
    ),
  );
  const available = state.balance(new Date());
  const availableCoins = state.availableCoins.length;
  const pendingCoins = state.pendingCoins.length;
  const pending = state.pendingCoins.reduce((sum: bigint, c: any) => sum + c.initialValue, 0n);
  return { available, pending, availableCoins, pendingCoins };
};

export const monitorDustBalance = async (wallet: WalletFacade, stopSignal: Promise<void>): Promise<void> => {
  let stopped = false;
  void stopSignal.then(() => { stopped = true; });

  const sub = wallet
    .state()
    .pipe(Rx.throttleTime(5_000), Rx.filter((s) => s.isSynced))
    .subscribe((state) => {
      if (stopped) return;

      const now = new Date();
      const available = state.dust.balance(now);
      const availableCoins = state.dust.availableCoins.length;
      const pendingCoins = state.dust.pendingCoins.length;
      const registeredNight = state.unshielded.availableCoins.filter(
        (coin: any) => coin.meta?.registeredForDustGeneration === true,
      ).length;
      const totalNight = state.unshielded.availableCoins.length;

      let status = '';
      if (pendingCoins > 0 && availableCoins === 0) status = '⚠ locked by pending tx';
      else if (available > 0n) status = '✓ ready to deploy';
      else if (availableCoins > 0) status = 'accruing...';
      else if (registeredNight > 0) status = 'waiting for generation...';
      else status = 'no NIGHT registered';

      console.log(
        `  [${now.toLocaleTimeString()}] DUST: ${formatBalance(available)} (${availableCoins} coins, ${pendingCoins} pending) | NIGHT: ${totalNight} UTXOs, ${registeredNight} registered | ${status}`,
      );
    });

  await stopSignal;
  sub.unsubscribe();
};

export function setLogger(_logger: Logger) {
  logger = _logger;
}
