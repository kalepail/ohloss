import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
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
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
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
 * Developer reward share as fixed-point (7 decimals)
 * Portion of epoch rewards allocated to game developers
 * Default: 1_000_000 (10% = 0.10 with 7 decimals)
 */
dev_reward_share: i128;
  /**
 * Duration of each epoch in seconds (default: 4 days = 345,600 seconds)
 */
epoch_duration: u64;
  /**
 * fee-vault-v2 contract address
 */
fee_vault: string;
  /**
 * Base FP granted to all players each epoch regardless of deposit (7 decimals)
 * Enables "free play" where players can participate without depositing
 * Default: 100_0000000 (100 FP)
 */
free_fp_per_epoch: i128;
  /**
 * Minimum vault balance required to claim epoch rewards (7 decimals)
 * Anti-sybil mechanism: players must deposit to extract value
 * Default: 1_0000000 (1 USDC)
 */
min_deposit_to_claim: i128;
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
 * Game registration info (Persistent storage)
 * 
 * Stores the developer address for whitelisted games.
 * Used to track FP contributions and developer reward claims.
 */
export interface GameInfo {
  /**
 * Developer address who receives reward share for this game
 */
developer: string;
}


/**
 * Per-epoch game contribution tracking (Temporary storage)
 * 
 * Tracks total FP contributed through a game during an epoch.
 * Used to calculate developer's share of the reward pool.
 */
export interface EpochGame {
  /**
 * Total FP from all games (both player wagers combined)
 */
total_fp_contributed: i128;
}


/**
 * Epoch metadata
 * 
 * Stores all information about an epoch including timing, standings, and rewards.
 */
export interface EpochInfo {
  /**
 * Developer reward pool (portion of rewards for game developers)
 * Set during cycle_epoch: total_rewards * dev_reward_share
 */
dev_reward_pool: i128;
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
 * Total USDC available for player reward distribution (set during cycle_epoch)
 * This is 90% of total rewards (after dev share is deducted)
 */
reward_pool: i128;
  /**
 * Unix timestamp when this epoch started
 */
start_time: u64;
  /**
 * Total FP wagered across all games this epoch
 * Used to calculate each game's share of the dev reward pool
 */
total_game_fp: i128;
  /**
 * The winning faction (None until epoch is finalized)
 */
winning_faction: Option<u32>;
}


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
 * Game session tracking
 * 
 * Created when a game starts, updated when it ends.
 * Tracks all game state including players, wagers, and outcome.
 */
export interface GameSession {
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
 * Winner of the game (None = pending, Some = completed)
 * true = player1 won, false = player2 won
 */
player1_won: Option<boolean>;
  /**
 * Second player's address
 */
player2: string;
  /**
 * Faction points wagered by player2
 */
player2_wager: i128;
}

/**
 * Error codes for the Ohloss contract
 * 
 * All errors are represented as u32 values for efficient storage and transmission.
 * Error codes are grouped by category for better organization.
 */
export const Errors = {
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
   * Game is from a previous epoch and cannot be completed
   */
  25: {message:"GameExpired"},
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
   * Player must deposit minimum amount to claim rewards (anti-sybil)
   */
  43: {message:"DepositRequiredToClaim"},
  /**
   * Soroswap swap operation failed
   */
  51: {message:"SwapError"},
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
  70: {message:"ContractPaused"},
  /**
   * Game is not registered (for dev claims)
   */
  80: {message:"GameNotRegistered"},
  /**
   * Game has no contributions in this epoch
   */
  81: {message:"GameNoContributions"},
  /**
   * Developer has already claimed reward for this game/epoch
   */
  82: {message:"DevRewardAlreadyClaimed"},
  /**
   * Caller is not the registered developer for this game
   */
  83: {message:"NotGameDeveloper"}
}














