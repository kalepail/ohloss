export interface RuntimeConfig {
  rpcUrl?: string;
  networkPassphrase?: string;
  contractIds?: Record<string, string>;
  simulationSourceAddress?: string;
}

export function getRuntimeConfig(): RuntimeConfig | null {
  if (typeof globalThis === 'undefined') return null;
  const config = (globalThis as { __OHLOSS_CONFIG__?: unknown }).__OHLOSS_CONFIG__;
  if (!config || typeof config !== 'object') return null;
  return config as RuntimeConfig;
}
