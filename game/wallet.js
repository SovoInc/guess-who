const SESSION_KEY = 'midnight_shielded_address';
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

export function getAddress() {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(SESSION_KEY);
}

export function setAddress(address) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_KEY, address);
}

export function clearAddress() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SESSION_KEY);
}

export function truncateAddress(address, chars = 8) {
  if (!address) return 'ANONYMOUS';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Connect to Lace wallet and join the hardcoded contract.
 * @param {(msg: string) => void} onStatus - Called with status update strings
 * @returns {Promise<{ shieldedAddress: string }>}
 */
export async function connectLace(onStatus = () => {}) {
  const midnight = window.midnight;
  if (!midnight) throw new Error('Lace wallet not detected. Install Midnight Lace extension.');

  const walletEntry = Object.values(midnight).find((e) => e?.rdns === 'io.lace.wallet');
  if (!walletEntry) throw new Error('Lace wallet (io.lace.wallet) not found.');

  onStatus('CONNECTING TO LACE...');
  const connectedApi = await walletEntry.connect('preprod');

  onStatus('FETCHING SHIELDED ADDRESS...');
  const addresses = await connectedApi.getShieldedAddresses();
  const shieldedAddress = addresses?.shieldedAddress || addresses?.[0] || 'UNKNOWN_AGENT';

  window.__midnightConnectedApi = connectedApi;
  setAddress(shieldedAddress);

  onStatus('CONNECTED');
  return { shieldedAddress };
}
