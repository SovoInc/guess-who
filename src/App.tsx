import { useEffect, useRef, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { joinCounter, increment, getCounterValue } from './midnight';
import { createPhaserGame, declareSpyRef } from './game/PhaserGame';

const DEFAULT_CONTRACT_ADDRESS = 'd638d0fdea9473e24e15b02dc83e9ea515eb58e80ecb892e8b1449a59c957129';

type Status = 'idle' | 'connecting' | 'joining' | 'ready' | 'incrementing' | 'error';

export default function App() {
  const [connectedApi, setConnectedApi] = useState<ConnectedAPI | null>(null);
  const [contractAddress, setContractAddress] = useState(DEFAULT_CONTRACT_ADDRESS);
  const [status, setStatus] = useState<Status>('idle');
  const [spyCount, setSpyCount] = useState<bigint | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState<Awaited<ReturnType<typeof joinCounter>> | null>(null);
  const contractRef = useRef(contract);
  const contractAddressRef = useRef(contractAddress);
  const gameContainerRef = useRef<HTMLDivElement>(null);

  // Keep refs in sync so the Phaser callback always sees latest values
  useEffect(() => { contractRef.current = contract; }, [contract]);
  useEffect(() => { contractAddressRef.current = contractAddress; }, [contractAddress]);

  // Wire up the declareSpyRef so Phaser calls into React state
  useEffect(() => {
    declareSpyRef.current = async () => {
      const c = contractRef.current;
      if (!c) throw new Error('Wallet not connected — join contract first');
      setStatus('incrementing');
      setError(null);
      setTxId(null);
      try {
        const result = await increment(c.counterContract);
        console.log('[declare spy] txId:', result.txId);
        setTxId(result.txId);
        const addr = contractAddressRef.current.trim();
        const prevValue = spyCount;
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const value = await getCounterValue(c.providers, addr);
          console.log(`[poll] attempt ${i + 1}: value=${value?.toString()}`);
          if (value !== null && value !== prevValue) {
            setSpyCount(value);
            break;
          }
        }
        setStatus('ready');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus('ready');
        throw e;
      }
    };
  });

  // Boot Phaser once
  useEffect(() => {
    if (!gameContainerRef.current) return;
    const game = createPhaserGame(gameContainerRef.current);
    return () => { game.destroy(true); };
  }, []);

  const handleConnect = async () => {
    setStatus('connecting');
    setError(null);
    try {
      if (!window.midnight) throw new Error('Lace wallet not found. Install or enable the Lace extension.');
      const walletEntry = Object.values(window.midnight).find(
        (e) => (e as { rdns?: string }).rdns === 'io.lace.wallet',
      ) as { connect: (name: string) => Promise<ConnectedAPI> } | undefined;
      if (!walletEntry) throw new Error('Lace wallet not found.');
      const api = await walletEntry.connect('undeployed');
      setConnectedApi(api);
      setStatus('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  const handleJoin = async () => {
    if (!connectedApi) return;
    setStatus('joining');
    setError(null);
    setTxId(null);
    try {
      const result = await joinCounter(connectedApi, contractAddress.trim());
      setContract(result);
      const value = await getCounterValue(result.providers, contractAddress.trim());
      setSpyCount(value);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  return (
    <div style={{ margin: 0, background: '#000', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' }}>
      {/* Wallet bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#111', borderBottom: '1px solid #333' }}>
        <span style={{ fontWeight: 'bold', fontSize: 18 }}>Guess Who</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {spyCount !== null && (
            <span style={{ fontSize: 13, color: '#aaa' }}>Spies declared: <strong style={{ color: '#fff' }}>{spyCount.toString()}</strong></span>
          )}
          {!connectedApi ? (
            <button
              onClick={handleConnect}
              disabled={status === 'connecting'}
              style={{ padding: '6px 14px', background: '#fff', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}
            >
              {status === 'connecting' ? 'Connecting...' : 'Connect Wallet'}
            </button>
          ) : status === 'idle' || status === 'error' ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
                placeholder="Contract address"
                style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'monospace', borderRadius: 4, border: '1px solid #555', background: '#222', color: '#fff', width: 260 }}
              />
              <button
                onClick={handleJoin}
                disabled={!contractAddress.trim()}
                style={{ padding: '6px 14px', background: '#fff', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}
              >
                Join Contract
              </button>
            </div>
          ) : status === 'joining' ? (
            <span style={{ color: '#aaa', fontSize: 13 }}>Joining contract...</span>
          ) : (
            <span style={{ fontSize: 13, padding: '4px 10px', background: '#1a3a1a', color: '#4ade80', borderRadius: 6 }}>
              ✓ Wallet Connected
            </span>
          )}
        </div>
      </div>

      {/* Status messages */}
      {status === 'incrementing' && (
        <div style={{ textAlign: 'center', padding: '4px', background: '#1a2a1a', color: '#4ade80', fontSize: 13 }}>
          Submitting spy declaration to Midnight network...
        </div>
      )}
      {txId && (
        <div style={{ textAlign: 'center', padding: '4px', background: '#1a2a1a', color: '#4ade80', fontSize: 12, fontFamily: 'monospace' }}>
          ✓ Tx confirmed: {txId}
        </div>
      )}
      {error && (
        <div style={{ textAlign: 'center', padding: '4px', background: '#2a1a1a', color: '#f87171', fontSize: 13 }}>
          ✗ {error}
        </div>
      )}

      {/* Phaser canvas */}
      <div ref={gameContainerRef} style={{ display: 'flex', justifyContent: 'center' }} />
    </div>
  );
}
