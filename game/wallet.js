const SESSION_KEY = 'midnight_shielded_address';
const WALLET_KEY = 'midnight_wallet_choice';
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

export function getAddress() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SESSION_KEY);
}

export function setAddress(address) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_KEY, address);
}

export function clearAddress() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

export function truncateAddress(address, chars = 8) {
  if (!address) return 'ANONYMOUS';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Connect to a wallet by key in window.midnight.
 * @param {'lace'|'1am'} walletKey
 * @param {(msg: string) => void} onStatus
 */
async function connectByKey(walletKey, onStatus = () => {}) {
  const midnight = window.midnight;
  if (!midnight) throw new Error('No Midnight wallet detected.');

  // Try direct key first, then scan by rdns
  const rdnsMap = { lace: 'io.lace.wallet', '1am': 'network.1am.wallet' };
  let walletEntry = midnight[walletKey];
  if (!walletEntry && rdnsMap[walletKey]) {
    walletEntry = Object.values(midnight).find((e) => e?.rdns === rdnsMap[walletKey]);
  }
  if (!walletEntry) throw new Error(`${walletKey} wallet not found.`);

  onStatus(`CONNECTING TO ${walletKey.toUpperCase()}...`);
  const connectedApi = await walletEntry.connect('mainnet');

  onStatus('FETCHING SHIELDED ADDRESS...');
  const addresses = await connectedApi.getShieldedAddresses();
  const shieldedAddress = addresses?.shieldedAddress || addresses?.[0] || 'UNKNOWN_AGENT';

  window.__midnightConnectedApi = connectedApi;
  setAddress(shieldedAddress);
  localStorage.setItem(WALLET_KEY, walletKey);

  onStatus('CONNECTED');
  return { shieldedAddress };
}

export function getLastWalletKey() {
  return localStorage.getItem(WALLET_KEY);
}

export async function connectLace(onStatus = () => {}) {
  return connectByKey('lace', onStatus);
}

export async function connect1AM(onStatus = () => {}) {
  return connectByKey('1am', onStatus);
}
