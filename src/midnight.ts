import * as ledger from '@midnight-ntwrk/ledger-v7';
import { fromHex, toHex, type SigningKey } from '@midnight-ntwrk/compact-runtime';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { Counter, witnesses } from '@midnight-ntwrk/counter-contract';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import {
  ZKConfigProvider,
  type MidnightProvider,
  type WalletProvider,
  type UnboundTransaction,
  type PrivateStateId,
  type PrivateStateProvider,
} from '@midnight-ntwrk/midnight-js-types';

// -- ZK config provider --

class FetchZkConfigProvider<K extends string> extends ZKConfigProvider<K> {
  constructor(private baseUrl: string) { super(); }

  async getProverKey(circuitId: K): Promise<any> {
    const res = await fetch(`${this.baseUrl}/keys/${circuitId}.prover`);
    if (!res.ok) throw new Error(`Failed to fetch prover key: ${circuitId}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async getVerifierKey(circuitId: K): Promise<any> {
    const res = await fetch(`${this.baseUrl}/keys/${circuitId}.verifier`);
    if (!res.ok) throw new Error(`Failed to fetch verifier key: ${circuitId}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async getZKIR(circuitId: K): Promise<any> {
    const res = await fetch(`${this.baseUrl}/zkir/${circuitId}.bzkir`);
    if (!res.ok) throw new Error(`Failed to fetch ZKIR: ${circuitId}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

// -- In-memory private state provider --

function inMemoryPrivateStateProvider<PSI extends PrivateStateId, PS>(): PrivateStateProvider<PSI, PS> {
  const store = new Map<PSI, PS>();
  const signingKeys: Record<string, SigningKey> = {};
  return {
    setContractAddress: (_addr: string) => {},
    set: (key: PSI, state: PS) => { store.set(key, state); return Promise.resolve(); },
    get: (key: PSI) => Promise.resolve(store.get(key) ?? null),
    remove: (key: PSI) => { store.delete(key); return Promise.resolve(); },
    clear: () => { store.clear(); return Promise.resolve(); },
    setSigningKey: (addr: string, sk: SigningKey) => { signingKeys[addr] = sk; return Promise.resolve(); },
    getSigningKey: (addr: string) => Promise.resolve(signingKeys[addr] ?? null),
    removeSigningKey: (addr: string) => { delete signingKeys[addr]; return Promise.resolve(); },
  } as unknown as PrivateStateProvider<PSI, PS>;
}

// -- Wallet + Midnight providers from Lace --

const SPONSOR_SERVER_URL = 'http://localhost:3001';

function buildWalletAndMidnightProvider(connected: ConnectedAPI, coinPublicKey: string, encPublicKey: string): WalletProvider & MidnightProvider {
  let provedTxHex = '';

  return {
    getCoinPublicKey: () => coinPublicKey as unknown as ledger.CoinPublicKey,
    getEncryptionPublicKey: () => encPublicKey as unknown as ledger.EncPublicKey,
    async balanceTx(tx: UnboundTransaction, _ttl?: Date): Promise<ledger.FinalizedTransaction> {
      const bytes = tx.serialize();
      provedTxHex = toHex(bytes);
      console.log('[sponsor] proved tx captured, hex length:', provedTxHex.length);
      return {
        serialize: () => bytes,
        identifiers: () => tx.identifiers(),
      } as unknown as ledger.FinalizedTransaction;
    },
    submitTx: async (_tx: ledger.FinalizedTransaction): Promise<ledger.TransactionId> => {
      console.log('[sponsor] POSTing proved tx to sponsor server');
      let res: Response;
      try {
        res = await fetch(`${SPONSOR_SERVER_URL}/sponsor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tx: provedTxHex }),
        });
      } catch (fetchErr) {
        console.error('[sponsor] fetch failed:', fetchErr);
        throw fetchErr;
      }
      if (!res.ok) {
        const body = await res.json() as { error: string };
        throw new Error(`Sponsor server error: ${body.error}`);
      }
      const { txId } = await res.json() as { txId: string };
      console.log('[sponsor] txId:', txId);
      return txId as unknown as ledger.TransactionId;
    },
  };
}

// -- Public API --

export async function buildProviders(connected: ConnectedAPI) {
  const config = await connected.getConfiguration();
  console.log('wallet config:', config);
  setNetworkId(config.networkId);

  const addresses = await connected.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider(`${window.location.origin}/managed/counter`);
  const proofProvider = httpClientProofProvider(config.proverServerUri ?? '', zkConfigProvider);
  const walletAndMidnightProvider = buildWalletAndMidnightProvider(connected, addresses.shieldedCoinPublicKey, addresses.shieldedEncryptionPublicKey);

  return {
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    zkConfigProvider: zkConfigProvider as any,
    proofProvider: proofProvider as any,
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
    privateStateProvider: inMemoryPrivateStateProvider<string, any>(),
    config,
  };
}

export async function joinCounter(connected: ConnectedAPI, contractAddress: string) {
  const providers = await buildProviders(connected);

  const compiledContract = CompiledContract.make('counter', Counter.Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
  );

  const counterContract = await findDeployedContract(providers, {
    contractAddress,
    compiledContract,
    privateStateId: 'counterPrivateState',
    initialPrivateState: { privateCounter: 0 },
  });

  return { counterContract, providers };
}

export async function increment(counterContract: Awaited<ReturnType<typeof joinCounter>>['counterContract']) {
  const result = await counterContract.callTx.increment();
  return result.public;
}

export async function getCounterValue(
  providers: Awaited<ReturnType<typeof buildProviders>>,
  contractAddress: string,
): Promise<bigint | null> {
  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!state) return null;
  return Counter.ledger(state.data).round;
}
