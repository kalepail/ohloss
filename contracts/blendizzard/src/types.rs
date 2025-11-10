#![allow(dead_code)]
use soroban_sdk::{contracttype, Address, BytesN, Map, Vec};

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

/// Persistent user data (across all epochs)
///
/// Stores the user's faction preference and deposit information.
/// This persists across epoch boundaries.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct User {
    /// The user's persistent faction selection (can be changed between epochs)
    pub selected_faction: u32,

    /// Timestamp when the user first deposited (or last reset via >50% withdrawal)
    pub deposit_timestamp: u64,

    /// User's vault balance from the previous epoch (for cross-epoch comparison)
    /// Used to detect >50% withdrawal between epochs
    pub last_epoch_balance: i128,
}

/// Per-epoch user data
///
/// Created when a user first interacts with the contract in a new epoch.
/// Tracks faction points and epoch-specific faction lock.
/// FP is calculated once at first game of epoch based on vault balance.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EpochUser {
    /// The faction locked in for this epoch (locked on first game)
    /// None = not yet locked, Some(faction_id) = locked
    pub epoch_faction: Option<u32>,

    /// User's vault balance snapshot at first game of this epoch
    /// Used to save the balance this epoch's FP was calculated from
    pub initial_balance: i128,

    /// Available faction points (not locked in games)
    /// Calculated once at first game of epoch and remains valid until next epoch
    pub available_fp: i128,

    /// Faction points currently locked in active games
    pub locked_fp: i128,

    /// Total faction points contributed to the user's faction this epoch
    /// Used for reward distribution calculation
    pub total_fp_contributed: i128,
}

/// Epoch metadata
///
/// Stores all information about an epoch including timing, standings, and rewards.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EpochInfo {
    /// The sequential epoch number (starts at 0)
    pub epoch_number: u32,

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

    /// Unique session identifier for this game instance
    pub session_id: BytesN<32>,

    /// First player's address
    pub player1: Address,

    /// Second player's address
    pub player2: Address,

    /// Faction points wagered by player1
    pub player1_wager: i128,

    /// Faction points wagered by player2
    pub player2_wager: i128,

    /// Current status of the game
    pub status: GameStatus,

    /// Winner of the game (None until completed)
    /// true = player1 won, false = player2 won
    pub winner: Option<bool>,

    /// Timestamp when game was created
    pub created_at: u64,
}

/// Game session status
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GameStatus {
    /// Game has started but not yet completed
    Pending,

    /// Game has completed with a verified outcome
    Completed,

    /// Game was cancelled (e.g., timeout)
    Cancelled,
}

// ============================================================================
// Function Input/Output Types
// ============================================================================

/// Game outcome for verification
///
/// This is the data structure that should be proven by the ZK proof.
/// The proof verifies that these values are correct based on game execution.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GameOutcome {
    /// Game contract address
    pub game_id: Address,

    /// Unique session identifier
    pub session_id: BytesN<32>,

    /// First player's address
    pub player1: Address,

    /// Second player's address
    pub player2: Address,

    /// Winner of the game
    /// true = player1 won, false = player2 won
    pub winner: bool,
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
}

// ============================================================================
// Constants
// ============================================================================

/// Fixed-point scalar for 7 decimal places
/// Used for all multiplier calculations
pub const SCALAR_7: i128 = 10_000_000;

/// Fixed-point representation of 1.0 (with 7 decimals)
pub const FIXED_POINT_ONE: i128 = SCALAR_7;

/// Maximum amount for amount multiplier asymptote ($1,000 with 7 decimals)
pub const MAX_AMOUNT_USD: i128 = 1000_0000000;

/// Maximum time for time multiplier asymptote (30 days in seconds)
pub const MAX_TIME_SECONDS: u64 = 30 * 24 * 60 * 60;

/// Withdrawal threshold for deposit timestamp reset (50%)
/// Represented as a percentage in fixed-point (0.5 = 50%)
pub const WITHDRAWAL_RESET_THRESHOLD: i128 = SCALAR_7 / 2;
