import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from "@stellar/stellar-sdk/contract";
import type { u32, u64, i128, Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
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
 * Error codes for the Blendizzard contract
 *
 * All errors are represented as u32 values for efficient storage and transmission.
 * Error codes are grouped by category for better organization.
 */
export declare const Errors: {
    /**
     * Player has insufficient faction points for the requested wager
     */
    11: {
        message: string;
    };
    /**
     * Amount is invalid (e.g., zero or negative)
     */
    12: {
        message: string;
    };
    /**
     * Faction ID is invalid (must be 0, 1, or 2)
     */
    13: {
        message: string;
    };
    /**
     * Player's faction is already locked for this epoch (cannot change)
     */
    14: {
        message: string;
    };
    /**
     * Player does not exist (no deposits or interactions yet)
     */
    15: {
        message: string;
    };
    /**
     * Player must select a faction before playing games
     */
    16: {
        message: string;
    };
    /**
     * Game contract is not in the whitelist
     */
    20: {
        message: string;
    };
    /**
     * Game session was not found
     */
    21: {
        message: string;
    };
    /**
     * Game session with this ID already exists
     */
    22: {
        message: string;
    };
    /**
     * Game session is in an invalid state for this operation
     */
    23: {
        message: string;
    };
    /**
     * Game outcome data is invalid
     */
    24: {
        message: string;
    };
    /**
     * Game is from a previous epoch and cannot be completed
     */
    25: {
        message: string;
    };
    /**
     * Epoch has not been finalized yet
     */
    30: {
        message: string;
    };
    /**
     * Epoch has already been finalized
     */
    31: {
        message: string;
    };
    /**
     * Epoch cannot be cycled yet (not enough time has passed)
     */
    32: {
        message: string;
    };
    /**
     * No rewards available for this player in this epoch
     */
    40: {
        message: string;
    };
    /**
     * Reward has already been claimed for this epoch
     */
    41: {
        message: string;
    };
    /**
     * Player was not in the winning faction for this epoch
     */
    42: {
        message: string;
    };
    /**
     * Player must deposit minimum amount to claim rewards (anti-sybil)
     */
    43: {
        message: string;
    };
    /**
     * Soroswap swap operation failed
     */
    51: {
        message: string;
    };
    /**
     * Arithmetic overflow occurred
     */
    60: {
        message: string;
    };
    /**
     * Division by zero attempted
     */
    61: {
        message: string;
    };
    /**
     * Contract is paused (emergency stop activated)
     */
    70: {
        message: string;
    };
};
export type DataKey = {
    tag: "Admin";
    values: void;
} | {
    tag: "Config";
    values: void;
} | {
    tag: "CurrentEpoch";
    values: void;
} | {
    tag: "Paused";
    values: void;
} | {
    tag: "Player";
    values: readonly [string];
} | {
    tag: "EpochPlayer";
    values: readonly [u32, string];
} | {
    tag: "Epoch";
    values: readonly [u32];
} | {
    tag: "Session";
    values: readonly [u32];
} | {
    tag: "Game";
    values: readonly [string];
} | {
    tag: "Claimed";
    values: readonly [string, u32];
};
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
    pause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a is_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Check if a contract is an approved game
     */
    is_game: ({ id }: {
        id: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
    /**
     * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Unpause the contract
     *
     * Restores normal contract functionality after emergency pause.
     *
     * # Errors
     * * `NotAdmin` - If caller is not the admin
     */
    unpause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Update the contract WASM hash (upgrade contract)
     *
     * # Errors
     * * `NotAdmin` - If caller is not the admin
     */
    upgrade: ({ new_wasm_hash }: {
        new_wasm_hash: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a add_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Add a game contract to the approved list
     *
     * # Errors
     * * `NotAdmin` - If caller is not the admin
     */
    add_game: ({ id }: {
        id: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
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
    end_game: ({ session_id, player1_won }: {
        session_id: u32;
        player1_won: boolean;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Get the admin address
     */
    get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
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
    get_epoch: ({ epoch }: {
        epoch: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<EpochInfo>>>;
    /**
     * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Check if contract is paused
     */
    is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
    /**
     * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Update the admin address
     *
     * # Errors
     * * `NotAdmin` - If caller is not the current admin
     */
    set_admin: ({ new_admin }: {
        new_admin: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Get the current configuration
     */
    get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>;
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
    get_player: ({ player }: {
        player: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Player>>>;
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
    start_game: ({ game_id, session_id, player1, player2, player1_wager, player2_wager }: {
        game_id: string;
        session_id: u32;
        player1: string;
        player2: string;
        player1_wager: i128;
        player2_wager: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
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
    cycle_epoch: (options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>;
    /**
     * Construct and simulate a remove_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Remove a game contract from the approved list
     *
     * # Errors
     * * `NotAdmin` - If caller is not the admin
     */
    remove_game: ({ id }: {
        id: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
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
     *
     * # Errors
     * * `NotAdmin` - If caller is not the admin
     */
    update_config: ({ new_fee_vault, new_soroswap_router, new_blnd_token, new_usdc_token, new_epoch_duration, new_reserve_token_ids, new_free_fp_per_epoch, new_min_deposit_to_claim }: {
        new_fee_vault: Option<string>;
        new_soroswap_router: Option<string>;
        new_blnd_token: Option<string>;
        new_usdc_token: Option<string>;
        new_epoch_duration: Option<u64>;
        new_reserve_token_ids: Option<Array<u32>>;
        new_free_fp_per_epoch: Option<i128>;
        new_min_deposit_to_claim: Option<i128>;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
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
    select_faction: ({ player, faction }: {
        player: string;
        faction: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
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
    get_epoch_player: ({ epoch, player }: {
        epoch: u32;
        player: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<EpochPlayer>>>;
    /**
     * Construct and simulate a get_current_epoch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Get the current epoch number
     *
     * # Returns
     * The current epoch number
     */
    get_current_epoch: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;
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
    claim_epoch_reward: ({ player, epoch }: {
        player: string;
        epoch: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, fee_vault, soroswap_router, blnd_token, usdc_token, epoch_duration, reserve_token_ids, free_fp_per_epoch, min_deposit_to_claim }: {
        admin: string;
        fee_vault: string;
        soroswap_router: string;
        blnd_token: string;
        usdc_token: string;
        epoch_duration: u64;
        reserve_token_ids: Array<u32>;
        free_fp_per_epoch: i128;
        min_deposit_to_claim: i128;
    }, 
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions & Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
    }): Promise<AssembledTransaction<T>>;
    constructor(options: ContractClientOptions);
    readonly fromJSON: {
        pause: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        is_game: (json: string) => AssembledTransaction<boolean>;
        unpause: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        upgrade: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        add_game: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        end_game: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_admin: (json: string) => AssembledTransaction<string>;
        get_epoch: (json: string) => AssembledTransaction<Result<EpochInfo, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        is_paused: (json: string) => AssembledTransaction<boolean>;
        set_admin: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_config: (json: string) => AssembledTransaction<Config>;
        get_player: (json: string) => AssembledTransaction<Result<Player, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        start_game: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        cycle_epoch: (json: string) => AssembledTransaction<Result<number, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        remove_game: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        update_config: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        select_faction: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_epoch_player: (json: string) => AssembledTransaction<Result<EpochPlayer, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_current_epoch: (json: string) => AssembledTransaction<number>;
        claim_epoch_reward: (json: string) => AssembledTransaction<Result<bigint, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
    };
}