export type DataKey = {tag: "Admin", values: void} | {tag: "Config", values: void} | {tag: "CurrentEpoch", values: void} | {tag: "Paused", values: void} | {tag: "Player", values: readonly [string]} | {tag: "EpochPlayer", values: readonly [u32, string]} | {tag: "Epoch", values: readonly [u32]} | {tag: "Session", values: readonly [u32]} | {tag: "Game", values: readonly [string]} | {tag: "EpochGame", values: readonly [u32, string]} | {tag: "Claimed", values: readonly [string, u32]} | {tag: "DevClaimed", values: readonly [string, u32]};

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
  pause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Check if a contract is an approved game
   */
  is_game: ({game_id}: {game_id: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Unpause the contract
   * 
   * Restores normal contract functionality after emergency pause.
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the admin
   */
  unpause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the contract WASM hash (upgrade contract)
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the admin
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Add or update a game contract registration
   * 
   * Registers a game contract with a developer address for reward distribution.
   * Can be called multiple times to update the developer address.
   * 
   * # Arguments
   * * `game_id` - Address of the game contract to register
   * * `developer` - Address to receive developer rewards for this game
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the admin
   */
  add_game: ({game_id, developer}: {game_id: string, developer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a end_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * End a game session with outcome verification
   * 
   * Requires game contract authorization. Both players' FP wagers are spent/burned.
   * Only the winner's wager contributes to their faction standings.
   * 
   * Outcome verification is handled by the individual game contracts.
   * Each game is responsible for implementing its own verification mechanism
   * (multi-sig oracle, ZK proofs, etc.) before calling this function.
   * 
   * # Arguments
   * * `session_id` - The unique session identifier
   * * `player1_won` - true if player1 won, false if player2 won
   * 
   * # Errors
   * * `SessionNotFound` - If session doesn't exist
   * * `InvalidSessionState` - If session is not Pending
   * * `GameExpired` - If game is from a previous epoch
   */
  end_game: ({session_id, player1_won}: {session_id: u32, player1_won: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the admin address
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

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
  get_epoch: ({epoch}: {epoch: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<EpochInfo>>>

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Check if contract is paused
   */
  is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the admin address
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the current admin
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current configuration
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>

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
  get_player: ({player}: {player: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Player>>>

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
  start_game: ({game_id, session_id, player1, player2, player1_wager, player2_wager}: {game_id: string, session_id: u32, player1: string, player2: string, player1_wager: i128, player2_wager: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
  cycle_epoch: (options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a remove_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Remove a game contract from the approved list
   * 
   * Note: If the game has contributions in the current epoch, those will be
   * forfeited (developer cannot claim rewards for removed games).
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the admin
   */
  remove_game: ({game_id}: {game_id: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
   * * `new_free_fp_per_epoch` - New base FP for free play (optional)
   * * `new_min_deposit_to_claim` - New minimum deposit to claim rewards (optional)
   * * `new_dev_reward_share` - New portion of epoch rewards for game developers (optional)
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the admin
   */
  update_config: ({new_fee_vault, new_soroswap_router, new_blnd_token, new_usdc_token, new_epoch_duration, new_reserve_token_ids, new_free_fp_per_epoch, new_min_deposit_to_claim, new_dev_reward_share}: {new_fee_vault: Option<string>, new_soroswap_router: Option<string>, new_blnd_token: Option<string>, new_usdc_token: Option<string>, new_epoch_duration: Option<u64>, new_reserve_token_ids: Option<Array<u32>>, new_free_fp_per_epoch: Option<i128>, new_min_deposit_to_claim: Option<i128>, new_dev_reward_share: Option<i128>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
  select_faction: ({player, faction}: {player: string, faction: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a claim_dev_reward transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Claim developer reward for a specific epoch
   * 
   * Developers claim their aggregated share of the epoch's dev reward pool
   * proportional to total FP contributed through all their registered games.
   * 
   * **Note:** To check claimable amounts or claim status before calling,
   * use transaction simulation. This is the idiomatic Soroban pattern.
   * 
   * # Arguments
   * * `developer` - Developer address claiming rewards
   * * `epoch` - Epoch number to claim from
   * 
   * # Returns
   * Amount of USDC claimed and transferred to developer
   * 
   * # Errors
   * * `EpochNotFinalized` - If epoch doesn't exist or isn't finalized
   * * `DevRewardAlreadyClaimed` - If already claimed for this epoch
   * * `GameNoContributions` - If developer has no contributions this epoch
   * * `ContractPaused` - If contract is in emergency pause mode
   */
  claim_dev_reward: ({developer, epoch}: {developer: string, epoch: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

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
  get_epoch_player: ({epoch, player}: {epoch: u32, player: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<EpochPlayer>>>

  /**
   * Construct and simulate a get_current_epoch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current epoch number
   * 
   * # Returns
   * The current epoch number
   */
  get_current_epoch: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

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
  claim_epoch_reward: ({player, epoch}: {player: string, epoch: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, fee_vault, soroswap_router, blnd_token, usdc_token, epoch_duration, reserve_token_ids, free_fp_per_epoch, min_deposit_to_claim, dev_reward_share}: {admin: string, fee_vault: string, soroswap_router: string, blnd_token: string, usdc_token: string, epoch_duration: u64, reserve_token_ids: Array<u32>, free_fp_per_epoch: i128, min_deposit_to_claim: i128, dev_reward_share: i128},
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
    return ContractClient.deploy({admin, fee_vault, soroswap_router, blnd_token, usdc_token, epoch_duration, reserve_token_ids, free_fp_per_epoch, min_deposit_to_claim, dev_reward_share}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAQRQYXVzZSB0aGUgY29udHJhY3QgKGVtZXJnZW5jeSBzdG9wKQoKV2hlbiBwYXVzZWQsIGFsbCBwbGF5ZXItZmFjaW5nIGZ1bmN0aW9ucyBhcmUgZGlzYWJsZWQgZXhjZXB0IGFkbWluIGZ1bmN0aW9ucy4KVGhpcyBpcyBhbiBlbWVyZ2VuY3kgbWVjaGFuaXNtIHRvIHByb3RlY3QgcGxheWVyIGZ1bmRzIGluIGNhc2Ugb2YgZGlzY292ZXJlZCB2dWxuZXJhYmlsaXRpZXMuCgojIEVycm9ycwoqIGBOb3RBZG1pbmAgLSBJZiBjYWxsZXIgaXMgbm90IHRoZSBhZG1pbgAAAAVwYXVzZQAAAAAAAAAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAACdDaGVjayBpZiBhIGNvbnRyYWN0IGlzIGFuIGFwcHJvdmVkIGdhbWUAAAAAB2lzX2dhbWUAAAAAAQAAAAAAAAAHZ2FtZV9pZAAAAAATAAAAAQAAAAE=",
        "AAAAAAAAAIdVbnBhdXNlIHRoZSBjb250cmFjdAoKUmVzdG9yZXMgbm9ybWFsIGNvbnRyYWN0IGZ1bmN0aW9uYWxpdHkgYWZ0ZXIgZW1lcmdlbmN5IHBhdXNlLgoKIyBFcnJvcnMKKiBgTm90QWRtaW5gIC0gSWYgY2FsbGVyIGlzIG5vdCB0aGUgYWRtaW4AAAAAB3VucGF1c2UAAAAAAAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAGRVcGRhdGUgdGhlIGNvbnRyYWN0IFdBU00gaGFzaCAodXBncmFkZSBjb250cmFjdCkKCiMgRXJyb3JzCiogYE5vdEFkbWluYCAtIElmIGNhbGxlciBpcyBub3QgdGhlIGFkbWluAAAAB3VwZ3JhZGUAAAAAAQAAAAAAAAANbmV3X3dhc21faGFzaAAAAAAAA+4AAAAgAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAAXBBZGQgb3IgdXBkYXRlIGEgZ2FtZSBjb250cmFjdCByZWdpc3RyYXRpb24KClJlZ2lzdGVycyBhIGdhbWUgY29udHJhY3Qgd2l0aCBhIGRldmVsb3BlciBhZGRyZXNzIGZvciByZXdhcmQgZGlzdHJpYnV0aW9uLgpDYW4gYmUgY2FsbGVkIG11bHRpcGxlIHRpbWVzIHRvIHVwZGF0ZSB0aGUgZGV2ZWxvcGVyIGFkZHJlc3MuCgojIEFyZ3VtZW50cwoqIGBnYW1lX2lkYCAtIEFkZHJlc3Mgb2YgdGhlIGdhbWUgY29udHJhY3QgdG8gcmVnaXN0ZXIKKiBgZGV2ZWxvcGVyYCAtIEFkZHJlc3MgdG8gcmVjZWl2ZSBkZXZlbG9wZXIgcmV3YXJkcyBmb3IgdGhpcyBnYW1lCgojIEVycm9ycwoqIGBOb3RBZG1pbmAgLSBJZiBjYWxsZXIgaXMgbm90IHRoZSBhZG1pbgAAAAhhZGRfZ2FtZQAAAAIAAAAAAAAAB2dhbWVfaWQAAAAAEwAAAAAAAAAJZGV2ZWxvcGVyAAAAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAqNFbmQgYSBnYW1lIHNlc3Npb24gd2l0aCBvdXRjb21lIHZlcmlmaWNhdGlvbgoKUmVxdWlyZXMgZ2FtZSBjb250cmFjdCBhdXRob3JpemF0aW9uLiBCb3RoIHBsYXllcnMnIEZQIHdhZ2VycyBhcmUgc3BlbnQvYnVybmVkLgpPbmx5IHRoZSB3aW5uZXIncyB3YWdlciBjb250cmlidXRlcyB0byB0aGVpciBmYWN0aW9uIHN0YW5kaW5ncy4KCk91dGNvbWUgdmVyaWZpY2F0aW9uIGlzIGhhbmRsZWQgYnkgdGhlIGluZGl2aWR1YWwgZ2FtZSBjb250cmFjdHMuCkVhY2ggZ2FtZSBpcyByZXNwb25zaWJsZSBmb3IgaW1wbGVtZW50aW5nIGl0cyBvd24gdmVyaWZpY2F0aW9uIG1lY2hhbmlzbQoobXVsdGktc2lnIG9yYWNsZSwgWksgcHJvb2ZzLCBldGMuKSBiZWZvcmUgY2FsbGluZyB0aGlzIGZ1bmN0aW9uLgoKIyBBcmd1bWVudHMKKiBgc2Vzc2lvbl9pZGAgLSBUaGUgdW5pcXVlIHNlc3Npb24gaWRlbnRpZmllcgoqIGBwbGF5ZXIxX3dvbmAgLSB0cnVlIGlmIHBsYXllcjEgd29uLCBmYWxzZSBpZiBwbGF5ZXIyIHdvbgoKIyBFcnJvcnMKKiBgU2Vzc2lvbk5vdEZvdW5kYCAtIElmIHNlc3Npb24gZG9lc24ndCBleGlzdAoqIGBJbnZhbGlkU2Vzc2lvblN0YXRlYCAtIElmIHNlc3Npb24gaXMgbm90IFBlbmRpbmcKKiBgR2FtZUV4cGlyZWRgIC0gSWYgZ2FtZSBpcyBmcm9tIGEgcHJldmlvdXMgZXBvY2gAAAAACGVuZF9nYW1lAAAAAgAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAALcGxheWVyMV93b24AAAAAAQAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAABVHZXQgdGhlIGFkbWluIGFkZHJlc3MAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAKNHZXQgZXBvY2ggaW5mb3JtYXRpb24gZm9yIGEgc3BlY2lmaWMgZXBvY2gKCiMgQXJndW1lbnRzCiogYGVwb2NoYCAtIFRoZSBlcG9jaCBudW1iZXIgdG8gcmV0cmlldmUKCiMgRXJyb3JzCiogYEVwb2NoTm90RmluYWxpemVkYCAtIElmIHJlcXVlc3RlZCBlcG9jaCBkb2Vzbid0IGV4aXN0AAAAAAlnZXRfZXBvY2gAAAAAAAABAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAABAAAD6QAAB9AAAAAJRXBvY2hJbmZvAAAAAAAAAw==",
        "AAAAAAAAABtDaGVjayBpZiBjb250cmFjdCBpcyBwYXVzZWQAAAAACWlzX3BhdXNlZAAAAAAAAAAAAAABAAAAAQ==",
        "AAAAAAAAAFRVcGRhdGUgdGhlIGFkbWluIGFkZHJlc3MKCiMgRXJyb3JzCiogYE5vdEFkbWluYCAtIElmIGNhbGxlciBpcyBub3QgdGhlIGN1cnJlbnQgYWRtaW4AAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAB1HZXQgdGhlIGN1cnJlbnQgY29uZmlndXJhdGlvbgAAAAAAAApnZXRfY29uZmlnAAAAAAAAAAAAAQAAB9AAAAAGQ29uZmlnAAA=",
        "AAAAAAAAANNHZXQgcGxheWVyIGluZm9ybWF0aW9uCgpSZXR1cm5zIGNvbXBsZXRlIHBlcnNpc3RlbnQgcGxheWVyIGRhdGEgaW5jbHVkaW5nIHNlbGVjdGVkIGZhY3Rpb24sIHRvdGFsIGRlcG9zaXRlZCwKYW5kIGRlcG9zaXQgdGltZXN0YW1wLgoKIyBFcnJvcnMKKiBgUGxheWVyTm90Rm91bmRgIC0gSWYgcGxheWVyIGhhcyBuZXZlciBpbnRlcmFjdGVkIHdpdGggdGhlIGNvbnRyYWN0AAAAAApnZXRfcGxheWVyAAAAAAABAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAD6QAAB9AAAAAGUGxheWVyAAAAAAAD",
        "AAAAAAAAAeNTdGFydCBhIG5ldyBnYW1lIHNlc3Npb24KCkxvY2tzIGZhY3Rpb25zIGFuZCBmcCBmb3IgYm90aCBwbGF5ZXJzLiBJZiB0aGlzIGlzIGEgcGxheWVyJ3MgZmlyc3QgZ2FtZQppbiB0aGUgZXBvY2gsIGluaXRpYWxpemVzIHRoZWlyIGZwIGFuZCBsb2NrcyB0aGVpciBmYWN0aW9uLgoKIyBFcnJvcnMKKiBgR2FtZU5vdFdoaXRlbGlzdGVkYCAtIElmIGdhbWVfaWQgaXMgbm90IGFwcHJvdmVkCiogYFNlc3Npb25BbHJlYWR5RXhpc3RzYCAtIElmIHNlc3Npb25faWQgYWxyZWFkeSBleGlzdHMKKiBgSW52YWxpZEFtb3VudGAgLSBJZiB3YWdlcnMgYXJlIDw9IDAKKiBgUGxheWVyTm90Rm91bmRgIC0gSWYgcGxheWVycyBkb24ndCBleGlzdAoqIGBJbnN1ZmZpY2llbnRGYWN0aW9uUG9pbnRzYCAtIElmIHBsYXllcnMgZG9uJ3QgaGF2ZSBlbm91Z2ggZnAKKiBgQ29udHJhY3RQYXVzZWRgIC0gSWYgY29udHJhY3QgaXMgaW4gZW1lcmdlbmN5IHBhdXNlIG1vZGUAAAAACnN0YXJ0X2dhbWUAAAAAAAYAAAAAAAAAB2dhbWVfaWQAAAAAEwAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADXBsYXllcjFfd2FnZXIAAAAAAAALAAAAAAAAAA1wbGF5ZXIyX3dhZ2VyAAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAYZDeWNsZSB0byB0aGUgbmV4dCBlcG9jaAoKRmluYWxpemVzIGN1cnJlbnQgZXBvY2ggKGRldGVybWluZXMgd2lubmVyLCB3aXRoZHJhd3MgQkxORCwgc3dhcHMgdG8gVVNEQywKc2V0cyByZXdhcmQgcG9vbCkgYW5kIG9wZW5zIG5leHQgZXBvY2guCgojIFJldHVybnMKVGhlIG5ldyBlcG9jaCBudW1iZXIKCiMgRXJyb3JzCiogYEVwb2NoTm90UmVhZHlgIC0gSWYgbm90IGVub3VnaCB0aW1lIGhhcyBwYXNzZWQKKiBgRXBvY2hBbHJlYWR5RmluYWxpemVkYCAtIElmIGN1cnJlbnQgZXBvY2ggaXMgYWxyZWFkeSBmaW5hbGl6ZWQKKiBgRmVlVmF1bHRFcnJvcmAgLSBJZiBmZWUtdmF1bHQgb3BlcmF0aW9ucyBmYWlsCiogYFN3YXBFcnJvcmAgLSBJZiBCTE5EIOKGkiBVU0RDIHN3YXAgZmFpbHMAAAAAAAtjeWNsZV9lcG9jaAAAAAAAAAAAAQAAA+kAAAAEAAAAAw==",
        "AAAAAAAAAOhSZW1vdmUgYSBnYW1lIGNvbnRyYWN0IGZyb20gdGhlIGFwcHJvdmVkIGxpc3QKCk5vdGU6IElmIHRoZSBnYW1lIGhhcyBjb250cmlidXRpb25zIGluIHRoZSBjdXJyZW50IGVwb2NoLCB0aG9zZSB3aWxsIGJlCmZvcmZlaXRlZCAoZGV2ZWxvcGVyIGNhbm5vdCBjbGFpbSByZXdhcmRzIGZvciByZW1vdmVkIGdhbWVzKS4KCiMgRXJyb3JzCiogYE5vdEFkbWluYCAtIElmIGNhbGxlciBpcyBub3QgdGhlIGFkbWluAAAAC3JlbW92ZV9nYW1lAAAAAAEAAAAAAAAAB2dhbWVfaWQAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAAAAAAAMX19jaGVja19hdXRoAAAAAwAAAAAAAAARc2lnbmF0dXJlX3BheWxvYWQAAAAAAAPuAAAAIAAAAAAAAAAJc2lnbmF0dXJlAAAAAAAD6AAAAAAAAAAAAAAADWF1dGhfY29udGV4dHMAAAAAAAPqAAAH0AAAAAdDb250ZXh0AAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAz9Jbml0aWFsaXplIHRoZSBjb250cmFjdAoKU2V0cyB1cCB0aGUgYWRtaW4sIGV4dGVybmFsIGNvbnRyYWN0IGFkZHJlc3NlcywgYW5kIGNyZWF0ZXMgdGhlIGZpcnN0IGVwb2NoLgoKIyBBcmd1bWVudHMKKiBgYWRtaW5gIC0gQWRtaW4gYWRkcmVzcyAoY2FuIG1vZGlmeSBjb25maWcgYW5kIHVwZ3JhZGUgY29udHJhY3QpCiogYGZlZV92YXVsdGAgLSBmZWUtdmF1bHQtdjIgY29udHJhY3QgYWRkcmVzcwoqIGBzb3Jvc3dhcF9yb3V0ZXJgIC0gU29yb3N3YXAgcm91dGVyIGNvbnRyYWN0IGFkZHJlc3MKKiBgYmxuZF90b2tlbmAgLSBCTE5EIHRva2VuIGFkZHJlc3MKKiBgdXNkY190b2tlbmAgLSBVU0RDIHRva2VuIGFkZHJlc3MKKiBgZXBvY2hfZHVyYXRpb25gIC0gRHVyYXRpb24gb2YgZWFjaCBlcG9jaCBpbiBzZWNvbmRzIChkZWZhdWx0OiAzNDUsNjAwID0gNCBkYXlzKQoqIGByZXNlcnZlX3Rva2VuX2lkc2AgLSBSZXNlcnZlIHRva2VuIElEcyBmb3IgY2xhaW1pbmcgQkxORCBlbWlzc2lvbnMgKGUuZy4sIHZlYyFbJmVudiwgMV0gZm9yIHJlc2VydmUgMCBiLXRva2VucykKKiBgZnJlZV9mcF9wZXJfZXBvY2hgIC0gQmFzZSBGUCBncmFudGVkIHRvIGFsbCBwbGF5ZXJzIGVhY2ggZXBvY2ggKGVuYWJsZXMgZnJlZSBwbGF5KQoqIGBtaW5fZGVwb3NpdF90b19jbGFpbWAgLSBNaW5pbXVtIHZhdWx0IGJhbGFuY2UgcmVxdWlyZWQgdG8gY2xhaW0gcmV3YXJkcyAoYW50aS1zeWJpbCkKKiBgZGV2X3Jld2FyZF9zaGFyZWAgLSBQb3J0aW9uIG9mIGVwb2NoIHJld2FyZHMgZm9yIGdhbWUgZGV2ZWxvcGVycyAoNyBkZWNpbWFscywgZS5nLiwgMV8wMDBfMDAwID0gMTAlKQoAAAAADV9fY29uc3RydWN0b3IAAAAAAAAKAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACWZlZV92YXVsdAAAAAAAABMAAAAAAAAAD3Nvcm9zd2FwX3JvdXRlcgAAAAATAAAAAAAAAApibG5kX3Rva2VuAAAAAAATAAAAAAAAAAp1c2RjX3Rva2VuAAAAAAATAAAAAAAAAA5lcG9jaF9kdXJhdGlvbgAAAAAABgAAAAAAAAARcmVzZXJ2ZV90b2tlbl9pZHMAAAAAAAPqAAAABAAAAAAAAAARZnJlZV9mcF9wZXJfZXBvY2gAAAAAAAALAAAAAAAAABRtaW5fZGVwb3NpdF90b19jbGFpbQAAAAsAAAAAAAAAEGRldl9yZXdhcmRfc2hhcmUAAAALAAAAAA==",
        "AAAAAAAAA0hVcGRhdGUgZ2xvYmFsIGNvbmZpZ3VyYXRpb24KCkFsbG93cyBhZG1pbiB0byB1cGRhdGUgc3BlY2lmaWMgY29uZmlndXJhdGlvbiBwYXJhbWV0ZXJzLgpPbmx5IHVwZGF0ZXMgcGFyYW1ldGVycyB0aGF0IGFyZSBwcm92aWRlZCAobm9uLU5vbmUpLgoKIyBBcmd1bWVudHMKKiBgbmV3X2ZlZV92YXVsdGAgLSBOZXcgZmVlLXZhdWx0LXYyIGNvbnRyYWN0IGFkZHJlc3MgKG9wdGlvbmFsKQoqIGBuZXdfc29yb3N3YXBfcm91dGVyYCAtIE5ldyBTb3Jvc3dhcCByb3V0ZXIgY29udHJhY3QgYWRkcmVzcyAob3B0aW9uYWwpCiogYG5ld19ibG5kX3Rva2VuYCAtIE5ldyBCTE5EIHRva2VuIGFkZHJlc3MgKG9wdGlvbmFsKQoqIGBuZXdfdXNkY190b2tlbmAgLSBOZXcgVVNEQyB0b2tlbiBhZGRyZXNzIChvcHRpb25hbCkKKiBgbmV3X2Vwb2NoX2R1cmF0aW9uYCAtIE5ldyBlcG9jaCBkdXJhdGlvbiBpbiBzZWNvbmRzIChvcHRpb25hbCkKKiBgbmV3X3Jlc2VydmVfdG9rZW5faWRzYCAtIE5ldyByZXNlcnZlIHRva2VuIElEcyBmb3IgY2xhaW1pbmcgQkxORCBlbWlzc2lvbnMgKG9wdGlvbmFsKQoqIGBuZXdfZnJlZV9mcF9wZXJfZXBvY2hgIC0gTmV3IGJhc2UgRlAgZm9yIGZyZWUgcGxheSAob3B0aW9uYWwpCiogYG5ld19taW5fZGVwb3NpdF90b19jbGFpbWAgLSBOZXcgbWluaW11bSBkZXBvc2l0IHRvIGNsYWltIHJld2FyZHMgKG9wdGlvbmFsKQoqIGBuZXdfZGV2X3Jld2FyZF9zaGFyZWAgLSBOZXcgcG9ydGlvbiBvZiBlcG9jaCByZXdhcmRzIGZvciBnYW1lIGRldmVsb3BlcnMgKG9wdGlvbmFsKQoKIyBFcnJvcnMKKiBgTm90QWRtaW5gIC0gSWYgY2FsbGVyIGlzIG5vdCB0aGUgYWRtaW4AAAANdXBkYXRlX2NvbmZpZwAAAAAAAAkAAAAAAAAADW5ld19mZWVfdmF1bHQAAAAAAAPoAAAAEwAAAAAAAAATbmV3X3Nvcm9zd2FwX3JvdXRlcgAAAAPoAAAAEwAAAAAAAAAObmV3X2JsbmRfdG9rZW4AAAAAA+gAAAATAAAAAAAAAA5uZXdfdXNkY190b2tlbgAAAAAD6AAAABMAAAAAAAAAEm5ld19lcG9jaF9kdXJhdGlvbgAAAAAD6AAAAAYAAAAAAAAAFW5ld19yZXNlcnZlX3Rva2VuX2lkcwAAAAAAA+gAAAPqAAAABAAAAAAAAAAVbmV3X2ZyZWVfZnBfcGVyX2Vwb2NoAAAAAAAD6AAAAAsAAAAAAAAAGG5ld19taW5fZGVwb3NpdF90b19jbGFpbQAAA+gAAAALAAAAAAAAABRuZXdfZGV2X3Jld2FyZF9zaGFyZQAAA+gAAAALAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAAdpTZWxlY3QgYSBmYWN0aW9uIGZvciB0aGUgcGxheWVyCgpTZXRzIHRoZSBwbGF5ZXIncyBwZXJzaXN0ZW50IGZhY3Rpb24gcHJlZmVyZW5jZS4gQ2FuIGJlIGNoYW5nZWQgYXQgQU5ZIHRpbWUuCklmIHlvdSBoYXZlbid0IHBsYXllZCBhIGdhbWUgdGhpcyBlcG9jaCwgdGhlIG5ldyBmYWN0aW9uIGFwcGxpZXMgaW1tZWRpYXRlbHkuCklmIHlvdSd2ZSBhbHJlYWR5IHBsYXllZCB0aGlzIGVwb2NoLCB0aGUgY3VycmVudCBlcG9jaCBzdGF5cyBsb2NrZWQgdG8geW91cgpvbGQgZmFjdGlvbiwgYW5kIHRoZSBuZXcgc2VsZWN0aW9uIGFwcGxpZXMgc3RhcnRpbmcgbmV4dCBlcG9jaC4KCiMgQXJndW1lbnRzCiogYGZhY3Rpb25gIC0gRmFjdGlvbiBJRCAoMD1XaG9sZU5vb2RsZSwgMT1Qb2ludHlTdGljaywgMj1TcGVjaWFsUm9jaykKCiMgRXJyb3JzCiogYEludmFsaWRGYWN0aW9uYCAtIElmIGZhY3Rpb24gSUQgaXMgbm90IDAsIDEsIG9yIDIAAAAAAA5zZWxlY3RfZmFjdGlvbgAAAAAAAgAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAdmYWN0aW9uAAAAAAQAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAvpDbGFpbSBkZXZlbG9wZXIgcmV3YXJkIGZvciBhIHNwZWNpZmljIGVwb2NoCgpEZXZlbG9wZXJzIGNsYWltIHRoZWlyIGFnZ3JlZ2F0ZWQgc2hhcmUgb2YgdGhlIGVwb2NoJ3MgZGV2IHJld2FyZCBwb29sCnByb3BvcnRpb25hbCB0byB0b3RhbCBGUCBjb250cmlidXRlZCB0aHJvdWdoIGFsbCB0aGVpciByZWdpc3RlcmVkIGdhbWVzLgoKKipOb3RlOioqIFRvIGNoZWNrIGNsYWltYWJsZSBhbW91bnRzIG9yIGNsYWltIHN0YXR1cyBiZWZvcmUgY2FsbGluZywKdXNlIHRyYW5zYWN0aW9uIHNpbXVsYXRpb24uIFRoaXMgaXMgdGhlIGlkaW9tYXRpYyBTb3JvYmFuIHBhdHRlcm4uCgojIEFyZ3VtZW50cwoqIGBkZXZlbG9wZXJgIC0gRGV2ZWxvcGVyIGFkZHJlc3MgY2xhaW1pbmcgcmV3YXJkcwoqIGBlcG9jaGAgLSBFcG9jaCBudW1iZXIgdG8gY2xhaW0gZnJvbQoKIyBSZXR1cm5zCkFtb3VudCBvZiBVU0RDIGNsYWltZWQgYW5kIHRyYW5zZmVycmVkIHRvIGRldmVsb3BlcgoKIyBFcnJvcnMKKiBgRXBvY2hOb3RGaW5hbGl6ZWRgIC0gSWYgZXBvY2ggZG9lc24ndCBleGlzdCBvciBpc24ndCBmaW5hbGl6ZWQKKiBgRGV2UmV3YXJkQWxyZWFkeUNsYWltZWRgIC0gSWYgYWxyZWFkeSBjbGFpbWVkIGZvciB0aGlzIGVwb2NoCiogYEdhbWVOb0NvbnRyaWJ1dGlvbnNgIC0gSWYgZGV2ZWxvcGVyIGhhcyBubyBjb250cmlidXRpb25zIHRoaXMgZXBvY2gKKiBgQ29udHJhY3RQYXVzZWRgIC0gSWYgY29udHJhY3QgaXMgaW4gZW1lcmdlbmN5IHBhdXNlIG1vZGUAAAAAABBjbGFpbV9kZXZfcmV3YXJkAAAAAgAAAAAAAAAJZGV2ZWxvcGVyAAAAAAAAEwAAAAAAAAAFZXBvY2gAAAAAAAAEAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAABABHZXQgcGxheWVyJ3MgZXBvY2gtc3BlY2lmaWMgaW5mb3JtYXRpb24gZm9yIGFueSBlcG9jaAoKUmV0dXJucyBjb21wbGV0ZSBlcG9jaC1zcGVjaWZpYyBkYXRhIGluY2x1ZGluZyBsb2NrZWQgZmFjdGlvbiwgYXZhaWxhYmxlIEZQLAp0b3RhbCBGUCBjb250cmlidXRlZCwgYW5kIGJhbGFuY2Ugc25hcHNob3QuIENvbnNpc3RlbnQgd2l0aCBgZ2V0X2Vwb2NoKGVwb2NoKWAKd2hpY2ggYWxzbyByZXF1aXJlcyBhbiBlcG9jaCBwYXJhbWV0ZXIuCgoqKkJlaGF2aW9yIGZvciBjdXJyZW50IGVwb2NoOioqIElmIHBsYXllciBoYXNuJ3QgcGxheWVkIGFueSBnYW1lcyB0aGlzIGVwb2NoIHlldCwKY2FsY3VsYXRlcyB3aGF0IHRoZWlyIEZQIFdPVUxEIGJlIGJhc2VkIG9uIGN1cnJlbnQgdmF1bHQgYmFsYW5jZSB3aXRob3V0IHdyaXRpbmcKdG8gc3RvcmFnZS4gVGhpcyBhbGxvd3MgVUlzIHRvIGRpc3BsYXkgRlAgYmVmb3JlIHRoZSBwbGF5ZXIncyBmaXJzdCBnYW1lLgoKKipCZWhhdmlvciBmb3IgaGlzdG9yaWNhbCBlcG9jaHM6KiogT25seSByZXR1cm5zIGRhdGEgaWYgcGxheWVyIHBhcnRpY2lwYXRlZCBpbgp0aGF0IGVwb2NoIChwbGF5ZWQgYXQgbGVhc3Qgb25lIGdhbWUpLgoKIyBBcmd1bWVudHMKKiBgZXBvY2hgIC0gRXBvY2ggbnVtYmVyIHRvIHF1ZXJ5CiogYHBsYXllcmAgLSBQbGF5ZXIgYWRkcmVzcwoKIyBFeGFtcGxlcwpgYGBpZ25vcmUKLy8gQ3VycmVudCBlcG9jaApsZXQgY3VycmVudCA9IGNvbnRyYWN0LmdldF9jdXJyZW50X2Vwb2NoKCk7CmxldCBwbGF5ZXJfZGF0YSA9IGNvbnRyYWN0LmdldF9lcG9jaF9wbGF5ZXIoJmN1cnJlbnQsICZwbGF5ZXIpPzsKCi8vIEhpc3RvcmljYWwgZXBvY2gKbGV0IGVwb2NoMF9kYXRhID0gY29udHJhY3QuZ2V0X2Vwb2NoX3BsYXllcigmMCwgJnBsYXllcik/OwpgYGAKCiMgRXJyb3JzCiogYEZhY3Rpb25Ob3RTZWxlY3RlZGAgLSBJZiBxdWVyeWluZyBjdXJyZW50IGVwb2NoIGFuZCBwbGF5ZXIgaGFzbid0IHNlbGVjdGVkIGZhY3Rpb24KKiBgUGxheWVyTm90AAAAEGdldF9lcG9jaF9wbGF5ZXIAAAACAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAPpAAAH0AAAAAtFcG9jaFBsYXllcgAAAAAD",
        "AAAAAAAAAEBHZXQgdGhlIGN1cnJlbnQgZXBvY2ggbnVtYmVyCgojIFJldHVybnMKVGhlIGN1cnJlbnQgZXBvY2ggbnVtYmVyAAAAEWdldF9jdXJyZW50X2Vwb2NoAAAAAAAAAAAAAAEAAAAE",
        "AAAAAAAAAqxDbGFpbSBlcG9jaCByZXdhcmQgZm9yIGEgcGxheWVyIGZvciBhIHNwZWNpZmljIGVwb2NoCgpQbGF5ZXJzIHdobyBjb250cmlidXRlZCBGUCB0byB0aGUgd2lubmluZyBmYWN0aW9uIGNhbiBjbGFpbSB0aGVpciBzaGFyZQpvZiB0aGUgZXBvY2gncyByZXdhcmQgcG9vbCAoVVNEQyBjb252ZXJ0ZWQgZnJvbSBCTE5EIHlpZWxkKS4KCioqTm90ZToqKiBUbyBjaGVjayBjbGFpbWFibGUgYW1vdW50cyBvciBjbGFpbSBzdGF0dXMgYmVmb3JlIGNhbGxpbmcsCnVzZSB0cmFuc2FjdGlvbiBzaW11bGF0aW9uLiBUaGlzIGlzIHRoZSBpZGlvbWF0aWMgU29yb2JhbiBwYXR0ZXJuLgoKIyBSZXR1cm5zCkFtb3VudCBvZiBVU0RDIGNsYWltZWQKCiMgRXJyb3JzCiogYEVwb2NoTm90RmluYWxpemVkYCAtIElmIGVwb2NoIGRvZXNuJ3QgZXhpc3Qgb3IgaXNuJ3QgZmluYWxpemVkCiogYFJld2FyZEFscmVhZHlDbGFpbWVkYCAtIElmIHBsYXllciBhbHJlYWR5IGNsYWltZWQgZm9yIHRoaXMgZXBvY2gKKiBgTm90V2lubmluZ0ZhY3Rpb25gIC0gSWYgcGxheWVyIHdhc24ndCBpbiB0aGUgd2lubmluZyBmYWN0aW9uCiogYE5vUmV3YXJkc0F2YWlsYWJsZWAgLSBJZiBwbGF5ZXIgaGFzIG5vIHJld2FyZHMgdG8gY2xhaW0KKiBgQ29udHJhY3RQYXVzZWRgIC0gSWYgY29udHJhY3QgaXMgaW4gZW1lcmdlbmN5IHBhdXNlIG1vZGUAAAASY2xhaW1fZXBvY2hfcmV3YXJkAAAAAAACAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAABWVwb2NoAAAAAAAABAAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAQAAAOhHbG9iYWwgY29uZmlndXJhdGlvbgoKU3RvcmVzIGNvbnRyYWN0IGNvbmZpZ3VyYXRpb24gcGFyYW1ldGVycy4KTm90ZTogQWRtaW4gYWRkcmVzcyBpcyBzdG9yZWQgc2VwYXJhdGVseSB2aWEgRGF0YUtleTo6QWRtaW4gZm9yIHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGguCk5vdGU6IFBhdXNlIHN0YXRlIGlzIHN0b3JlZCBzZXBhcmF0ZWx5IHZpYSBEYXRhS2V5OjpQYXVzZWQgZm9yIGVmZmljaWVudCBhY2Nlc3MuAAAAAAAAAAZDb25maWcAAAAAAAkAAAASQkxORCB0b2tlbiBhZGRyZXNzAAAAAAAKYmxuZF90b2tlbgAAAAAAEwAAAJhEZXZlbG9wZXIgcmV3YXJkIHNoYXJlIGFzIGZpeGVkLXBvaW50ICg3IGRlY2ltYWxzKQpQb3J0aW9uIG9mIGVwb2NoIHJld2FyZHMgYWxsb2NhdGVkIHRvIGdhbWUgZGV2ZWxvcGVycwpEZWZhdWx0OiAxXzAwMF8wMDAgKDEwJSA9IDAuMTAgd2l0aCA3IGRlY2ltYWxzKQAAABBkZXZfcmV3YXJkX3NoYXJlAAAACwAAAEVEdXJhdGlvbiBvZiBlYWNoIGVwb2NoIGluIHNlY29uZHMgKGRlZmF1bHQ6IDQgZGF5cyA9IDM0NSw2MDAgc2Vjb25kcykAAAAAAAAOZXBvY2hfZHVyYXRpb24AAAAAAAYAAAAdZmVlLXZhdWx0LXYyIGNvbnRyYWN0IGFkZHJlc3MAAAAAAAAJZmVlX3ZhdWx0AAAAAAAAEwAAAK9CYXNlIEZQIGdyYW50ZWQgdG8gYWxsIHBsYXllcnMgZWFjaCBlcG9jaCByZWdhcmRsZXNzIG9mIGRlcG9zaXQgKDcgZGVjaW1hbHMpCkVuYWJsZXMgImZyZWUgcGxheSIgd2hlcmUgcGxheWVycyBjYW4gcGFydGljaXBhdGUgd2l0aG91dCBkZXBvc2l0aW5nCkRlZmF1bHQ6IDEwMF8wMDAwMDAwICgxMDAgRlApAAAAABFmcmVlX2ZwX3Blcl9lcG9jaAAAAAAAAAsAAACaTWluaW11bSB2YXVsdCBiYWxhbmNlIHJlcXVpcmVkIHRvIGNsYWltIGVwb2NoIHJld2FyZHMgKDcgZGVjaW1hbHMpCkFudGktc3liaWwgbWVjaGFuaXNtOiBwbGF5ZXJzIG11c3QgZGVwb3NpdCB0byBleHRyYWN0IHZhbHVlCkRlZmF1bHQ6IDFfMDAwMDAwMCAoMSBVU0RDKQAAAAAAFG1pbl9kZXBvc2l0X3RvX2NsYWltAAAACwAAAM5SZXNlcnZlIHRva2VuIElEcyBmb3IgY2xhaW1pbmcgQkxORCBlbWlzc2lvbnMgZnJvbSBCbGVuZCBwb29sCkZvcm11bGE6IHJlc2VydmVfaW5kZXggKiAyICsgdG9rZW5fdHlwZQp0b2tlbl90eXBlOiAwID0gZGVidCB0b2tlbiwgMSA9IGItdG9rZW4gKHN1cHBsaWVycykKRXhhbXBsZTogRm9yIHJlc2VydmUgMCBiLXRva2VucyAoc3VwcGxpZXJzKSwgdXNlIFsxXQAAAAAAEXJlc2VydmVfdG9rZW5faWRzAAAAAAAD6gAAAAQAAAAgU29yb3N3YXAgcm91dGVyIGNvbnRyYWN0IGFkZHJlc3MAAAAPc29yb3N3YXBfcm91dGVyAAAAABMAAAASVVNEQyB0b2tlbiBhZGRyZXNzAAAAAAAKdXNkY190b2tlbgAAAAAAEw==",
        "AAAAAQAAAJdQZXJzaXN0ZW50IHBsYXllciBkYXRhIChhY3Jvc3MgYWxsIGVwb2NocykKClN0b3JlcyB0aGUgcGxheWVyJ3MgZmFjdGlvbiBwcmVmZXJlbmNlIGFuZCB0aW1lIG11bHRpcGxpZXIgdHJhY2tpbmcuClRoaXMgcGVyc2lzdHMgYWNyb3NzIGVwb2NoIGJvdW5kYXJpZXMuAAAAAAAAAAAGUGxheWVyAAAAAAADAAAAeVBsYXllcidzIHZhdWx0IGJhbGFuY2UgZnJvbSB0aGUgcHJldmlvdXMgZXBvY2ggKGZvciBjcm9zcy1lcG9jaCBjb21wYXJpc29uKQpVc2VkIHRvIGRldGVjdCA+NTAlIHdpdGhkcmF3YWwgYmV0d2VlbiBlcG9jaHMAAAAAAAASbGFzdF9lcG9jaF9iYWxhbmNlAAAAAAALAAAASVRoZSBwbGF5ZXIncyBwZXJzaXN0ZW50IGZhY3Rpb24gc2VsZWN0aW9uIChjYW4gYmUgY2hhbmdlZCBiZXR3ZWVuIGVwb2NocykAAAAAAAAQc2VsZWN0ZWRfZmFjdGlvbgAAAAQAAAC0VGltZXN0YW1wIHdoZW4gdGhlIHRpbWUgbXVsdGlwbGllciBjYWxjdWxhdGlvbiBzdGFydGVkClNldCB3aGVuIHBsYXllciBwbGF5cyB0aGVpciBmaXJzdCBnYW1lICh3aXRoIHZhdWx0IGJhbGFuY2UgPiAwKQpSZXNldCB0byBjdXJyZW50IHRpbWUgaWYgcGxheWVyIHdpdGhkcmF3cyA+NTAlIGJldHdlZW4gZXBvY2hzAAAAFXRpbWVfbXVsdGlwbGllcl9zdGFydAAAAAAAAAY=",
        "AAAAAQAAAJxHYW1lIHJlZ2lzdHJhdGlvbiBpbmZvIChQZXJzaXN0ZW50IHN0b3JhZ2UpCgpTdG9yZXMgdGhlIGRldmVsb3BlciBhZGRyZXNzIGZvciB3aGl0ZWxpc3RlZCBnYW1lcy4KVXNlZCB0byB0cmFjayBGUCBjb250cmlidXRpb25zIGFuZCBkZXZlbG9wZXIgcmV3YXJkIGNsYWltcy4AAAAAAAAACEdhbWVJbmZvAAAAAQAAADlEZXZlbG9wZXIgYWRkcmVzcyB3aG8gcmVjZWl2ZXMgcmV3YXJkIHNoYXJlIGZvciB0aGlzIGdhbWUAAAAAAAAJZGV2ZWxvcGVyAAAAAAAAEw==",
        "AAAAAQAAAK1QZXItZXBvY2ggZ2FtZSBjb250cmlidXRpb24gdHJhY2tpbmcgKFRlbXBvcmFyeSBzdG9yYWdlKQoKVHJhY2tzIHRvdGFsIEZQIGNvbnRyaWJ1dGVkIHRocm91Z2ggYSBnYW1lIGR1cmluZyBhbiBlcG9jaC4KVXNlZCB0byBjYWxjdWxhdGUgZGV2ZWxvcGVyJ3Mgc2hhcmUgb2YgdGhlIHJld2FyZCBwb29sLgAAAAAAAAAAAAAJRXBvY2hHYW1lAAAAAAAAAQAAADVUb3RhbCBGUCBmcm9tIGFsbCBnYW1lcyAoYm90aCBwbGF5ZXIgd2FnZXJzIGNvbWJpbmVkKQAAAAAAABR0b3RhbF9mcF9jb250cmlidXRlZAAAAAs=",
        "AAAAAQAAAF9FcG9jaCBtZXRhZGF0YQoKU3RvcmVzIGFsbCBpbmZvcm1hdGlvbiBhYm91dCBhbiBlcG9jaCBpbmNsdWRpbmcgdGltaW5nLCBzdGFuZGluZ3MsIGFuZCByZXdhcmRzLgAAAAAAAAAACUVwb2NoSW5mbwAAAAAAAAgAAAB3RGV2ZWxvcGVyIHJld2FyZCBwb29sIChwb3J0aW9uIG9mIHJld2FyZHMgZm9yIGdhbWUgZGV2ZWxvcGVycykKU2V0IGR1cmluZyBjeWNsZV9lcG9jaDogdG90YWxfcmV3YXJkcyAqIGRldl9yZXdhcmRfc2hhcmUAAAAAD2Rldl9yZXdhcmRfcG9vbAAAAAALAAAAQVVuaXggdGltZXN0YW1wIHdoZW4gdGhpcyBlcG9jaCBlbmRzIChzdGFydF90aW1lICsgZXBvY2hfZHVyYXRpb24pAAAAAAAACGVuZF90aW1lAAAABgAAAF5NYXAgb2YgZmFjdGlvbl9pZCAtPiB0b3RhbCBmcCBjb250cmlidXRlZCBieSBhbGwgcGxheWVycwpVc2VkIHRvIGRldGVybWluZSB0aGUgd2lubmluZyBmYWN0aW9uAAAAAAARZmFjdGlvbl9zdGFuZGluZ3MAAAAAAAPsAAAABAAAAAsAAAAwVHJ1ZSBpZiBlcG9jaCBoYXMgYmVlbiBmaW5hbGl6ZWQgdmlhIGN5Y2xlX2Vwb2NoAAAADGlzX2ZpbmFsaXplZAAAAAEAAACHVG90YWwgVVNEQyBhdmFpbGFibGUgZm9yIHBsYXllciByZXdhcmQgZGlzdHJpYnV0aW9uIChzZXQgZHVyaW5nIGN5Y2xlX2Vwb2NoKQpUaGlzIGlzIDkwJSBvZiB0b3RhbCByZXdhcmRzIChhZnRlciBkZXYgc2hhcmUgaXMgZGVkdWN0ZWQpAAAAAAtyZXdhcmRfcG9vbAAAAAALAAAAJlVuaXggdGltZXN0YW1wIHdoZW4gdGhpcyBlcG9jaCBzdGFydGVkAAAAAAAKc3RhcnRfdGltZQAAAAAABgAAAGdUb3RhbCBGUCB3YWdlcmVkIGFjcm9zcyBhbGwgZ2FtZXMgdGhpcyBlcG9jaApVc2VkIHRvIGNhbGN1bGF0ZSBlYWNoIGdhbWUncyBzaGFyZSBvZiB0aGUgZGV2IHJld2FyZCBwb29sAAAAAA10b3RhbF9nYW1lX2ZwAAAAAAAACwAAADNUaGUgd2lubmluZyBmYWN0aW9uIChOb25lIHVudGlsIGVwb2NoIGlzIGZpbmFsaXplZCkAAAAAD3dpbm5pbmdfZmFjdGlvbgAAAAPoAAAABA==",
        "AAAAAQAAANpQZXItZXBvY2ggcGxheWVyIGRhdGEKCkNyZWF0ZWQgd2hlbiBhIHBsYXllciBmaXJzdCBpbnRlcmFjdHMgd2l0aCB0aGUgY29udHJhY3QgaW4gYSBuZXcgZXBvY2guClRyYWNrcyBmYWN0aW9uIHBvaW50cyBhbmQgZXBvY2gtc3BlY2lmaWMgZmFjdGlvbiBsb2NrLgpGUCBpcyBjYWxjdWxhdGVkIG9uY2UgYXQgZmlyc3QgZ2FtZSBvZiBlcG9jaCBiYXNlZCBvbiB2YXVsdCBiYWxhbmNlLgAAAAAAAAAAAAtFcG9jaFBsYXllcgAAAAAEAAAAeEF2YWlsYWJsZSBmYWN0aW9uIHBvaW50cyAobm90IGxvY2tlZCBpbiBnYW1lcykKQ2FsY3VsYXRlZCBvbmNlIGF0IGZpcnN0IGdhbWUgb2YgZXBvY2ggYW5kIHJlbWFpbnMgdmFsaWQgdW50aWwgbmV4dCBlcG9jaAAAAAxhdmFpbGFibGVfZnAAAAALAAAAeFBsYXllcidzIHZhdWx0IGJhbGFuY2Ugc25hcHNob3QgYXQgZmlyc3QgZ2FtZSBvZiB0aGlzIGVwb2NoCkNhcHR1cmVzIHRoZSB2YXVsdCBiYWxhbmNlIHVzZWQgdG8gY2FsY3VsYXRlIHRoaXMgZXBvY2gncyBGUAAAABZlcG9jaF9iYWxhbmNlX3NuYXBzaG90AAAAAAALAAAAbFRoZSBmYWN0aW9uIGxvY2tlZCBpbiBmb3IgdGhpcyBlcG9jaCAobG9ja2VkIG9uIGZpcnN0IGdhbWUpCk5vbmUgPSBub3QgeWV0IGxvY2tlZCwgU29tZShmYWN0aW9uX2lkKSA9IGxvY2tlZAAAAA1lcG9jaF9mYWN0aW9uAAAAAAAD6AAAAAQAAABsVG90YWwgZmFjdGlvbiBwb2ludHMgY29udHJpYnV0ZWQgdG8gdGhlIHBsYXllcidzIGZhY3Rpb24gdGhpcyBlcG9jaApVc2VkIGZvciByZXdhcmQgZGlzdHJpYnV0aW9uIGNhbGN1bGF0aW9uAAAAFHRvdGFsX2ZwX2NvbnRyaWJ1dGVkAAAACw==",
        "AAAAAQAAAIZHYW1lIHNlc3Npb24gdHJhY2tpbmcKCkNyZWF0ZWQgd2hlbiBhIGdhbWUgc3RhcnRzLCB1cGRhdGVkIHdoZW4gaXQgZW5kcy4KVHJhY2tzIGFsbCBnYW1lIHN0YXRlIGluY2x1ZGluZyBwbGF5ZXJzLCB3YWdlcnMsIGFuZCBvdXRjb21lLgAAAAAAAAAAAAtHYW1lU2Vzc2lvbgAAAAAHAAAAYEVwb2NoIHdoZW4gdGhpcyBnYW1lIHdhcyBjcmVhdGVkClVzZWQgdG8gcHJldmVudCBnYW1lcyBmcm9tIGJlaW5nIGNvbXBsZXRlZCBpbiBhIGRpZmZlcmVudCBlcG9jaAAAAAhlcG9jaF9pZAAAAAQAAAAcQWRkcmVzcyBvZiB0aGUgZ2FtZSBjb250cmFjdAAAAAdnYW1lX2lkAAAAABMAAAAWRmlyc3QgcGxheWVyJ3MgYWRkcmVzcwAAAAAAB3BsYXllcjEAAAAAEwAAACFGYWN0aW9uIHBvaW50cyB3YWdlcmVkIGJ5IHBsYXllcjEAAAAAAAANcGxheWVyMV93YWdlcgAAAAAAAAsAAABdV2lubmVyIG9mIHRoZSBnYW1lIChOb25lID0gcGVuZGluZywgU29tZSA9IGNvbXBsZXRlZCkKdHJ1ZSA9IHBsYXllcjEgd29uLCBmYWxzZSA9IHBsYXllcjIgd29uAAAAAAAAC3BsYXllcjFfd29uAAAAA+gAAAABAAAAF1NlY29uZCBwbGF5ZXIncyBhZGRyZXNzAAAAAAdwbGF5ZXIyAAAAABMAAAAhRmFjdGlvbiBwb2ludHMgd2FnZXJlZCBieSBwbGF5ZXIyAAAAAAAADXBsYXllcjJfd2FnZXIAAAAAAAAL",
        "AAAABAAAALJFcnJvciBjb2RlcyBmb3IgdGhlIE9obG9zcyBjb250cmFjdAoKQWxsIGVycm9ycyBhcmUgcmVwcmVzZW50ZWQgYXMgdTMyIHZhbHVlcyBmb3IgZWZmaWNpZW50IHN0b3JhZ2UgYW5kIHRyYW5zbWlzc2lvbi4KRXJyb3IgY29kZXMgYXJlIGdyb3VwZWQgYnkgY2F0ZWdvcnkgZm9yIGJldHRlciBvcmdhbml6YXRpb24uAAAAAAAAAAAABUVycm9yAAAAAAAAGwAAAD5QbGF5ZXIgaGFzIGluc3VmZmljaWVudCBmYWN0aW9uIHBvaW50cyBmb3IgdGhlIHJlcXVlc3RlZCB3YWdlcgAAAAAAGUluc3VmZmljaWVudEZhY3Rpb25Qb2ludHMAAAAAAAALAAAAKkFtb3VudCBpcyBpbnZhbGlkIChlLmcuLCB6ZXJvIG9yIG5lZ2F0aXZlKQAAAAAADUludmFsaWRBbW91bnQAAAAAAAAMAAAAKkZhY3Rpb24gSUQgaXMgaW52YWxpZCAobXVzdCBiZSAwLCAxLCBvciAyKQAAAAAADkludmFsaWRGYWN0aW9uAAAAAAANAAAAQVBsYXllcidzIGZhY3Rpb24gaXMgYWxyZWFkeSBsb2NrZWQgZm9yIHRoaXMgZXBvY2ggKGNhbm5vdCBjaGFuZ2UpAAAAAAAAFEZhY3Rpb25BbHJlYWR5TG9ja2VkAAAADgAAADdQbGF5ZXIgZG9lcyBub3QgZXhpc3QgKG5vIGRlcG9zaXRzIG9yIGludGVyYWN0aW9ucyB5ZXQpAAAAAA5QbGF5ZXJOb3RGb3VuZAAAAAAADwAAADFQbGF5ZXIgbXVzdCBzZWxlY3QgYSBmYWN0aW9uIGJlZm9yZSBwbGF5aW5nIGdhbWVzAAAAAAAAEkZhY3Rpb25Ob3RTZWxlY3RlZAAAAAAAEAAAACVHYW1lIGNvbnRyYWN0IGlzIG5vdCBpbiB0aGUgd2hpdGVsaXN0AAAAAAAAEkdhbWVOb3RXaGl0ZWxpc3RlZAAAAAAAFAAAABpHYW1lIHNlc3Npb24gd2FzIG5vdCBmb3VuZAAAAAAAD1Nlc3Npb25Ob3RGb3VuZAAAAAAVAAAAKEdhbWUgc2Vzc2lvbiB3aXRoIHRoaXMgSUQgYWxyZWFkeSBleGlzdHMAAAAUU2Vzc2lvbkFscmVhZHlFeGlzdHMAAAAWAAAANkdhbWUgc2Vzc2lvbiBpcyBpbiBhbiBpbnZhbGlkIHN0YXRlIGZvciB0aGlzIG9wZXJhdGlvbgAAAAAAE0ludmFsaWRTZXNzaW9uU3RhdGUAAAAAFwAAABxHYW1lIG91dGNvbWUgZGF0YSBpcyBpbnZhbGlkAAAAEkludmFsaWRHYW1lT3V0Y29tZQAAAAAAGAAAADVHYW1lIGlzIGZyb20gYSBwcmV2aW91cyBlcG9jaCBhbmQgY2Fubm90IGJlIGNvbXBsZXRlZAAAAAAAAAtHYW1lRXhwaXJlZAAAAAAZAAAAIEVwb2NoIGhhcyBub3QgYmVlbiBmaW5hbGl6ZWQgeWV0AAAAEUVwb2NoTm90RmluYWxpemVkAAAAAAAAHgAAACBFcG9jaCBoYXMgYWxyZWFkeSBiZWVuIGZpbmFsaXplZAAAABVFcG9jaEFscmVhZHlGaW5hbGl6ZWQAAAAAAAAfAAAAN0Vwb2NoIGNhbm5vdCBiZSBjeWNsZWQgeWV0IChub3QgZW5vdWdoIHRpbWUgaGFzIHBhc3NlZCkAAAAADUVwb2NoTm90UmVhZHkAAAAAAAAgAAAAMk5vIHJld2FyZHMgYXZhaWxhYmxlIGZvciB0aGlzIHBsYXllciBpbiB0aGlzIGVwb2NoAAAAAAASTm9SZXdhcmRzQXZhaWxhYmxlAAAAAAAoAAAALlJld2FyZCBoYXMgYWxyZWFkeSBiZWVuIGNsYWltZWQgZm9yIHRoaXMgZXBvY2gAAAAAABRSZXdhcmRBbHJlYWR5Q2xhaW1lZAAAACkAAAA0UGxheWVyIHdhcyBub3QgaW4gdGhlIHdpbm5pbmcgZmFjdGlvbiBmb3IgdGhpcyBlcG9jaAAAABFOb3RXaW5uaW5nRmFjdGlvbgAAAAAAACoAAABAUGxheWVyIG11c3QgZGVwb3NpdCBtaW5pbXVtIGFtb3VudCB0byBjbGFpbSByZXdhcmRzIChhbnRpLXN5YmlsKQAAABZEZXBvc2l0UmVxdWlyZWRUb0NsYWltAAAAAAArAAAAHlNvcm9zd2FwIHN3YXAgb3BlcmF0aW9uIGZhaWxlZAAAAAAACVN3YXBFcnJvcgAAAAAAADMAAAAcQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZAAAAA1PdmVyZmxvd0Vycm9yAAAAAAAAPAAAABpEaXZpc2lvbiBieSB6ZXJvIGF0dGVtcHRlZAAAAAAADkRpdmlzaW9uQnlaZXJvAAAAAAA9AAAALUNvbnRyYWN0IGlzIHBhdXNlZCAoZW1lcmdlbmN5IHN0b3AgYWN0aXZhdGVkKQAAAAAAAA5Db250cmFjdFBhdXNlZAAAAAAARgAAACdHYW1lIGlzIG5vdCByZWdpc3RlcmVkIChmb3IgZGV2IGNsYWltcykAAAAAEUdhbWVOb3RSZWdpc3RlcmVkAAAAAAAAUAAAACdHYW1lIGhhcyBubyBjb250cmlidXRpb25zIGluIHRoaXMgZXBvY2gAAAAAE0dhbWVOb0NvbnRyaWJ1dGlvbnMAAAAAUQAAADhEZXZlbG9wZXIgaGFzIGFscmVhZHkgY2xhaW1lZCByZXdhcmQgZm9yIHRoaXMgZ2FtZS9lcG9jaAAAABdEZXZSZXdhcmRBbHJlYWR5Q2xhaW1lZAAAAABSAAAANENhbGxlciBpcyBub3QgdGhlIHJlZ2lzdGVyZWQgZGV2ZWxvcGVyIGZvciB0aGlzIGdhbWUAAAAQTm90R2FtZURldmVsb3BlcgAAAFM=",
        "AAAABQAAAAAAAAAAAAAACUdhbWVBZGRlZAAAAAAAAAEAAAAKZ2FtZV9hZGRlZAAAAAAAAgAAAAAAAAAHZ2FtZV9pZAAAAAATAAAAAAAAAAAAAAAJZGV2ZWxvcGVyAAAAAAAAEwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAACUdhbWVFbmRlZAAAAAAAAAEAAAAKZ2FtZV9lbmRlZAAAAAAABQAAAAAAAAAHZ2FtZV9pZAAAAAATAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAAAAAAABndpbm5lcgAAAAAAEwAAAAAAAAAAAAAABWxvc2VyAAAAAAAAEwAAAAAAAAAAAAAADmZwX2NvbnRyaWJ1dGVkAAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC0Vwb2NoQ3ljbGVkAAAAAAEAAAAMZXBvY2hfY3ljbGVkAAAABAAAAAAAAAAJb2xkX2Vwb2NoAAAAAAAABAAAAAAAAAAAAAAACW5ld19lcG9jaAAAAAAAAAQAAAAAAAAAAAAAAA93aW5uaW5nX2ZhY3Rpb24AAAAABAAAAAAAAAAAAAAAC3Jld2FyZF9wb29sAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAC0dhbWVSZW1vdmVkAAAAAAEAAAAMZ2FtZV9yZW1vdmVkAAAAAQAAAAAAAAAHZ2FtZV9pZAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC0dhbWVTdGFydGVkAAAAAAEAAAAMZ2FtZV9zdGFydGVkAAAACgAAAAAAAAAHZ2FtZV9pZAAAAAATAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAAAAAAAB3BsYXllcjEAAAAAEwAAAAAAAAAAAAAAB3BsYXllcjIAAAAAEwAAAAAAAAAAAAAADXBsYXllcjFfd2FnZXIAAAAAAAALAAAAAAAAAAAAAAANcGxheWVyMl93YWdlcgAAAAAAAAsAAAAAAAAAAAAAAA9wbGF5ZXIxX2ZhY3Rpb24AAAAABAAAAAAAAAAAAAAAD3BsYXllcjJfZmFjdGlvbgAAAAAEAAAAAAAAAAAAAAAUcGxheWVyMV9mcF9yZW1haW5pbmcAAAALAAAAAAAAAAAAAAAUcGxheWVyMl9mcF9yZW1haW5pbmcAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADEFkbWluQ2hhbmdlZAAAAAEAAAANYWRtaW5fY2hhbmdlZAAAAAAAAAIAAAAAAAAACW9sZF9hZG1pbgAAAAAAABMAAAAAAAAAAAAAAAluZXdfYWRtaW4AAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADUNvbmZpZ1VwZGF0ZWQAAAAAAAABAAAADmNvbmZpZ191cGRhdGVkAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADkNvbnRyYWN0UGF1c2VkAAAAAAABAAAAD2NvbnRyYWN0X3BhdXNlZAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAAAAAAAl0aW1lc3RhbXAAAAAAAAAGAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADlJld2FyZHNDbGFpbWVkAAAAAAABAAAAD3Jld2FyZHNfY2xhaW1lZAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAAAAAAAAAAAAAdmYWN0aW9uAAAAAAQAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAD0ZhY3Rpb25TZWxlY3RlZAAAAAABAAAAEGZhY3Rpb25fc2VsZWN0ZWQAAAACAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAAAAAAAAdmYWN0aW9uAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAEENvbnRyYWN0VW5wYXVzZWQAAAABAAAAEWNvbnRyYWN0X3VucGF1c2VkAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAAAAAAJdGltZXN0YW1wAAAAAAAABgAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAEERldlJld2FyZENsYWltZWQAAAABAAAAEmRldl9yZXdhcmRfY2xhaW1lZAAAAAAABAAAAAAAAAAJZGV2ZWxvcGVyAAAAAAAAEwAAAAEAAAAAAAAABWVwb2NoAAAAAAAABAAAAAAAAAAAAAAADmZwX2NvbnRyaWJ1dGVkAAAAAAALAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAE1RpbWVNdWx0aXBsaWVyUmVzZXQAAAAAAQAAABV0aW1lX211bHRpcGxpZXJfcmVzZXQAAAAAAAAFAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAAAAAAAAVlcG9jaAAAAAAAAAQAAAAAAAAAAAAAABBwcmV2aW91c19iYWxhbmNlAAAACwAAAAAAAAAAAAAAD2N1cnJlbnRfYmFsYW5jZQAAAAALAAAAAAAAAAAAAAAVd2l0aGRyYXdhbF9wZXJjZW50YWdlAAAAAAAACwAAAAAAAAAC",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAADAAAAAAAAAAsQWRtaW4gYWRkcmVzcyAtIHNpbmdsZXRvbiAoSW5zdGFuY2Ugc3RvcmFnZSkAAAAFQWRtaW4AAAAAAAAAAAAAM0dsb2JhbCBjb25maWd1cmF0aW9uIC0gc2luZ2xldG9uIChJbnN0YW5jZSBzdG9yYWdlKQAAAAAGQ29uZmlnAAAAAAAAAAAAM0N1cnJlbnQgZXBvY2ggbnVtYmVyIC0gc2luZ2xldG9uIChJbnN0YW5jZSBzdG9yYWdlKQAAAAAMQ3VycmVudEVwb2NoAAAAAAAAACpQYXVzZSBzdGF0ZSAtIHNpbmdsZXRvbiAoSW5zdGFuY2Ugc3RvcmFnZSkAAAAAAAZQYXVzZWQAAAAAAAEAAABOUGxheWVyIHBlcnNpc3RlbnQgZGF0YSAtIFBsYXllcihwbGF5ZXJfYWRkcmVzcykgLT4gUGxheWVyIChQZXJzaXN0ZW50IHN0b3JhZ2UpAAAAAAAGUGxheWVyAAAAAAABAAAAEwAAAAEAAABpUGxheWVyIGVwb2NoLXNwZWNpZmljIGRhdGEgLSBFcG9jaFBsYXllcihlcG9jaF9udW1iZXIsIHBsYXllcl9hZGRyZXNzKSAtPiBFcG9jaFBsYXllciAoVGVtcG9yYXJ5IHN0b3JhZ2UpAAAAAAAAC0Vwb2NoUGxheWVyAAAAAAIAAAAEAAAAEwAAAAEAAABFRXBvY2ggbWV0YWRhdGEgLSBFcG9jaChlcG9jaF9udW1iZXIpIC0+IEVwb2NoSW5mbyAoVGVtcG9yYXJ5IHN0b3JhZ2UpAAAAAAAABUVwb2NoAAAAAAAAAQAAAAQAAAABAAAASkdhbWUgc2Vzc2lvbiBkYXRhIC0gU2Vzc2lvbihzZXNzaW9uX2lkKSAtPiBHYW1lU2Vzc2lvbiAoVGVtcG9yYXJ5IHN0b3JhZ2UpAAAAAAAHU2Vzc2lvbgAAAAABAAAABAAAAAEAAABPUmVnaXN0ZXJlZCBnYW1lIGNvbnRyYWN0cyAtIEdhbWUoZ2FtZV9hZGRyZXNzKSAtPiBHYW1lSW5mbyAoUGVyc2lzdGVudCBzdG9yYWdlKQAAAAAER2FtZQAAAAEAAAATAAAAAQAAAGRQZXItZXBvY2ggZ2FtZSBjb250cmlidXRpb24gLSBFcG9jaEdhbWUoZXBvY2hfbnVtYmVyLCBnYW1lX2FkZHJlc3MpIC0+IEVwb2NoR2FtZSAoVGVtcG9yYXJ5IHN0b3JhZ2UpAAAACUVwb2NoR2FtZQAAAAAAAAIAAAAEAAAAEwAAAAEAAABZUmV3YXJkIGNsYWltIHRyYWNraW5nIC0gQ2xhaW1lZChwbGF5ZXJfYWRkcmVzcywgZXBvY2hfbnVtYmVyKSAtPiBib29sIChUZW1wb3Jhcnkgc3RvcmFnZSkAAAAAAAAHQ2xhaW1lZAAAAAACAAAAEwAAAAQAAAABAAAAZERldmVsb3BlciByZXdhcmQgY2xhaW0gdHJhY2tpbmcgLSBEZXZDbGFpbWVkKGdhbWVfYWRkcmVzcywgZXBvY2hfbnVtYmVyKSAtPiBib29sIChUZW1wb3Jhcnkgc3RvcmFnZSkAAAAKRGV2Q2xhaW1lZAAAAAAAAgAAABMAAAAE" ]),
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
        claim_dev_reward: this.txFromJSON<Result<i128>>,
        get_epoch_player: this.txFromJSON<Result<EpochPlayer>>,
        get_current_epoch: this.txFromJSON<u32>,
        claim_epoch_reward: this.txFromJSON<Result<i128>>
  }
}