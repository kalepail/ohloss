export type FactionId = 0 | 1 | 2;

export interface Player {
  selected_faction: FactionId;
  deposit_timestamp: bigint;
  last_epoch_balance: bigint;
}

export interface EpochPlayer {
  epoch_faction: FactionId | null;
  initial_balance: bigint;
  available_fp: bigint;
  locked_fp: bigint;
  total_fp_contributed: bigint;
}

export interface EpochInfo {
  epoch_num: number;
  start_time: bigint;
  end_time: bigint;
  reward_pool: bigint;
  faction_standings: [bigint, bigint, bigint]; // [WholeNoodle, PointyStick, SpecialRock]
  winning_faction: FactionId | null;
}

export interface Config {
  admin: string;
  fee_vault: string;
  soroswap_router: string;
  blnd_token: string;
  usdc_token: string;
  epoch_duration: bigint;
  reserve_token_ids: number[];
}

export interface Game {
  player1: string;
  player2: string;
  player1_wager: bigint;
  player2_wager: bigint;
  player1_guess: number | null;
  player2_guess: number | null;
  winning_number: number | null;
  winner: string | null;
}

export type TxStatus = 'pending' | 'confirmed' | 'failed';

export interface Transaction {
  hash: string;
  type: 'deposit' | 'withdraw' | 'game' | 'claim' | 'faction';
  status: TxStatus;
  amount?: bigint;
  timestamp: number;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: number;
  duration?: number;
}

export type WalletType = 'freighter' | 'xbull' | null;

export interface ContractError {
  code: number;
  message: string;
}
