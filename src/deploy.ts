import * as ledger from '@midnight-ntwrk/ledger-v8';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { ZKConfigProvider, createVerifierKey, createProverKey, createZKIR, createProofProvider, type MidnightProvider, type WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { GuessWho, guessWhoWitnesses } from '@midnight-ntwrk/counter-contract';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { u8aToHex } from '@polkadot/util';

const btn = document.getElementById('btn') as HTMLButtonElement;
const log = document.getElementById('log') as HTMLDivElement;

const PRIVATE_RPC = 'REDACTED_PRIVATE_RPC_URL';

function print(msg: string, cls?: string) {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = msg;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

class FetchZKConfigProvider<K extends string> extends ZKConfigProvider<K> {
  constructor(private readonly base: string) { super(); }
  async getVerifierKey(id: K) { const r = await fetch(`${this.base}/keys/${id}.verifier`); return createVerifierKey(new Uint8Array(await r.arrayBuffer())); }
  async getProverKey(id: K) { const r = await fetch(`${this.base}/keys/${id}.prover`); return createProverKey(new Uint8Array(await r.arrayBuffer())); }
  async getZKIR(id: K) { const r = await fetch(`${this.base}/zkir/${id}.bzkir`); return createZKIR(new Uint8Array(await r.arrayBuffer())); }
}

async function submitViaPolkadot(balancedHex: string): Promise<string> {
  print('Connecting to private deploy RPC...');
  const provider = new WsProvider(PRIVATE_RPC);
  const api = await ApiPromise.create({ provider, throwOnConnect: false, noInitWarn: true });

  return new Promise<string>((resolve, reject) => {
    const bytes = Buffer.from(balancedHex, 'hex');
    (api.tx as any).midnight.sendMnTransaction(u8aToHex(bytes))
      .send((result: any) => {
        print(`Tx status: ${result.status.type}`);
        if (result.status.isInBlock) {
          const txHash = result.txHash.toString();
          api.disconnect();
          resolve(txHash);
        } else if (result.status.isDropped || result.status.isInvalid || result.status.isUsurped) {
          api.disconnect();
          reject(new Error(`Transaction ${result.status.type}`));
        }
      })
      .catch((err: any) => {
        api.disconnect();
        reject(err);
      });
  });
}

function buildWalletProvider(api: ConnectedAPI, coinPublicKey: string, encPublicKey: string): WalletProvider & MidnightProvider {
  let balancedHex = '';
  return {
    getCoinPublicKey: () => coinPublicKey as unknown as ledger.CoinPublicKey,
    getEncryptionPublicKey: () => encPublicKey as unknown as ledger.EncPublicKey,
    async balanceTx(tx) {
      const serialized = Buffer.from(tx.serialize()).toString('hex');
      const { tx: balanced } = await api.balanceUnsealedTransaction(serialized);
      balancedHex = balanced;
      const bytes = Buffer.from(balanced, 'hex');
      return ledger.Transaction.deserialize('signature', 'proof', 'binding', bytes);
    },
    async submitTx(tx) {
      const ids = tx.identifiers();
      print('Submitting via polkadot.js to private deploy RPC...');
      const txHash = await submitViaPolkadot(balancedHex);
      print(`Submitted! TxHash: ${txHash}`);
      return ids[0] ?? '';
    },
  };
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  log.innerHTML = '';

  try {
    print('Connecting to wallet...');
    const wallets = (window as any).midnight;
    if (!wallets) throw new Error('No Midnight wallet found.');
    const key = Object.keys(wallets).includes('lace') ? 'lace' : Object.keys(wallets)[0];
    const api: ConnectedAPI = await wallets[key].connect('mainnet');
    print('Wallet connected.');

    setNetworkId('mainnet');

    print('Fetching wallet addresses...');
    const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } = await api.getShieldedAddresses();
    const walletCfg = await api.getConfiguration();
    print(`Wallet proof server: ${walletCfg.proverServerUri ?? 'none'}`);
    print(`Wallet indexer: ${walletCfg.indexerUri ?? 'none'}`);

    const walletAndMidnight = buildWalletProvider(api, shieldedCoinPublicKey, shieldedEncryptionPublicKey);

    const zkBase = `${window.location.origin}/managed/guess_who/guess_who`;
    const zkConfigProvider = new FetchZKConfigProvider(zkBase);

    const keyMaterialProvider = {
      async getZKIR(id: string) { const r = await fetch(`${zkBase}/zkir/${id}.bzkir`); return new Uint8Array(await r.arrayBuffer()); },
      async getProverKey(id: string) { const r = await fetch(`${zkBase}/keys/${id}.prover`); return new Uint8Array(await r.arrayBuffer()); },
      async getVerifierKey(id: string) { const r = await fetch(`${zkBase}/keys/${id}.verifier`); return new Uint8Array(await r.arrayBuffer()); },
    };
    const provingProvider = await api.getProvingProvider(keyMaterialProvider);
    const proofProvider = createProofProvider(provingProvider);

    const indexer = walletCfg.indexerUri ?? 'https://indexer.mainnet.midnight.network/api/v4/graphql';
    const indexerWS = walletCfg.indexerWsUri ?? 'wss://indexer.mainnet.midnight.network/api/v4/graphql/ws';

    const providers = {
      walletProvider: walletAndMidnight,
      midnightProvider: walletAndMidnight,
      publicDataProvider: indexerPublicDataProvider(indexer, indexerWS),
      proofProvider,
      zkConfigProvider: zkConfigProvider as any,
      privateStateProvider: (() => {
        const store = new Map<string, unknown>();
        const signingKeys = new Map<string, unknown>();
        let addr = '';
        return {
          setContractAddress(a: string) { addr = a; },
          get(id: string) { return Promise.resolve(store.get(`${addr}:${id}`) ?? null); },
          set(id: string, s: unknown) { store.set(`${addr}:${id}`, s); return Promise.resolve(); },
          remove(id: string) { store.delete(`${addr}:${id}`); return Promise.resolve(); },
          clear() { store.clear(); return Promise.resolve(); },
          getSigningKey(a: string) { return Promise.resolve(signingKeys.get(a) ?? null); },
          setSigningKey(a: string, k: unknown) { signingKeys.set(a, k); return Promise.resolve(); },
          removeSigningKey(a: string) { signingKeys.delete(a); return Promise.resolve(); },
          clearSigningKeys() { signingKeys.clear(); return Promise.resolve(); },
          exportPrivateStates() { return Promise.reject(new Error('not supported')); },
          importPrivateStates() { return Promise.reject(new Error('not supported')); },
          exportSigningKeys() { return Promise.reject(new Error('not supported')); },
          importSigningKeys() { return Promise.reject(new Error('not supported')); },
        };
      })(),
    };

    print('Building compiled contract...');
    const compiled = CompiledContract.make('guess_who', GuessWho.Contract).pipe(
      CompiledContract.withWitnesses(guessWhoWitnesses),
      CompiledContract.withCompiledFileAssets(`${zkBase}`),
    );

    print('Deploying contract — your wallet will prompt for approval...');
    const deployed = await deployContract(providers as any, {
      compiledContract: compiled,
      privateStateId: 'guessWhoPrivateState',
      initialPrivateState: { culpritId: 0, salt: new Uint8Array(32) },
    });

    const contractAddress = deployed.deployTxData.public.contractAddress as string;
    print('✓ Contract deployed!', 'success');
    const addrEl = document.createElement('div');
    addrEl.className = 'address';
    addrEl.textContent = contractAddress;
    log.appendChild(addrEl);
    print('');
    print(`Add to .env:`);
    print(`  GUESS_WHO_CONTRACT_ADDRESS=${contractAddress}`);
    print(`  VITE_CONTRACT_ADDRESS=${contractAddress}`);

  } catch (err) {
    print(`✗ ${err instanceof Error ? err.message : String(err)}`, 'error');
    btn.disabled = false;
  }
});
