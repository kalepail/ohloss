// Network configuration
export const NETWORK = import.meta.env.VITE_NETWORK || 'mainnet';
export const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://mainnet.sorobanrpc.com';
export const HORIZON_URL = import.meta.env.VITE_HORIZON_URL || 'https://horizon.stellar.org';
export const NETWORK_PASSPHRASE =
  NETWORK === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

// Contract addresses
export const OHLOSS_CONTRACT = import.meta.env.VITE_OHLOSS_CONTRACT;
export const GAME_CONTRACT = import.meta.env.VITE_GAME_CONTRACT;
export const VAULT_CONTRACT = import.meta.env.VITE_VAULT_CONTRACT;

// Token addresses
export const XLM_TOKEN = import.meta.env.VITE_XLM_TOKEN;
export const USDC_TOKEN = import.meta.env.VITE_USDC_TOKEN;
export const BLND_TOKEN = import.meta.env.VITE_BLND_TOKEN;

// Other
export const SOROSWAP_ROUTER = import.meta.env.VITE_SOROSWAP_ROUTER;

// Relayer configuration
export const RELAYER_URL = import.meta.env.VITE_RELAYER_URL || '';
export const RELAYER_API_KEY = import.meta.env.VITE_RELAYER_API_KEY || '';

// Cloudflare Turnstile
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

// Faction definitions
export const FACTIONS = {
  WHOLENOODLE: 0,
  POINTYSTICK: 1,
  SPECIALROCK: 2,
} as const;

export const FACTION_NAMES = {
  [FACTIONS.WHOLENOODLE]: 'WholeNoodle',
  [FACTIONS.POINTYSTICK]: 'PointyStick',
  [FACTIONS.SPECIALROCK]: 'SpecialRock',
} as const;

export const FACTION_COLORS = {
  [FACTIONS.WHOLENOODLE]: {
    primary: 'bg-faction-wholenoodle-500',
    gradient: 'faction-wholenoodle-gradient',
    text: 'text-faction-wholenoodle-500',
    border: 'border-faction-wholenoodle-500',
  },
  [FACTIONS.POINTYSTICK]: {
    primary: 'bg-faction-pointystick-500',
    gradient: 'faction-pointystick-gradient',
    text: 'text-faction-pointystick-500',
    border: 'border-faction-pointystick-500',
  },
  [FACTIONS.SPECIALROCK]: {
    primary: 'bg-faction-specialrock-500',
    gradient: 'faction-specialrock-gradient',
    text: 'text-faction-specialrock-500',
    border: 'border-faction-specialrock-500',
  },
} as const;

// Decimal places for tokens
export const USDC_DECIMALS = 7;
export const BLND_DECIMALS = 7;

// Transaction settings
export const DEFAULT_FEE = '100000'; // Base fee in stroops (0.01 XLM)

// Default options for all contract method calls
// Matches pattern from bunt/e2e-game.ts
export const DEFAULT_METHOD_OPTIONS = {
  fee: DEFAULT_FEE, // 100,000 stroops = 0.01 XLM
  timeoutInSeconds: 30,
} as const;

// Authorization entry TTL settings
// Controls how long authorization signatures remain valid (in minutes)
export const DEFAULT_AUTH_TTL_MINUTES = 10; // Standard operations (10 minutes)
export const MULTI_SIG_AUTH_TTL_MINUTES = 1440; // Multi-step flows (24 hours)

// UI constants
export const NOTIFICATION_DURATION = 5000; // 5 seconds

// Game constants
export const MIN_GUESS = 1;
export const MAX_GUESS = 10;
