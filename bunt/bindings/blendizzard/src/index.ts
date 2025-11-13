import { Buffer } from "buffer";
import { Address } from '@stellar/stellar-sdk';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Typepoint,
  Duration,
} from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk'
export * as contract from '@stellar/stellar-sdk/contract'
export * as rpc from '@stellar/stellar-sdk/rpc'

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





/**
 * Global configuration
 * 
 * Stores contract configuration parameters.
 * Note: Admin address is stored separately via DataKey::Admin for single source of truth.
 * Note: Pause state is stored separately via DataKey::Paused for efficient access.
 */
export interface Config {
  /**
 * BLND token address
 */
blnd_token: string;
  /**
 * Duration of each epoch in seconds (default: 4 days = 345,600 seconds)
 */
epoch_duration: u64;
  /**
 * fee-vault-v2 contract address
 */
fee_vault: string;
  /**
 * Reserve token IDs for claiming BLND emissions from Blend pool
 * Formula: reserve_index * 2 + token_type
 * token_type: 0 = debt token, 1 = b-token (suppliers)
 * Example: For reserve 0 b-tokens (suppliers), use [1]
 */
reserve_token_ids: Array<u32>;
  /**
 * Soroswap router contract address
 */
soroswap_router: string;
  /**
 * USDC token address
 */
usdc_token: string;
}


/**
 * Persistent player data (across all epochs)
 * 
 * Stores the player's faction preference and time multiplier tracking.
 * This persists across epoch boundaries.
 */
export interface Player {
  /**
 * Player's vault balance from the previous epoch (for cross-epoch comparison)
 * Used to detect >50% withdrawal between epochs
 */
last_epoch_balance: i128;
  /**
 * The player's persistent faction selection (can be changed between epochs)
 */
selected_faction: u32;
  /**
 * Timestamp when the time multiplier calculation started
 * Set when player plays their first game (with vault balance > 0)
 * Reset to current time if player withdraws >50% between epochs
 */
time_multiplier_start: u64;
}


/**
 * Epoch metadata
 * 
 * Stores all information about an epoch including timing, standings, and rewards.
 */
export interface EpochInfo {
  /**
 * Unix timestamp when this epoch ends (start_time + epoch_duration)
 */
end_time: u64;
  /**
 * Map of faction_id -> total fp contributed by all players
 * Used to determine the winning faction
 */
faction_standings: Map<u32, i128>;
  /**
 * True if epoch has been finalized via cycle_epoch
 */
is_finalized: boolean;
  /**
 * Total USDC available for reward distribution (set during cycle_epoch)
 */
reward_pool: i128;
  /**
 * Unix timestamp when this epoch started
 */
start_time: u64;
  /**
 * The winning faction (None until epoch is finalized)
 */
winning_faction: Option<u32>;
}

/**
 * Game session status
 */
export type GameStatus = {tag: "Pending", values: void} | {tag: "Completed", values: void} | {tag: "Cancelled", values: void};


/**
 * Per-epoch player data
 * 
 * Created when a player first interacts with the contract in a new epoch.
 * Tracks faction points and epoch-specific faction lock.
 * FP is calculated once at first game of epoch based on vault balance.
 */
export interface EpochPlayer {
  /**
 * Available faction points (not locked in games)
 * Calculated once at first game of epoch and remains valid until next epoch
 */
available_fp: i128;
  /**
 * Player's vault balance snapshot at first game of this epoch
 * Captures the vault balance used to calculate this epoch's FP
 */
epoch_balance_snapshot: i128;
  /**
 * The faction locked in for this epoch (locked on first game)
 * None = not yet locked, Some(faction_id) = locked
 */
epoch_faction: Option<u32>;
  /**
 * Total faction points contributed to the player's faction this epoch
 * Used for reward distribution calculation
 */
total_fp_contributed: i128;
}


/**
 * Game outcome for verification
 * 
 * This is the data structure that should be proven by the ZK proof.
 * The proof verifies that these values are correct based on game execution.
 */
export interface GameOutcome {
  /**
 * Game contract address
 */
game_id: string;
  /**
 * First player's address
 */
player1: string;
  /**
 * Second player's address
 */
player2: string;
  /**
 * Unique session identifier
 */
session_id: u32;
  /**
 * Winner of the game
 * true = player1 won, false = player2 won
 */
winner: boolean;
}


/**
 * Game session tracking
 * 
 * Created when a game starts, updated when it ends.
 * Tracks all game state including players, wagers, and outcome.
 */
export interface GameSession {
  /**
 * Timestamp when game was created
 */
created_at: u64;
  /**
 * Epoch when this game was created
 * Used to prevent games from being completed in a different epoch
 */
epoch_id: u32;
  /**
 * Address of the game contract
 */
game_id: string;
  /**
 * First player's address
 */
player1: string;
  /**
 * Faction points wagered by player1
 */
player1_wager: i128;
  /**
 * Second player's address
 */
player2: string;
  /**
 * Faction points wagered by player2
 */
player2_wager: i128;
  /**
 * Current status of the game
 */
status: GameStatus;
  /**
 * Winner of the game (None until completed)
 * true = player1 won, false = player2 won
 */
winner: Option<boolean>;
}

/**
 * Error codes for the Blendizzard contract
 * 
 * All errors are represented as u32 values for efficient storage and transmission.
 * Error codes are grouped by category for better organization.
 */
export const Errors = {
  /**
   * Caller is not the admin
   */
  1: {message:"NotAdmin"},
  /**
   * Contract has already been initialized
   */
  2: {message:"AlreadyInitialized"},
  /**
   * Player has insufficient balance for the requested operation
   */
  10: {message:"InsufficientBalance"},
  /**
   * Player has insufficient faction points for the requested wager
   */
  11: {message:"InsufficientFactionPoints"},
  /**
   * Amount is invalid (e.g., zero or negative)
   */
  12: {message:"InvalidAmount"},
  /**
   * Faction ID is invalid (must be 0, 1, or 2)
   */
  13: {message:"InvalidFaction"},
  /**
   * Player's faction is already locked for this epoch (cannot change)
   */
  14: {message:"FactionAlreadyLocked"},
  /**
   * Player does not exist (no deposits or interactions yet)
   */
  15: {message:"PlayerNotFound"},
  /**
   * Player must select a faction before playing games
   */
  16: {message:"FactionNotSelected"},
  /**
   * Game contract is not in the whitelist
   */
  20: {message:"GameNotWhitelisted"},
  /**
   * Game session was not found
   */
  21: {message:"SessionNotFound"},
  /**
   * Game session with this ID already exists
   */
  22: {message:"SessionAlreadyExists"},
  /**
   * Game session is in an invalid state for this operation
   */
  23: {message:"InvalidSessionState"},
  /**
   * Game outcome data is invalid
   */
  24: {message:"InvalidGameOutcome"},
  /**
   * Proof verification failed (ZK proof is invalid)
   */
  25: {message:"ProofVerificationFailed"},
  /**
   * Game is from a previous epoch and cannot be completed
   */
  26: {message:"GameExpired"},
  /**
   * Epoch has not been finalized yet
   */
  30: {message:"EpochNotFinalized"},
  /**
   * Epoch has already been finalized
   */
  31: {message:"EpochAlreadyFinalized"},
  /**
   * Epoch cannot be cycled yet (not enough time has passed)
   */
  32: {message:"EpochNotReady"},
  /**
   * No rewards available for this player in this epoch
   */
  40: {message:"NoRewardsAvailable"},
  /**
   * Reward has already been claimed for this epoch
   */
  41: {message:"RewardAlreadyClaimed"},
  /**
   * Player was not in the winning faction for this epoch
   */
  42: {message:"NotWinningFaction"},
  /**
   * fee-vault-v2 operation failed
   */
  50: {message:"FeeVaultError"},
  /**
   * Soroswap swap operation failed
   */
  51: {message:"SwapError"},
  /**
   * Token transfer operation failed
   */
  52: {message:"TokenTransferError"},
  /**
   * Arithmetic overflow occurred
   */
  60: {message:"OverflowError"},
  /**
   * Division by zero attempted
   */
  61: {message:"DivisionByZero"},
  /**
   * Contract is paused (emergency stop activated)
   */
  70: {message:"ContractPaused"}
}










export type DataKey = {tag: "Admin", values: void} | {tag: "Config", values: void} | {tag: "CurrentEpoch", values: void} | {tag: "Paused", values: void} | {tag: "Player", values: readonly [string]} | {tag: "EpochPlayer", values: readonly [u32, string]} | {tag: "Epoch", values: readonly [u32]} | {tag: "Session", values: readonly [u32]} | {tag: "Game", values: readonly [string]} | {tag: "Claimed", values: readonly [string, u32]};

