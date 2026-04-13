'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';

const SESSION_KEY = 'midnight_shielded_address';

// Global store so GameScene can access the joined contract via window.__midnightContract
let _connectedApi: ConnectedAPI | null = null;

type WalletState = 'idle' | 'detecting' | 'connecting' | 'contract' | 'joining' | 'connected' | 'error' | 'not_found';

export default function WalletConnect() {
  const router = useRouter();
  const [walletState, setWalletState] = useState<WalletState>('idle');
  const [address, setAddress] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      setAddress(stored);
      setWalletState('connected');
    }
  }, []);

  async function handleConnect() {
    setWalletState('detecting');
    setErrorMsg('');
    await new Promise(r => setTimeout(r, 300));

    const midnight = (window as any).midnight;
    if (!midnight) { setWalletState('not_found'); return; }

    const walletEntry = Object.values(midnight).find(
      (e: any) => e?.rdns === 'io.lace.wallet'
    ) as { connect: (name: string) => Promise<ConnectedAPI> } | undefined;

    if (!walletEntry) { setWalletState('not_found'); return; }

    setWalletState('connecting');
    try {
      const connectedApi = await walletEntry.connect('mainnet');
      const addresses = await connectedApi.getShieldedAddresses();
      const shieldedAddress = (addresses as any)?.shieldedAddress || (addresses as any)?.[0] || 'UNKNOWN_AGENT';

      sessionStorage.setItem(SESSION_KEY, shieldedAddress);
      setAddress(shieldedAddress);
      _connectedApi = connectedApi;
      setWalletState('contract');
    } catch (err: any) {
      setWalletState('error');
      setErrorMsg(err?.message || 'CONNECTION FAILED');
    }
  }

  async function handleJoinContract() {
    if (!_connectedApi || !contractAddress.trim()) return;
    setWalletState('joining');
    setErrorMsg('');
    try {
      const { joinCounter } = await import('../src/midnight');
      const result = await joinCounter(_connectedApi, contractAddress.trim());
      (window as any).__midnightContract = result;
      setWalletState('connected');
    } catch (err: any) {
      setWalletState('contract');
      setErrorMsg(err?.message || 'FAILED TO JOIN CONTRACT');
    }
  }

  function handleBypass() {
    const mockAddr = 'DEV_' + Math.random().toString(36).slice(2, 10).toUpperCase();
    sessionStorage.setItem(SESSION_KEY, mockAddr);
    setAddress(mockAddr);
    _connectedApi = null;
    setWalletState('connected');
  }

  function handleProceed() {
    router.push('/game');
  }

  const btn: React.CSSProperties = {
    fontFamily: "var(--font-pixel), 'Courier New', monospace",
    fontSize: '0.55rem',
    background: 'transparent',
    border: '2px solid #003300',
    color: '#005514',
    padding: '1rem 2rem',
    cursor: 'pointer',
    letterSpacing: '0.1em',
    width: '100%',
    marginBottom: '0.75rem',
    transition: 'all 0.1s',
  };
  const btnActive: React.CSSProperties = {
    ...btn, border: '2px solid #00ff41', color: '#00ff41', boxShadow: '0 0 8px #00ff4133',
  };

  return (
    <div style={{ width: '100%' }}>
      {walletState === 'idle' && (
        <div>
          <button style={btnActive} onClick={handleConnect}>CONNECT LACE MIDNIGHT</button>
          <button style={{ ...btn, fontSize: '0.4rem', color: '#002200', borderColor: '#001100' }} onClick={handleBypass}>DEV MODE (SKIP WALLET)</button>
        </div>
      )}

      {walletState === 'detecting' && <button style={btn} disabled>DETECTING WALLET...</button>}
      {walletState === 'connecting' && <button style={btn} disabled>AUTHENTICATING AGENT...</button>}
      {walletState === 'joining' && <button style={btn} disabled>JOINING CONTRACT...</button>}

      {walletState === 'not_found' && (
        <div>
          <div style={{ border: '1px solid #003300', padding: '1rem', marginBottom: '1rem', textAlign: 'left' }}>
            <p style={{ fontSize: '0.45rem', color: '#ff4444', marginBottom: '0.5rem' }}>LACE MIDNIGHT NOT DETECTED</p>
            <p style={{ fontSize: '0.4rem', color: '#005514' }}>→ lace.io</p>
          </div>
          <button style={btn} onClick={handleConnect}>RETRY DETECTION</button>
          <button style={{ ...btn, fontSize: '0.4rem', color: '#002200', borderColor: '#001100' }} onClick={handleBypass}>DEV MODE (NO WALLET)</button>
        </div>
      )}

      {walletState === 'error' && (
        <div>
          <div style={{ border: '1px solid #330000', padding: '1rem', marginBottom: '1rem', textAlign: 'left' }}>
            <p style={{ fontSize: '0.45rem', color: '#ff4444', marginBottom: '0.5rem' }}>ERROR</p>
            <p style={{ fontSize: '0.4rem', color: '#003300' }}>{errorMsg}</p>
          </div>
          <button style={btnActive} onClick={handleConnect}>RETRY</button>
          <button style={{ ...btn, fontSize: '0.4rem', color: '#002200', borderColor: '#001100' }} onClick={handleBypass}>DEV MODE</button>
        </div>
      )}

      {walletState === 'contract' && (
        <div>
          <div style={{ border: '1px solid #003300', padding: '1rem', marginBottom: '1rem', textAlign: 'left' }}>
            <p style={{ fontSize: '0.45rem', color: '#005514', marginBottom: '0.5rem' }}>AGENT VERIFIED ✓</p>
            <p style={{ fontSize: '0.35rem', color: '#003300', wordBreak: 'break-all' }}>
              {address && address.length > 20 ? address.slice(0, 12) + '...' + address.slice(-12) : address}
            </p>
          </div>
          <p style={{ fontSize: '0.4rem', color: '#005514', marginBottom: '0.5rem', textAlign: 'left' }}>ENTER CONTRACT ADDRESS:</p>
          <input
            style={{
              fontFamily: "var(--font-pixel), 'Courier New', monospace",
              fontSize: '0.4rem',
              background: '#050505',
              border: '1px solid #003300',
              color: '#00ff41',
              padding: '0.75rem',
              width: '100%',
              marginBottom: '0.75rem',
              letterSpacing: '0.05em',
            }}
            type="text"
            value={contractAddress}
            onChange={e => setContractAddress(e.target.value)}
            placeholder="PASTE CONTRACT ADDRESS..."
            spellCheck={false}
          />
          {errorMsg && <p style={{ fontSize: '0.35rem', color: '#ff4444', marginBottom: '0.5rem' }}>{errorMsg}</p>}
          <button style={btnActive} onClick={handleJoinContract} disabled={!contractAddress.trim()}>JOIN CONTRACT →</button>
          <button style={{ ...btn, fontSize: '0.4rem', color: '#002200', borderColor: '#001100' }} onClick={handleBypass}>SKIP (DEV MODE)</button>
        </div>
      )}

      {walletState === 'connected' && (
        <div>
          <div style={{ border: '1px solid #003300', padding: '1rem', marginBottom: '1rem', textAlign: 'left' }}>
            <p style={{ fontSize: '0.45rem', color: '#005514', marginBottom: '0.5rem' }}>AGENT VERIFIED ✓</p>
            <p style={{ fontSize: '0.35rem', color: '#003300', wordBreak: 'break-all' }}>
              {address && address.length > 20 ? address.slice(0, 12) + '...' + address.slice(-12) : address}
            </p>
          </div>
          <button style={btnActive} onClick={handleProceed}>INITIATE MISSION →</button>
        </div>
      )}
    </div>
  );
}
