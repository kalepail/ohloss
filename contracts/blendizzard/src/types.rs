#![allow(dead_code)]
use soroban_sdk::{contracttype, Address, Map, Vec};

// ============================================================================
// Factions
// ============================================================================

/// The three competing factions in Blendizzard
#[repr(u32)]
pub enum Faction {
    WholeNoodle = 0,
    PointyStick = 1,
    SpecialRock = 2,
}

impl Faction {
    pub fn is_valid(id: u32) -> bool {
        id <= 2
    }
}

// ============================================================================
// Storage Data Structures
// ============================================================================

/// Persistent player data (across all epochs)
///
/// Stores the player's faction preference and time multiplier tracking.
/// This persists across epoch boundaries.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Player {
    /// The player's persistent faction selection (can be changed between epochs)
    pub selected_faction: u32,

    /// Timestamp when the time multiplier calculation started
    /// Set when player plays their first game (with vault balance > 0)
    /// Reset to current time if player withdraws >50% between epochs
    pub time_multiplier_start: u64,

    /// Player's vault balance from the previous epoch (for cross-epoch comparison)
    /// Used to detect >50% withdrawal between epochs
    pub last_epoch_balance: i128,
}

/// Per-epoch player data
///
/// Created when a player first interacts with the contract in a new epoch.
/// Tracks faction points and epoch-specific faction lock.
/// FP is calculated once at first game of epoch based on vault balance.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EpochPlayer {
    /// The faction locked in for this epoch (locked on first game)
    /// None = not yet locked, Some(faction_id) = locked
    pub epoch_faction: Option<u32>,

    /// Player's vault balance snapshot at first game of this epoch
    /// Captures the vault balance used to calculate this epoch's FP
    pub epoch_balance_snapshot: i128,

    /// Available faction points (not locked in games)
    /// Calculated once at first game of epoch and remains valid until next epoch
    pub available_fp: i128,

    /// Total faction points contributed to the player's faction this epoch
    /// Used for reward distribution calculation
    pub total_fp_contributed: i128,
}

/// Epoch metadata
///
/// Stores all information about an epoch including timing, standings, and rewards.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EpochInfo {
    /// Unix timestamp when this epoch started
    pub start_time: u64,

    /// Unix timestamp when this epoch ends (start_time + epoch_duration)
    pub end_time: u64,

    /// Map of faction_id -> total fp contributed by all players
    /// Used to determine the winning faction
    pub faction_standings: Map<u32, i128>,

    /// Total USDC available for reward distribution (set during cycle_epoch)
    pub reward_pool: i128,

    /// The winning faction (None until epoch is finalized)
    pub winning_faction: Option<u32>,

    /// True if epoch has been finalized via cycle_epoch
    pub is_finalized: bool,
}

/// Game session tracking
///
/// Created when a game starts, updated when it ends.
/// Tracks all game state including players, wagers, and outcome.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GameSession {
    /// Address of the game contract
    pub game_id: Address,

    /// Epoch when this game was created
    /// Used to prevent games from being completed in a different epoch
    pub epoch_id: u32,

    /// First player's address
    pub player1: Address,

    /// Second player's address
    pub player2: Address,

    /// Faction points wagered by player1
    pub player1_wager: i128,

    /// Faction points wagered by player2
    pub player2_wager: i128,

    /// Winner of the game (None = pending, Some = completed)
    /// true = player1 won, false = player2 won
    pub player1_won: Option<bool>,
}

// ============================================================================
// Configuration
// ============================================================================

/// Global configuration
///
/// Stores contract configuration parameters.
/// Note: Admin address is stored separately via DataKey::Admin for single source of truth.
/// Note: Pause state is stored separately via DataKey::Paused for efficient access.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// fee-vault-v2 contract address
    pub fee_vault: Address,

    /// Soroswap router contract address
    pub soroswap_router: Address,

    /// BLND token address
    pub blnd_token: Address,

    /// USDC token address
    pub usdc_token: Address,

    /// Duration of each epoch in seconds (default: 4 days = 345,600 seconds)
    pub epoch_duration: u64,

    /// Reserve token IDs for claiming BLND emissions from Blend pool
    /// Formula: reserve_index * 2 + token_type
    /// token_type: 0 = debt token, 1 = b-token (suppliers)
    /// Example: For reserve 0 b-tokens (suppliers), use [1]
    pub reserve_token_ids: Vec<u32>,

    /// Base FP granted to all players each epoch regardless of deposit (7 decimals)
    /// Enables "free play" where players can participate without depositing
    /// Default: 100_0000000 (100 FP)
    pub free_fp_per_epoch: i128,

    /// Minimum vault balance required to claim epoch rewards (7 decimals)
    /// Anti-sybil mechanism: players must deposit to extract value
    /// Default: 1_0000000 (1 USDC)
    pub min_deposit_to_claim: i128,
}

// ============================================================================
// Constants
// ============================================================================

/// Fixed-point scalar for 7 decimal places
/// Used for all multiplier calculations
pub const SCALAR_7: i128 = 10_000_000;

/// Fixed-point representation of 1.0 (with 7 decimals)
pub const FIXED_POINT_ONE: i128 = SCALAR_7;

/// Target deposit amount for peak multiplier ($1,000 with 7 decimals)
pub const TARGET_AMOUNT_USD: i128 = 1000_0000000;

/// Maximum deposit amount for multiplier calculation ($10,000 with 7 decimals)
/// Beyond this amount, multiplier returns to 1.0x
pub const MAX_AMOUNT_USD: i128 = 10_000_0000000;

/// Target time held for peak multiplier (35 days in seconds)
/// 35 days = 5 weeks
pub const TARGET_TIME_SECONDS: u64 = 35 * 24 * 60 * 60;

/// Maximum time held for multiplier calculation (245 days in seconds)
/// 245 days = 35 weeks
/// Beyond this time, multiplier returns to 1.0x
pub const MAX_TIME_SECONDS: u64 = 245 * 24 * 60 * 60;

/// Component peak multiplier (sqrt(6) with 7 decimals)
/// Each component (amount, time) uses this peak so combined = 6.0x
/// 2.449489743... ≈ 2.4494897
pub const COMPONENT_PEAK: i128 = 2_4494897;

/// Withdrawal threshold for deposit timestamp reset (50%)
/// Represented as a percentage in fixed-point (0.5 = 50%)
pub const WITHDRAWAL_RESET_THRESHOLD: i128 = SCALAR_7 / 2;

/// Base FP multiplier: 1 USDC = 100 FP (before amount/time multipliers)
pub const BASE_FP_PER_USDC: i128 = 100;