export interface Client {
  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pause the contract (emergency stop)
   * 
   * When paused, all player-facing functions are disabled except admin functions.
   * This is an emergency mechanism to protect player funds in case of discovered vulnerabilities.
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the admin
   */
  pause: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Check if a contract is an approved game
   */
  is_game: ({id}: {id: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Unpause the contract
   * 
   * Restores normal contract functionality after emergency pause.
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the admin
   */
  unpause: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the contract WASM hash (upgrade contract)
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the admin
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Add a game contract to the approved list
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the admin
   */
  add_game: ({id}: {id: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a end_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * End a game session with outcome verification
   * 
   * Requires game contract authorization. Both players' FP wagers are spent/burned.
   * Only the winner's wager contributes to their faction standings.
   * ZK proof verification handled client-side for MVP.
   * 
   * # Errors
   * * `SessionNotFound` - If session doesn't exist
   * * `InvalidSessionState` - If session is not Pending
   * * `InvalidGameOutcome` - If outcome data doesn't match session
   * * `ProofVerificationFailed` - If ZK proof is invalid
   */
  end_game: ({proof, outcome}: {proof: Buffer, outcome: GameOutcome}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the admin address
   */
  get_admin: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_epoch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get epoch information for a specific epoch
   * 
   * # Arguments
   * * `epoch` - The epoch number to retrieve
   * 
   * # Errors
   * * `EpochNotFinalized` - If requested epoch doesn't exist
   */
  get_epoch: ({epoch}: {epoch: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<EpochInfo>>>

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Check if contract is paused
   */
  is_paused: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the admin address
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the current admin
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current configuration
   */
  get_config: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Config>>

  /**
   * Construct and simulate a get_player transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get player information
   * 
   * Returns complete persistent player data including selected faction, total deposited,
   * and deposit timestamp.
   * 
   * # Errors
   * * `PlayerNotFound` - If player has never interacted with the contract
   */
  get_player: ({player}: {player: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<Player>>>

  /**
   * Construct and simulate a start_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Start a new game session
   * 
   * Locks factions and fp for both players. If this is a player's first game
   * in the epoch, initializes their fp and locks their faction.
   * 
   * # Errors
   * * `GameNotWhitelisted` - If game_id is not approved
   * * `SessionAlreadyExists` - If session_id already exists
   * * `InvalidAmount` - If wagers are <= 0
   * * `PlayerNotFound` - If players don't exist
   * * `InsufficientFactionPoints` - If players don't have enough fp
   * * `ContractPaused` - If contract is in emergency pause mode
   */
  start_game: ({game_id, session_id, player1, player2, player1_wager, player2_wager}: {game_id: string, session_id: u32, player1: string, player2: string, player1_wager: i128, player2_wager: i128}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a cycle_epoch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cycle to the next epoch
   * 
   * Finalizes current epoch (determines winner, withdraws BLND, swaps to USDC,
   * sets reward pool) and opens next epoch.
   * 
   * # Returns
   * The new epoch number
   * 
   * # Errors
   * * `EpochNotReady` - If not enough time has passed
   * * `EpochAlreadyFinalized` - If current epoch is already finalized
   * * `FeeVaultError` - If fee-vault operations fail
   * * `SwapError` - If BLND → USDC swap fails
   */
  cycle_epoch: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a remove_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Remove a game contract from the approved list
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the admin
   */
  remove_game: ({id}: {id: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a update_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update global configuration
   * 
   * Allows admin to update specific configuration parameters.
   * Only updates parameters that are provided (non-None).
   * 
   * # Arguments
   * * `new_fee_vault` - New fee-vault-v2 contract address (optional)
   * * `new_soroswap_router` - New Soroswap router contract address (optional)
   * * `new_blnd_token` - New BLND token address (optional)
   * * `new_usdc_token` - New USDC token address (optional)
   * * `new_epoch_duration` - New epoch duration in seconds (optional)
   * * `new_reserve_token_ids` - New reserve token IDs for claiming BLND emissions (optional)
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the admin
   */
  update_config: ({new_fee_vault, new_soroswap_router, new_blnd_token, new_usdc_token, new_epoch_duration, new_reserve_token_ids}: {new_fee_vault: Option<string>, new_soroswap_router: Option<string>, new_blnd_token: Option<string>, new_usdc_token: Option<string>, new_epoch_duration: Option<u64>, new_reserve_token_ids: Option<Array<u32>>}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a select_faction transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Select a faction for the player
   * 
   * Sets the player's persistent faction preference. Can be changed at ANY time.
   * If you haven't played a game this epoch, the new faction applies immediately.
   * If you've already played this epoch, the current epoch stays locked to your
   * old faction, and the new selection applies starting next epoch.
   * 
   * # Arguments
   * * `faction` - Faction ID (0=WholeNoodle, 1=PointyStick, 2=SpecialRock)
   * 
   * # Errors
   * * `InvalidFaction` - If faction ID is not 0, 1, or 2
   */
  select_faction: ({player, faction}: {player: string, faction: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_epoch_player transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get player's epoch-specific information for any epoch
   * 
   * Returns complete epoch-specific data including locked faction, available FP,
   * total FP contributed, and balance snapshot. Consistent with `get_epoch(epoch)`
   * which also requires an epoch parameter.
   * 
   * **Behavior for current epoch:** If player hasn't played any games this epoch yet,
   * calculates what their FP WOULD be based on current vault balance without writing
   * to storage. This allows UIs to display FP before the player's first game.
   * 
   * **Behavior for historical epochs:** Only returns data if player participated in
   * that epoch (played at least one game).
   * 
   * # Arguments
   * * `epoch` - Epoch number to query
   * * `player` - Player address
   * 
   * # Examples
   * ```ignore
   * // Current epoch
   * let current = contract.get_current_epoch();
   * let player_data = contract.get_epoch_player(&current, &player)?;
   * 
   * // Historical epoch
   * let epoch0_data = contract.get_epoch_player(&0, &player)?;
   * ```
   * 
   * # Errors
   * * `FactionNotSelected` - If querying current epoch and player hasn't selected faction
   * * `PlayerNot
   */
  get_epoch_player: ({epoch, player}: {epoch: u32, player: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<EpochPlayer>>>

  /**
   * Construct and simulate a get_current_epoch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current epoch number
   * 
   * # Returns
   * The current epoch number
   */
  get_current_epoch: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a claim_epoch_reward transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Claim epoch reward for a player for a specific epoch
   * 
   * Players who contributed FP to the winning faction can claim their share
   * of the epoch's reward pool (USDC converted from BLND yield).
   * 
   * **Note:** To check claimable amounts or claim status before calling,
   * use transaction simulation. This is the idiomatic Soroban pattern.
   * 
   * # Returns
   * Amount of USDC claimed
   * 
   * # Errors
   * * `EpochNotFinalized` - If epoch doesn't exist or isn't finalized
   * * `RewardAlreadyClaimed` - If player already claimed for this epoch
   * * `NotWinningFaction` - If player wasn't in the winning faction
   * * `NoRewardsAvailable` - If player has no rewards to claim
   * * `ContractPaused` - If contract is in emergency pause mode
   */
  claim_epoch_reward: ({player, epoch}: {player: string, epoch: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<i128>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, fee_vault, soroswap_router, blnd_token, usdc_token, epoch_duration, reserve_token_ids}: {admin: string, fee_vault: string, soroswap_router: string, blnd_token: string, usdc_token: string, epoch_duration: u64, reserve_token_ids: Array<u32>},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, fee_vault, soroswap_router, blnd_token, usdc_token, epoch_duration, reserve_token_ids}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAQRQYXVzZSB0aGUgY29udHJhY3QgKGVtZXJnZW5jeSBzdG9wKQoKV2hlbiBwYXVzZWQsIGFsbCBwbGF5ZXItZmFjaW5nIGZ1bmN0aW9ucyBhcmUgZGlzYWJsZWQgZXhjZXB0IGFkbWluIGZ1bmN0aW9ucy4KVGhpcyBpcyBhbiBlbWVyZ2VuY3kgbWVjaGFuaXNtIHRvIHByb3RlY3QgcGxheWVyIGZ1bmRzIGluIGNhc2Ugb2YgZGlzY292ZXJlZCB2dWxuZXJhYmlsaXRpZXMuCgojIEVycm9ycwoqIGBOb3RBZG1pbmAgLSBJZiBjYWxsZXIgaXMgbm90IHRoZSBhZG1pbgAAAAVwYXVzZQAAAAAAAAAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAACdDaGVjayBpZiBhIGNvbnRyYWN0IGlzIGFuIGFwcHJvdmVkIGdhbWUAAAAAB2lzX2dhbWUAAAAAAQAAAAAAAAACaWQAAAAAABMAAAABAAAAAQ==",
        "AAAAAAAAAIdVbnBhdXNlIHRoZSBjb250cmFjdAoKUmVzdG9yZXMgbm9ybWFsIGNvbnRyYWN0IGZ1bmN0aW9uYWxpdHkgYWZ0ZXIgZW1lcmdlbmN5IHBhdXNlLgoKIyBFcnJvcnMKKiBgTm90QWRtaW5gIC0gSWYgY2FsbGVyIGlzIG5vdCB0aGUgYWRtaW4AAAAAB3VucGF1c2UAAAAAAAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAGRVcGRhdGUgdGhlIGNvbnRyYWN0IFdBU00gaGFzaCAodXBncmFkZSBjb250cmFjdCkKCiMgRXJyb3JzCiogYE5vdEFkbWluYCAtIElmIGNhbGxlciBpcyBub3QgdGhlIGFkbWluAAAAB3VwZ3JhZGUAAAAAAQAAAAAAAAANbmV3X3dhc21faGFzaAAAAAAAA+4AAAAgAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAAFxBZGQgYSBnYW1lIGNvbnRyYWN0IHRvIHRoZSBhcHByb3ZlZCBsaXN0CgojIEVycm9ycwoqIGBOb3RBZG1pbmAgLSBJZiBjYWxsZXIgaXMgbm90IHRoZSBhZG1pbgAAAAhhZGRfZ2FtZQAAAAEAAAAAAAAAAmlkAAAAAAATAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAAdFFbmQgYSBnYW1lIHNlc3Npb24gd2l0aCBvdXRjb21lIHZlcmlmaWNhdGlvbgoKUmVxdWlyZXMgZ2FtZSBjb250cmFjdCBhdXRob3JpemF0aW9uLiBCb3RoIHBsYXllcnMnIEZQIHdhZ2VycyBhcmUgc3BlbnQvYnVybmVkLgpPbmx5IHRoZSB3aW5uZXIncyB3YWdlciBjb250cmlidXRlcyB0byB0aGVpciBmYWN0aW9uIHN0YW5kaW5ncy4KWksgcHJvb2YgdmVyaWZpY2F0aW9uIGhhbmRsZWQgY2xpZW50LXNpZGUgZm9yIE1WUC4KCiMgRXJyb3JzCiogYFNlc3Npb25Ob3RGb3VuZGAgLSBJZiBzZXNzaW9uIGRvZXNuJ3QgZXhpc3QKKiBgSW52YWxpZFNlc3Npb25TdGF0ZWAgLSBJZiBzZXNzaW9uIGlzIG5vdCBQZW5kaW5nCiogYEludmFsaWRHYW1lT3V0Y29tZWAgLSBJZiBvdXRjb21lIGRhdGEgZG9lc24ndCBtYXRjaCBzZXNzaW9uCiogYFByb29mVmVyaWZpY2F0aW9uRmFpbGVkYCAtIElmIFpLIHByb29mIGlzIGludmFsaWQAAAAAAAAIZW5kX2dhbWUAAAACAAAAAAAAAAVwcm9vZgAAAAAAAA4AAAAAAAAAB291dGNvbWUAAAAH0AAAAAtHYW1lT3V0Y29tZQAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAABVHZXQgdGhlIGFkbWluIGFkZHJlc3MAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAKNHZXQgZXBvY2ggaW5mb3JtYXRpb24gZm9yIGEgc3BlY2lmaWMgZXBvY2gKCiMgQXJndW1lbnRzCiogYGVwb2NoYCAtIFRoZSBlcG9jaCBudW1iZXIgdG8gcmV0cmlldmUKCiMgRXJyb3JzCiogYEVwb2NoTm90RmluYWxpemVkYCAtIElmIHJlcXVlc3RlZCBlcG9jaCBkb2Vzbid0IGV4aXN0AAAAAAlnZXRfZXBvY2gAAAAAAAABAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAABAAAD6QAAB9AAAAAJRXBvY2hJbmZvAAAAAAAAAw==",
        "AAAAAAAAABtDaGVjayBpZiBjb250cmFjdCBpcyBwYXVzZWQAAAAACWlzX3BhdXNlZAAAAAAAAAAAAAABAAAAAQ==",
        "AAAAAAAAAFRVcGRhdGUgdGhlIGFkbWluIGFkZHJlc3MKCiMgRXJyb3JzCiogYE5vdEFkbWluYCAtIElmIGNhbGxlciBpcyBub3QgdGhlIGN1cnJlbnQgYWRtaW4AAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAB1HZXQgdGhlIGN1cnJlbnQgY29uZmlndXJhdGlvbgAAAAAAAApnZXRfY29uZmlnAAAAAAAAAAAAAQAAB9AAAAAGQ29uZmlnAAA=",
        "AAAAAAAAANNHZXQgcGxheWVyIGluZm9ybWF0aW9uCgpSZXR1cm5zIGNvbXBsZXRlIHBlcnNpc3RlbnQgcGxheWVyIGRhdGEgaW5jbHVkaW5nIHNlbGVjdGVkIGZhY3Rpb24sIHRvdGFsIGRlcG9zaXRlZCwKYW5kIGRlcG9zaXQgdGltZXN0YW1wLgoKIyBFcnJvcnMKKiBgUGxheWVyTm90Rm91bmRgIC0gSWYgcGxheWVyIGhhcyBuZXZlciBpbnRlcmFjdGVkIHdpdGggdGhlIGNvbnRyYWN0AAAAAApnZXRfcGxheWVyAAAAAAABAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAD6QAAB9AAAAAGUGxheWVyAAAAAAAD",
        "AAAAAAAAAeNTdGFydCBhIG5ldyBnYW1lIHNlc3Npb24KCkxvY2tzIGZhY3Rpb25zIGFuZCBmcCBmb3IgYm90aCBwbGF5ZXJzLiBJZiB0aGlzIGlzIGEgcGxheWVyJ3MgZmlyc3QgZ2FtZQppbiB0aGUgZXBvY2gsIGluaXRpYWxpemVzIHRoZWlyIGZwIGFuZCBsb2NrcyB0aGVpciBmYWN0aW9uLgoKIyBFcnJvcnMKKiBgR2FtZU5vdFdoaXRlbGlzdGVkYCAtIElmIGdhbWVfaWQgaXMgbm90IGFwcHJvdmVkCiogYFNlc3Npb25BbHJlYWR5RXhpc3RzYCAtIElmIHNlc3Npb25faWQgYWxyZWFkeSBleGlzdHMKKiBgSW52YWxpZEFtb3VudGAgLSBJZiB3YWdlcnMgYXJlIDw9IDAKKiBgUGxheWVyTm90Rm91bmRgIC0gSWYgcGxheWVycyBkb24ndCBleGlzdAoqIGBJbnN1ZmZpY2llbnRGYWN0aW9uUG9pbnRzYCAtIElmIHBsYXllcnMgZG9uJ3QgaGF2ZSBlbm91Z2ggZnAKKiBgQ29udHJhY3RQYXVzZWRgIC0gSWYgY29udHJhY3QgaXMgaW4gZW1lcmdlbmN5IHBhdXNlIG1vZGUAAAAACnN0YXJ0X2dhbWUAAAAAAAYAAAAAAAAAB2dhbWVfaWQAAAAAEwAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADXBsYXllcjFfd2FnZXIAAAAAAAALAAAAAAAAAA1wbGF5ZXIyX3dhZ2VyAAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAYZDeWNsZSB0byB0aGUgbmV4dCBlcG9jaAoKRmluYWxpemVzIGN1cnJlbnQgZXBvY2ggKGRldGVybWluZXMgd2lubmVyLCB3aXRoZHJhd3MgQkxORCwgc3dhcHMgdG8gVVNEQywKc2V0cyByZXdhcmQgcG9vbCkgYW5kIG9wZW5zIG5leHQgZXBvY2guCgojIFJldHVybnMKVGhlIG5ldyBlcG9jaCBudW1iZXIKCiMgRXJyb3JzCiogYEVwb2NoTm90UmVhZHlgIC0gSWYgbm90IGVub3VnaCB0aW1lIGhhcyBwYXNzZWQKKiBgRXBvY2hBbHJlYWR5RmluYWxpemVkYCAtIElmIGN1cnJlbnQgZXBvY2ggaXMgYWxyZWFkeSBmaW5hbGl6ZWQKKiBgRmVlVmF1bHRFcnJvcmAgLSBJZiBmZWUtdmF1bHQgb3BlcmF0aW9ucyBmYWlsCiogYFN3YXBFcnJvcmAgLSBJZiBCTE5EIOKGkiBVU0RDIHN3YXAgZmFpbHMAAAAAAAtjeWNsZV9lcG9jaAAAAAAAAAAAAQAAA+kAAAAEAAAAAw==",
        "AAAAAAAAAGFSZW1vdmUgYSBnYW1lIGNvbnRyYWN0IGZyb20gdGhlIGFwcHJvdmVkIGxpc3QKCiMgRXJyb3JzCiogYE5vdEFkbWluYCAtIElmIGNhbGxlciBpcyBub3QgdGhlIGFkbWluAAAAAAAAC3JlbW92ZV9nYW1lAAAAAAEAAAAAAAAAAmlkAAAAAAATAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAAAAAAAAMX19jaGVja19hdXRoAAAAAwAAAAAAAAARc2lnbmF0dXJlX3BheWxvYWQAAAAAAAPuAAAAIAAAAAAAAAAJc2lnbmF0dXJlAAAAAAAD6AAAAAAAAAAAAAAADWF1dGhfY29udGV4dHMAAAAAAAPqAAAH0AAAAAdDb250ZXh0AAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAnRJbml0aWFsaXplIHRoZSBjb250cmFjdAoKU2V0cyB1cCB0aGUgYWRtaW4sIGV4dGVybmFsIGNvbnRyYWN0IGFkZHJlc3NlcywgYW5kIGNyZWF0ZXMgdGhlIGZpcnN0IGVwb2NoLgoKIyBBcmd1bWVudHMKKiBgYWRtaW5gIC0gQWRtaW4gYWRkcmVzcyAoY2FuIG1vZGlmeSBjb25maWcgYW5kIHVwZ3JhZGUgY29udHJhY3QpCiogYGZlZV92YXVsdGAgLSBmZWUtdmF1bHQtdjIgY29udHJhY3QgYWRkcmVzcwoqIGBzb3Jvc3dhcF9yb3V0ZXJgIC0gU29yb3N3YXAgcm91dGVyIGNvbnRyYWN0IGFkZHJlc3MKKiBgYmxuZF90b2tlbmAgLSBCTE5EIHRva2VuIGFkZHJlc3MKKiBgdXNkY190b2tlbmAgLSBVU0RDIHRva2VuIGFkZHJlc3MKKiBgZXBvY2hfZHVyYXRpb25gIC0gRHVyYXRpb24gb2YgZWFjaCBlcG9jaCBpbiBzZWNvbmRzIChkZWZhdWx0OiAzNDUsNjAwID0gNCBkYXlzKQoqIGByZXNlcnZlX3Rva2VuX2lkc2AgLSBSZXNlcnZlIHRva2VuIElEcyBmb3IgY2xhaW1pbmcgQkxORCBlbWlzc2lvbnMgKGUuZy4sIHZlYyFbJmVudiwgMV0gZm9yIHJlc2VydmUgMCBiLXRva2VucykKCiMgRXJyb3JzCiogYEFscmVhZHlJbml0aWFsaXplZGAgLSBJZiBjb250cmFjdCBoYXMgYWxyZWFkeSBiZWVuIGluaXRpYWxpemVkAAAADV9fY29uc3RydWN0b3IAAAAAAAAHAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACWZlZV92YXVsdAAAAAAAABMAAAAAAAAAD3Nvcm9zd2FwX3JvdXRlcgAAAAATAAAAAAAAAApibG5kX3Rva2VuAAAAAAATAAAAAAAAAAp1c2RjX3Rva2VuAAAAAAATAAAAAAAAAA5lcG9jaF9kdXJhdGlvbgAAAAAABgAAAAAAAAARcmVzZXJ2ZV90b2tlbl9pZHMAAAAAAAPqAAAABAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAmFVcGRhdGUgZ2xvYmFsIGNvbmZpZ3VyYXRpb24KCkFsbG93cyBhZG1pbiB0byB1cGRhdGUgc3BlY2lmaWMgY29uZmlndXJhdGlvbiBwYXJhbWV0ZXJzLgpPbmx5IHVwZGF0ZXMgcGFyYW1ldGVycyB0aGF0IGFyZSBwcm92aWRlZCAobm9uLU5vbmUpLgoKIyBBcmd1bWVudHMKKiBgbmV3X2ZlZV92YXVsdGAgLSBOZXcgZmVlLXZhdWx0LXYyIGNvbnRyYWN0IGFkZHJlc3MgKG9wdGlvbmFsKQoqIGBuZXdfc29yb3N3YXBfcm91dGVyYCAtIE5ldyBTb3Jvc3dhcCByb3V0ZXIgY29udHJhY3QgYWRkcmVzcyAob3B0aW9uYWwpCiogYG5ld19ibG5kX3Rva2VuYCAtIE5ldyBCTE5EIHRva2VuIGFkZHJlc3MgKG9wdGlvbmFsKQoqIGBuZXdfdXNkY190b2tlbmAgLSBOZXcgVVNEQyB0b2tlbiBhZGRyZXNzIChvcHRpb25hbCkKKiBgbmV3X2Vwb2NoX2R1cmF0aW9uYCAtIE5ldyBlcG9jaCBkdXJhdGlvbiBpbiBzZWNvbmRzIChvcHRpb25hbCkKKiBgbmV3X3Jlc2VydmVfdG9rZW5faWRzYCAtIE5ldyByZXNlcnZlIHRva2VuIElEcyBmb3IgY2xhaW1pbmcgQkxORCBlbWlzc2lvbnMgKG9wdGlvbmFsKQoKIyBFcnJvcnMKKiBgTm90QWRtaW5gIC0gSWYgY2FsbGVyIGlzIG5vdCB0aGUgYWRtaW4AAAAAAAANdXBkYXRlX2NvbmZpZwAAAAAAAAYAAAAAAAAADW5ld19mZWVfdmF1bHQAAAAAAAPoAAAAEwAAAAAAAAATbmV3X3Nvcm9zd2FwX3JvdXRlcgAAAAPoAAAAEwAAAAAAAAAObmV3X2JsbmRfdG9rZW4AAAAAA+gAAAATAAAAAAAAAA5uZXdfdXNkY190b2tlbgAAAAAD6AAAABMAAAAAAAAAEm5ld19lcG9jaF9kdXJhdGlvbgAAAAAD6AAAAAYAAAAAAAAAFW5ld19yZXNlcnZlX3Rva2VuX2lkcwAAAAAAA+gAAAPqAAAABAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAdpTZWxlY3QgYSBmYWN0aW9uIGZvciB0aGUgcGxheWVyCgpTZXRzIHRoZSBwbGF5ZXIncyBwZXJzaXN0ZW50IGZhY3Rpb24gcHJlZmVyZW5jZS4gQ2FuIGJlIGNoYW5nZWQgYXQgQU5ZIHRpbWUuCklmIHlvdSBoYXZlbid0IHBsYXllZCBhIGdhbWUgdGhpcyBlcG9jaCwgdGhlIG5ldyBmYWN0aW9uIGFwcGxpZXMgaW1tZWRpYXRlbHkuCklmIHlvdSd2ZSBhbHJlYWR5IHBsYXllZCB0aGlzIGVwb2NoLCB0aGUgY3VycmVudCBlcG9jaCBzdGF5cyBsb2NrZWQgdG8geW91cgpvbGQgZmFjdGlvbiwgYW5kIHRoZSBuZXcgc2VsZWN0aW9uIGFwcGxpZXMgc3RhcnRpbmcgbmV4dCBlcG9jaC4KCiMgQXJndW1lbnRzCiogYGZhY3Rpb25gIC0gRmFjdGlvbiBJRCAoMD1XaG9sZU5vb2RsZSwgMT1Qb2ludHlTdGljaywgMj1TcGVjaWFsUm9jaykKCiMgRXJyb3JzCiogYEludmFsaWRGYWN0aW9uYCAtIElmIGZhY3Rpb24gSUQgaXMgbm90IDAsIDEsIG9yIDIAAAAAAA5zZWxlY3RfZmFjdGlvbgAAAAAAAgAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAdmYWN0aW9uAAAAAAQAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAABABHZXQgcGxheWVyJ3MgZXBvY2gtc3BlY2lmaWMgaW5mb3JtYXRpb24gZm9yIGFueSBlcG9jaAoKUmV0dXJucyBjb21wbGV0ZSBlcG9jaC1zcGVjaWZpYyBkYXRhIGluY2x1ZGluZyBsb2NrZWQgZmFjdGlvbiwgYXZhaWxhYmxlIEZQLAp0b3RhbCBGUCBjb250cmlidXRlZCwgYW5kIGJhbGFuY2Ugc25hcHNob3QuIENvbnNpc3RlbnQgd2l0aCBgZ2V0X2Vwb2NoKGVwb2NoKWAKd2hpY2ggYWxzbyByZXF1aXJlcyBhbiBlcG9jaCBwYXJhbWV0ZXIuCgoqKkJlaGF2aW9yIGZvciBjdXJyZW50IGVwb2NoOioqIElmIHBsYXllciBoYXNuJ3QgcGxheWVkIGFueSBnYW1lcyB0aGlzIGVwb2NoIHlldCwKY2FsY3VsYXRlcyB3aGF0IHRoZWlyIEZQIFdPVUxEIGJlIGJhc2VkIG9uIGN1cnJlbnQgdmF1bHQgYmFsYW5jZSB3aXRob3V0IHdyaXRpbmcKdG8gc3RvcmFnZS4gVGhpcyBhbGxvd3MgVUlzIHRvIGRpc3BsYXkgRlAgYmVmb3JlIHRoZSBwbGF5ZXIncyBmaXJzdCBnYW1lLgoKKipCZWhhdmlvciBmb3IgaGlzdG9yaWNhbCBlcG9jaHM6KiogT25seSByZXR1cm5zIGRhdGEgaWYgcGxheWVyIHBhcnRpY2lwYXRlZCBpbgp0aGF0IGVwb2NoIChwbGF5ZWQgYXQgbGVhc3Qgb25lIGdhbWUpLgoKIyBBcmd1bWVudHMKKiBgZXBvY2hgIC0gRXBvY2ggbnVtYmVyIHRvIHF1ZXJ5CiogYHBsYXllcmAgLSBQbGF5ZXIgYWRkcmVzcwoKIyBFeGFtcGxlcwpgYGBpZ25vcmUKLy8gQ3VycmVudCBlcG9jaApsZXQgY3VycmVudCA9IGNvbnRyYWN0LmdldF9jdXJyZW50X2Vwb2NoKCk7CmxldCBwbGF5ZXJfZGF0YSA9IGNvbnRyYWN0LmdldF9lcG9jaF9wbGF5ZXIoJmN1cnJlbnQsICZwbGF5ZXIpPzsKCi8vIEhpc3RvcmljYWwgZXBvY2gKbGV0IGVwb2NoMF9kYXRhID0gY29udHJhY3QuZ2V0X2Vwb2NoX3BsYXllcigmMCwgJnBsYXllcik/OwpgYGAKCiMgRXJyb3JzCiogYEZhY3Rpb25Ob3RTZWxlY3RlZGAgLSBJZiBxdWVyeWluZyBjdXJyZW50IGVwb2NoIGFuZCBwbGF5ZXIgaGFzbid0IHNlbGVjdGVkIGZhY3Rpb24KKiBgUGxheWVyTm90AAAAEGdldF9lcG9jaF9wbGF5ZXIAAAACAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAPpAAAH0AAAAAtFcG9jaFBsYXllcgAAAAAD",
        "AAAAAAAAAEBHZXQgdGhlIGN1cnJlbnQgZXBvY2ggbnVtYmVyCgojIFJldHVybnMKVGhlIGN1cnJlbnQgZXBvY2ggbnVtYmVyAAAAEWdldF9jdXJyZW50X2Vwb2NoAAAAAAAAAAAAAAEAAAAE",
        "AAAAAAAAAqxDbGFpbSBlcG9jaCByZXdhcmQgZm9yIGEgcGxheWVyIGZvciBhIHNwZWNpZmljIGVwb2NoCgpQbGF5ZXJzIHdobyBjb250cmlidXRlZCBGUCB0byB0aGUgd2lubmluZyBmYWN0aW9uIGNhbiBjbGFpbSB0aGVpciBzaGFyZQpvZiB0aGUgZXBvY2gncyByZXdhcmQgcG9vbCAoVVNEQyBjb252ZXJ0ZWQgZnJvbSBCTE5EIHlpZWxkKS4KCioqTm90ZToqKiBUbyBjaGVjayBjbGFpbWFibGUgYW1vdW50cyBvciBjbGFpbSBzdGF0dXMgYmVmb3JlIGNhbGxpbmcsCnVzZSB0cmFuc2FjdGlvbiBzaW11bGF0aW9uLiBUaGlzIGlzIHRoZSBpZGlvbWF0aWMgU29yb2JhbiBwYXR0ZXJuLgoKIyBSZXR1cm5zCkFtb3VudCBvZiBVU0RDIGNsYWltZWQKCiMgRXJyb3JzCiogYEVwb2NoTm90RmluYWxpemVkYCAtIElmIGVwb2NoIGRvZXNuJ3QgZXhpc3Qgb3IgaXNuJ3QgZmluYWxpemVkCiogYFJld2FyZEFscmVhZHlDbGFpbWVkYCAtIElmIHBsYXllciBhbHJlYWR5IGNsYWltZWQgZm9yIHRoaXMgZXBvY2gKKiBgTm90V2lubmluZ0ZhY3Rpb25gIC0gSWYgcGxheWVyIHdhc24ndCBpbiB0aGUgd2lubmluZyBmYWN0aW9uCiogYE5vUmV3YXJkc0F2YWlsYWJsZWAgLSBJZiBwbGF5ZXIgaGFzIG5vIHJld2FyZHMgdG8gY2xhaW0KKiBgQ29udHJhY3RQYXVzZWRgIC0gSWYgY29udHJhY3QgaXMgaW4gZW1lcmdlbmN5IHBhdXNlIG1vZGUAAAASY2xhaW1fZXBvY2hfcmV3YXJkAAAAAAACAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAABWVwb2NoAAAAAAAABAAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAQAAAOhHbG9iYWwgY29uZmlndXJhdGlvbgoKU3RvcmVzIGNvbnRyYWN0IGNvbmZpZ3VyYXRpb24gcGFyYW1ldGVycy4KTm90ZTogQWRtaW4gYWRkcmVzcyBpcyBzdG9yZWQgc2VwYXJhdGVseSB2aWEgRGF0YUtleTo6QWRtaW4gZm9yIHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGguCk5vdGU6IFBhdXNlIHN0YXRlIGlzIHN0b3JlZCBzZXBhcmF0ZWx5IHZpYSBEYXRhS2V5OjpQYXVzZWQgZm9yIGVmZmljaWVudCBhY2Nlc3MuAAAAAAAAAAZDb25maWcAAAAAAAYAAAASQkxORCB0b2tlbiBhZGRyZXNzAAAAAAAKYmxuZF90b2tlbgAAAAAAEwAAAEVEdXJhdGlvbiBvZiBlYWNoIGVwb2NoIGluIHNlY29uZHMgKGRlZmF1bHQ6IDQgZGF5cyA9IDM0NSw2MDAgc2Vjb25kcykAAAAAAAAOZXBvY2hfZHVyYXRpb24AAAAAAAYAAAAdZmVlLXZhdWx0LXYyIGNvbnRyYWN0IGFkZHJlc3MAAAAAAAAJZmVlX3ZhdWx0AAAAAAAAEwAAAM5SZXNlcnZlIHRva2VuIElEcyBmb3IgY2xhaW1pbmcgQkxORCBlbWlzc2lvbnMgZnJvbSBCbGVuZCBwb29sCkZvcm11bGE6IHJlc2VydmVfaW5kZXggKiAyICsgdG9rZW5fdHlwZQp0b2tlbl90eXBlOiAwID0gZGVidCB0b2tlbiwgMSA9IGItdG9rZW4gKHN1cHBsaWVycykKRXhhbXBsZTogRm9yIHJlc2VydmUgMCBiLXRva2VucyAoc3VwcGxpZXJzKSwgdXNlIFsxXQAAAAAAEXJlc2VydmVfdG9rZW5faWRzAAAAAAAD6gAAAAQAAAAgU29yb3N3YXAgcm91dGVyIGNvbnRyYWN0IGFkZHJlc3MAAAAPc29yb3N3YXBfcm91dGVyAAAAABMAAAASVVNEQyB0b2tlbiBhZGRyZXNzAAAAAAAKdXNkY190b2tlbgAAAAAAEw==",
        "AAAAAQAAAJdQZXJzaXN0ZW50IHBsYXllciBkYXRhIChhY3Jvc3MgYWxsIGVwb2NocykKClN0b3JlcyB0aGUgcGxheWVyJ3MgZmFjdGlvbiBwcmVmZXJlbmNlIGFuZCB0aW1lIG11bHRpcGxpZXIgdHJhY2tpbmcuClRoaXMgcGVyc2lzdHMgYWNyb3NzIGVwb2NoIGJvdW5kYXJpZXMuAAAAAAAAAAAGUGxheWVyAAAAAAADAAAAeVBsYXllcidzIHZhdWx0IGJhbGFuY2UgZnJvbSB0aGUgcHJldmlvdXMgZXBvY2ggKGZvciBjcm9zcy1lcG9jaCBjb21wYXJpc29uKQpVc2VkIHRvIGRldGVjdCA+NTAlIHdpdGhkcmF3YWwgYmV0d2VlbiBlcG9jaHMAAAAAAAASbGFzdF9lcG9jaF9iYWxhbmNlAAAAAAALAAAASVRoZSBwbGF5ZXIncyBwZXJzaXN0ZW50IGZhY3Rpb24gc2VsZWN0aW9uIChjYW4gYmUgY2hhbmdlZCBiZXR3ZWVuIGVwb2NocykAAAAAAAAQc2VsZWN0ZWRfZmFjdGlvbgAAAAQAAAC0VGltZXN0YW1wIHdoZW4gdGhlIHRpbWUgbXVsdGlwbGllciBjYWxjdWxhdGlvbiBzdGFydGVkClNldCB3aGVuIHBsYXllciBwbGF5cyB0aGVpciBmaXJzdCBnYW1lICh3aXRoIHZhdWx0IGJhbGFuY2UgPiAwKQpSZXNldCB0byBjdXJyZW50IHRpbWUgaWYgcGxheWVyIHdpdGhkcmF3cyA+NTAlIGJldHdlZW4gZXBvY2hzAAAAFXRpbWVfbXVsdGlwbGllcl9zdGFydAAAAAAAAAY=",
        "AAAAAQAAAF9FcG9jaCBtZXRhZGF0YQoKU3RvcmVzIGFsbCBpbmZvcm1hdGlvbiBhYm91dCBhbiBlcG9jaCBpbmNsdWRpbmcgdGltaW5nLCBzdGFuZGluZ3MsIGFuZCByZXdhcmRzLgAAAAAAAAAACUVwb2NoSW5mbwAAAAAAAAYAAABBVW5peCB0aW1lc3RhbXAgd2hlbiB0aGlzIGVwb2NoIGVuZHMgKHN0YXJ0X3RpbWUgKyBlcG9jaF9kdXJhdGlvbikAAAAAAAAIZW5kX3RpbWUAAAAGAAAAXk1hcCBvZiBmYWN0aW9uX2lkIC0+IHRvdGFsIGZwIGNvbnRyaWJ1dGVkIGJ5IGFsbCBwbGF5ZXJzClVzZWQgdG8gZGV0ZXJtaW5lIHRoZSB3aW5uaW5nIGZhY3Rpb24AAAAAABFmYWN0aW9uX3N0YW5kaW5ncwAAAAAAA+wAAAAEAAAACwAAADBUcnVlIGlmIGVwb2NoIGhhcyBiZWVuIGZpbmFsaXplZCB2aWEgY3ljbGVfZXBvY2gAAAAMaXNfZmluYWxpemVkAAAAAQAAAEVUb3RhbCBVU0RDIGF2YWlsYWJsZSBmb3IgcmV3YXJkIGRpc3RyaWJ1dGlvbiAoc2V0IGR1cmluZyBjeWNsZV9lcG9jaCkAAAAAAAALcmV3YXJkX3Bvb2wAAAAACwAAACZVbml4IHRpbWVzdGFtcCB3aGVuIHRoaXMgZXBvY2ggc3RhcnRlZAAAAAAACnN0YXJ0X3RpbWUAAAAAAAYAAAAzVGhlIHdpbm5pbmcgZmFjdGlvbiAoTm9uZSB1bnRpbCBlcG9jaCBpcyBmaW5hbGl6ZWQpAAAAAA93aW5uaW5nX2ZhY3Rpb24AAAAD6AAAAAQ=",
        "AAAAAgAAABNHYW1lIHNlc3Npb24gc3RhdHVzAAAAAAAAAAAKR2FtZVN0YXR1cwAAAAAAAwAAAAAAAAAmR2FtZSBoYXMgc3RhcnRlZCBidXQgbm90IHlldCBjb21wbGV0ZWQAAAAAAAdQZW5kaW5nAAAAAAAAAAAqR2FtZSBoYXMgY29tcGxldGVkIHdpdGggYSB2ZXJpZmllZCBvdXRjb21lAAAAAAAJQ29tcGxldGVkAAAAAAAAAAAAACJHYW1lIHdhcyBjYW5jZWxsZWQgKGUuZy4sIHRpbWVvdXQpAAAAAAAJQ2FuY2VsbGVkAAAA",
        "AAAAAQAAANpQZXItZXBvY2ggcGxheWVyIGRhdGEKCkNyZWF0ZWQgd2hlbiBhIHBsYXllciBmaXJzdCBpbnRlcmFjdHMgd2l0aCB0aGUgY29udHJhY3QgaW4gYSBuZXcgZXBvY2guClRyYWNrcyBmYWN0aW9uIHBvaW50cyBhbmQgZXBvY2gtc3BlY2lmaWMgZmFjdGlvbiBsb2NrLgpGUCBpcyBjYWxjdWxhdGVkIG9uY2UgYXQgZmlyc3QgZ2FtZSBvZiBlcG9jaCBiYXNlZCBvbiB2YXVsdCBiYWxhbmNlLgAAAAAAAAAAAAtFcG9jaFBsYXllcgAAAAAEAAAAeEF2YWlsYWJsZSBmYWN0aW9uIHBvaW50cyAobm90IGxvY2tlZCBpbiBnYW1lcykKQ2FsY3VsYXRlZCBvbmNlIGF0IGZpcnN0IGdhbWUgb2YgZXBvY2ggYW5kIHJlbWFpbnMgdmFsaWQgdW50aWwgbmV4dCBlcG9jaAAAAAxhdmFpbGFibGVfZnAAAAALAAAAeFBsYXllcidzIHZhdWx0IGJhbGFuY2Ugc25hcHNob3QgYXQgZmlyc3QgZ2FtZSBvZiB0aGlzIGVwb2NoCkNhcHR1cmVzIHRoZSB2YXVsdCBiYWxhbmNlIHVzZWQgdG8gY2FsY3VsYXRlIHRoaXMgZXBvY2gncyBGUAAAABZlcG9jaF9iYWxhbmNlX3NuYXBzaG90AAAAAAALAAAAbFRoZSBmYWN0aW9uIGxvY2tlZCBpbiBmb3IgdGhpcyBlcG9jaCAobG9ja2VkIG9uIGZpcnN0IGdhbWUpCk5vbmUgPSBub3QgeWV0IGxvY2tlZCwgU29tZShmYWN0aW9uX2lkKSA9IGxvY2tlZAAAAA1lcG9jaF9mYWN0aW9uAAAAAAAD6AAAAAQAAABsVG90YWwgZmFjdGlvbiBwb2ludHMgY29udHJpYnV0ZWQgdG8gdGhlIHBsYXllcidzIGZhY3Rpb24gdGhpcyBlcG9jaApVc2VkIGZvciByZXdhcmQgZGlzdHJpYnV0aW9uIGNhbGN1bGF0aW9uAAAAFHRvdGFsX2ZwX2NvbnRyaWJ1dGVkAAAACw==",
        "AAAAAQAAAKpHYW1lIG91dGNvbWUgZm9yIHZlcmlmaWNhdGlvbgoKVGhpcyBpcyB0aGUgZGF0YSBzdHJ1Y3R1cmUgdGhhdCBzaG91bGQgYmUgcHJvdmVuIGJ5IHRoZSBaSyBwcm9vZi4KVGhlIHByb29mIHZlcmlmaWVzIHRoYXQgdGhlc2UgdmFsdWVzIGFyZSBjb3JyZWN0IGJhc2VkIG9uIGdhbWUgZXhlY3V0aW9uLgAAAAAAAAAAAAtHYW1lT3V0Y29tZQAAAAAFAAAAFUdhbWUgY29udHJhY3QgYWRkcmVzcwAAAAAAAAdnYW1lX2lkAAAAABMAAAAWRmlyc3QgcGxheWVyJ3MgYWRkcmVzcwAAAAAAB3BsYXllcjEAAAAAEwAAABdTZWNvbmQgcGxheWVyJ3MgYWRkcmVzcwAAAAAHcGxheWVyMgAAAAATAAAAGVVuaXF1ZSBzZXNzaW9uIGlkZW50aWZpZXIAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAADpXaW5uZXIgb2YgdGhlIGdhbWUKdHJ1ZSA9IHBsYXllcjEgd29uLCBmYWxzZSA9IHBsYXllcjIgd29uAAAAAAAGd2lubmVyAAAAAAAB",
        "AAAAAQAAAIZHYW1lIHNlc3Npb24gdHJhY2tpbmcKCkNyZWF0ZWQgd2hlbiBhIGdhbWUgc3RhcnRzLCB1cGRhdGVkIHdoZW4gaXQgZW5kcy4KVHJhY2tzIGFsbCBnYW1lIHN0YXRlIGluY2x1ZGluZyBwbGF5ZXJzLCB3YWdlcnMsIGFuZCBvdXRjb21lLgAAAAAAAAAAAAtHYW1lU2Vzc2lvbgAAAAAJAAAAH1RpbWVzdGFtcCB3aGVuIGdhbWUgd2FzIGNyZWF0ZWQAAAAACmNyZWF0ZWRfYXQAAAAAAAYAAABgRXBvY2ggd2hlbiB0aGlzIGdhbWUgd2FzIGNyZWF0ZWQKVXNlZCB0byBwcmV2ZW50IGdhbWVzIGZyb20gYmVpbmcgY29tcGxldGVkIGluIGEgZGlmZmVyZW50IGVwb2NoAAAACGVwb2NoX2lkAAAABAAAABxBZGRyZXNzIG9mIHRoZSBnYW1lIGNvbnRyYWN0AAAAB2dhbWVfaWQAAAAAEwAAABZGaXJzdCBwbGF5ZXIncyBhZGRyZXNzAAAAAAAHcGxheWVyMQAAAAATAAAAIUZhY3Rpb24gcG9pbnRzIHdhZ2VyZWQgYnkgcGxheWVyMQAAAAAAAA1wbGF5ZXIxX3dhZ2VyAAAAAAAACwAAABdTZWNvbmQgcGxheWVyJ3MgYWRkcmVzcwAAAAAHcGxheWVyMgAAAAATAAAAIUZhY3Rpb24gcG9pbnRzIHdhZ2VyZWQgYnkgcGxheWVyMgAAAAAAAA1wbGF5ZXIyX3dhZ2VyAAAAAAAACwAAABpDdXJyZW50IHN0YXR1cyBvZiB0aGUgZ2FtZQAAAAAABnN0YXR1cwAAAAAH0AAAAApHYW1lU3RhdHVzAAAAAABRV2lubmVyIG9mIHRoZSBnYW1lIChOb25lIHVudGlsIGNvbXBsZXRlZCkKdHJ1ZSA9IHBsYXllcjEgd29uLCBmYWxzZSA9IHBsYXllcjIgd29uAAAAAAAABndpbm5lcgAAAAAD6AAAAAE=",
        "AAAABAAAALdFcnJvciBjb2RlcyBmb3IgdGhlIEJsZW5kaXp6YXJkIGNvbnRyYWN0CgpBbGwgZXJyb3JzIGFyZSByZXByZXNlbnRlZCBhcyB1MzIgdmFsdWVzIGZvciBlZmZpY2llbnQgc3RvcmFnZSBhbmQgdHJhbnNtaXNzaW9uLgpFcnJvciBjb2RlcyBhcmUgZ3JvdXBlZCBieSBjYXRlZ29yeSBmb3IgYmV0dGVyIG9yZ2FuaXphdGlvbi4AAAAAAAAAAAVFcnJvcgAAAAAAABwAAAAXQ2FsbGVyIGlzIG5vdCB0aGUgYWRtaW4AAAAACE5vdEFkbWluAAAAAQAAACVDb250cmFjdCBoYXMgYWxyZWFkeSBiZWVuIGluaXRpYWxpemVkAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAADtQbGF5ZXIgaGFzIGluc3VmZmljaWVudCBiYWxhbmNlIGZvciB0aGUgcmVxdWVzdGVkIG9wZXJhdGlvbgAAAAATSW5zdWZmaWNpZW50QmFsYW5jZQAAAAAKAAAAPlBsYXllciBoYXMgaW5zdWZmaWNpZW50IGZhY3Rpb24gcG9pbnRzIGZvciB0aGUgcmVxdWVzdGVkIHdhZ2VyAAAAAAAZSW5zdWZmaWNpZW50RmFjdGlvblBvaW50cwAAAAAAAAsAAAAqQW1vdW50IGlzIGludmFsaWQgKGUuZy4sIHplcm8gb3IgbmVnYXRpdmUpAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAwAAAAqRmFjdGlvbiBJRCBpcyBpbnZhbGlkIChtdXN0IGJlIDAsIDEsIG9yIDIpAAAAAAAOSW52YWxpZEZhY3Rpb24AAAAAAA0AAABBUGxheWVyJ3MgZmFjdGlvbiBpcyBhbHJlYWR5IGxvY2tlZCBmb3IgdGhpcyBlcG9jaCAoY2Fubm90IGNoYW5nZSkAAAAAAAAURmFjdGlvbkFscmVhZHlMb2NrZWQAAAAOAAAAN1BsYXllciBkb2VzIG5vdCBleGlzdCAobm8gZGVwb3NpdHMgb3IgaW50ZXJhY3Rpb25zIHlldCkAAAAADlBsYXllck5vdEZvdW5kAAAAAAAPAAAAMVBsYXllciBtdXN0IHNlbGVjdCBhIGZhY3Rpb24gYmVmb3JlIHBsYXlpbmcgZ2FtZXMAAAAAAAASRmFjdGlvbk5vdFNlbGVjdGVkAAAAAAAQAAAAJUdhbWUgY29udHJhY3QgaXMgbm90IGluIHRoZSB3aGl0ZWxpc3QAAAAAAAASR2FtZU5vdFdoaXRlbGlzdGVkAAAAAAAUAAAAGkdhbWUgc2Vzc2lvbiB3YXMgbm90IGZvdW5kAAAAAAAPU2Vzc2lvbk5vdEZvdW5kAAAAABUAAAAoR2FtZSBzZXNzaW9uIHdpdGggdGhpcyBJRCBhbHJlYWR5IGV4aXN0cwAAABRTZXNzaW9uQWxyZWFkeUV4aXN0cwAAABYAAAA2R2FtZSBzZXNzaW9uIGlzIGluIGFuIGludmFsaWQgc3RhdGUgZm9yIHRoaXMgb3BlcmF0aW9uAAAAAAATSW52YWxpZFNlc3Npb25TdGF0ZQAAAAAXAAAAHEdhbWUgb3V0Y29tZSBkYXRhIGlzIGludmFsaWQAAAASSW52YWxpZEdhbWVPdXRjb21lAAAAAAAYAAAAL1Byb29mIHZlcmlmaWNhdGlvbiBmYWlsZWQgKFpLIHByb29mIGlzIGludmFsaWQpAAAAABdQcm9vZlZlcmlmaWNhdGlvbkZhaWxlZAAAAAAZAAAANUdhbWUgaXMgZnJvbSBhIHByZXZpb3VzIGVwb2NoIGFuZCBjYW5ub3QgYmUgY29tcGxldGVkAAAAAAAAC0dhbWVFeHBpcmVkAAAAABoAAAAgRXBvY2ggaGFzIG5vdCBiZWVuIGZpbmFsaXplZCB5ZXQAAAARRXBvY2hOb3RGaW5hbGl6ZWQAAAAAAAAeAAAAIEVwb2NoIGhhcyBhbHJlYWR5IGJlZW4gZmluYWxpemVkAAAAFUVwb2NoQWxyZWFkeUZpbmFsaXplZAAAAAAAAB8AAAA3RXBvY2ggY2Fubm90IGJlIGN5Y2xlZCB5ZXQgKG5vdCBlbm91Z2ggdGltZSBoYXMgcGFzc2VkKQAAAAANRXBvY2hOb3RSZWFkeQAAAAAAACAAAAAyTm8gcmV3YXJkcyBhdmFpbGFibGUgZm9yIHRoaXMgcGxheWVyIGluIHRoaXMgZXBvY2gAAAAAABJOb1Jld2FyZHNBdmFpbGFibGUAAAAAACgAAAAuUmV3YXJkIGhhcyBhbHJlYWR5IGJlZW4gY2xhaW1lZCBmb3IgdGhpcyBlcG9jaAAAAAAAFFJld2FyZEFscmVhZHlDbGFpbWVkAAAAKQAAADRQbGF5ZXIgd2FzIG5vdCBpbiB0aGUgd2lubmluZyBmYWN0aW9uIGZvciB0aGlzIGVwb2NoAAAAEU5vdFdpbm5pbmdGYWN0aW9uAAAAAAAAKgAAAB1mZWUtdmF1bHQtdjIgb3BlcmF0aW9uIGZhaWxlZAAAAAAAAA1GZWVWYXVsdEVycm9yAAAAAAAAMgAAAB5Tb3Jvc3dhcCBzd2FwIG9wZXJhdGlvbiBmYWlsZWQAAAAAAAlTd2FwRXJyb3IAAAAAAAAzAAAAH1Rva2VuIHRyYW5zZmVyIG9wZXJhdGlvbiBmYWlsZWQAAAAAElRva2VuVHJhbnNmZXJFcnJvcgAAAAAANAAAABxBcml0aG1ldGljIG92ZXJmbG93IG9jY3VycmVkAAAADU92ZXJmbG93RXJyb3IAAAAAAAA8AAAAGkRpdmlzaW9uIGJ5IHplcm8gYXR0ZW1wdGVkAAAAAAAORGl2aXNpb25CeVplcm8AAAAAAD0AAAAtQ29udHJhY3QgaXMgcGF1c2VkIChlbWVyZ2VuY3kgc3RvcCBhY3RpdmF0ZWQpAAAAAAAADkNvbnRyYWN0UGF1c2VkAAAAAABG",
        "AAAABQAAAAAAAAAAAAAACUdhbWVBZGRlZAAAAAAAAAEAAAAKZ2FtZV9hZGRlZAAAAAAAAQAAAAAAAAAHZ2FtZV9pZAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAACUdhbWVFbmRlZAAAAAAAAAEAAAAKZ2FtZV9lbmRlZAAAAAAABQAAAAAAAAAHZ2FtZV9pZAAAAAATAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAAAAAAABndpbm5lcgAAAAAAEwAAAAAAAAAAAAAABWxvc2VyAAAAAAAAEwAAAAAAAAAAAAAADmZwX2NvbnRyaWJ1dGVkAAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC0Vwb2NoQ3ljbGVkAAAAAAEAAAAMZXBvY2hfY3ljbGVkAAAABAAAAAAAAAAJb2xkX2Vwb2NoAAAAAAAABAAAAAAAAAAAAAAACW5ld19lcG9jaAAAAAAAAAQAAAAAAAAAAAAAAA93aW5uaW5nX2ZhY3Rpb24AAAAABAAAAAAAAAAAAAAAC3Jld2FyZF9wb29sAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAC0dhbWVSZW1vdmVkAAAAAAEAAAAMZ2FtZV9yZW1vdmVkAAAAAQAAAAAAAAAHZ2FtZV9pZAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC0dhbWVTdGFydGVkAAAAAAEAAAAMZ2FtZV9zdGFydGVkAAAABgAAAAAAAAAHZ2FtZV9pZAAAAAATAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAAAAAAAB3BsYXllcjEAAAAAEwAAAAAAAAAAAAAAB3BsYXllcjIAAAAAEwAAAAAAAAAAAAAADXBsYXllcjFfd2FnZXIAAAAAAAALAAAAAAAAAAAAAAANcGxheWVyMl93YWdlcgAAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADEFkbWluQ2hhbmdlZAAAAAEAAAANYWRtaW5fY2hhbmdlZAAAAAAAAAIAAAAAAAAACW9sZF9hZG1pbgAAAAAAABMAAAAAAAAAAAAAAAluZXdfYWRtaW4AAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADUNvbmZpZ1VwZGF0ZWQAAAAAAAABAAAADmNvbmZpZ191cGRhdGVkAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADlJld2FyZHNDbGFpbWVkAAAAAAABAAAAD3Jld2FyZHNfY2xhaW1lZAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAAAAAAAAAAAAAdmYWN0aW9uAAAAAAQAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAD0ZhY3Rpb25TZWxlY3RlZAAAAAABAAAAEGZhY3Rpb25fc2VsZWN0ZWQAAAACAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAAAAAAAAdmYWN0aW9uAAAAAAQAAAAAAAAAAg==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACgAAAAAAAAAsQWRtaW4gYWRkcmVzcyAtIHNpbmdsZXRvbiAoSW5zdGFuY2Ugc3RvcmFnZSkAAAAFQWRtaW4AAAAAAAAAAAAAM0dsb2JhbCBjb25maWd1cmF0aW9uIC0gc2luZ2xldG9uIChJbnN0YW5jZSBzdG9yYWdlKQAAAAAGQ29uZmlnAAAAAAAAAAAAM0N1cnJlbnQgZXBvY2ggbnVtYmVyIC0gc2luZ2xldG9uIChJbnN0YW5jZSBzdG9yYWdlKQAAAAAMQ3VycmVudEVwb2NoAAAAAAAAACpQYXVzZSBzdGF0ZSAtIHNpbmdsZXRvbiAoSW5zdGFuY2Ugc3RvcmFnZSkAAAAAAAZQYXVzZWQAAAAAAAEAAABOUGxheWVyIHBlcnNpc3RlbnQgZGF0YSAtIFBsYXllcihwbGF5ZXJfYWRkcmVzcykgLT4gUGxheWVyIChQZXJzaXN0ZW50IHN0b3JhZ2UpAAAAAAAGUGxheWVyAAAAAAABAAAAEwAAAAEAAABpUGxheWVyIGVwb2NoLXNwZWNpZmljIGRhdGEgLSBFcG9jaFBsYXllcihlcG9jaF9udW1iZXIsIHBsYXllcl9hZGRyZXNzKSAtPiBFcG9jaFBsYXllciAoVGVtcG9yYXJ5IHN0b3JhZ2UpAAAAAAAAC0Vwb2NoUGxheWVyAAAAAAIAAAAEAAAAEwAAAAEAAABFRXBvY2ggbWV0YWRhdGEgLSBFcG9jaChlcG9jaF9udW1iZXIpIC0+IEVwb2NoSW5mbyAoVGVtcG9yYXJ5IHN0b3JhZ2UpAAAAAAAABUVwb2NoAAAAAAAAAQAAAAQAAAABAAAASkdhbWUgc2Vzc2lvbiBkYXRhIC0gU2Vzc2lvbihzZXNzaW9uX2lkKSAtPiBHYW1lU2Vzc2lvbiAoVGVtcG9yYXJ5IHN0b3JhZ2UpAAAAAAAHU2Vzc2lvbgAAAAABAAAABAAAAAEAAABMV2hpdGVsaXN0ZWQgZ2FtZSBjb250cmFjdHMgLSBHYW1lKGdhbWVfYWRkcmVzcykgLT4gYm9vbCAoUGVyc2lzdGVudCBzdG9yYWdlKQAAAARHYW1lAAAAAQAAABMAAAABAAAAWVJld2FyZCBjbGFpbSB0cmFja2luZyAtIENsYWltZWQocGxheWVyX2FkZHJlc3MsIGVwb2NoX251bWJlcikgLT4gYm9vbCAoVGVtcG9yYXJ5IHN0b3JhZ2UpAAAAAAAAB0NsYWltZWQAAAAAAgAAABMAAAAE" ]),
      options
    )
  }
  public readonly fromJSON = {
    pause: this.txFromJSON<Result<void>>,
        is_game: this.txFromJSON<boolean>,
        unpause: this.txFromJSON<Result<void>>,
        upgrade: this.txFromJSON<Result<void>>,
        add_game: this.txFromJSON<Result<void>>,
        end_game: this.txFromJSON<Result<void>>,
        get_admin: this.txFromJSON<string>,
        get_epoch: this.txFromJSON<Result<EpochInfo>>,
        is_paused: this.txFromJSON<boolean>,
        set_admin: this.txFromJSON<Result<void>>,
        get_config: this.txFromJSON<Config>,
        get_player: this.txFromJSON<Result<Player>>,
        start_game: this.txFromJSON<Result<void>>,
        cycle_epoch: this.txFromJSON<Result<u32>>,
        remove_game: this.txFromJSON<Result<void>>,
        update_config: this.txFromJSON<Result<void>>,
        select_faction: this.txFromJSON<Result<void>>,
        get_epoch_player: this.txFromJSON<Result<EpochPlayer>>,
        get_current_epoch: this.txFromJSON<u32>,
        claim_epoch_reward: this.txFromJSON<Result<i128>>
  }
}