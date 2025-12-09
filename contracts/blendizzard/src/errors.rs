use soroban_sdk::contracterror;

/// Error codes for the Blendizzard contract
///
/// All errors are represented as u32 values for efficient storage and transmission.
/// Error codes are grouped by category for better organization.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    // ========================================================================
    // Admin errors (1-9)
    // ========================================================================
    // (No admin errors currently defined)

    // ========================================================================
    // Player errors (10-19)
    // ========================================================================
    /// Player has insufficient faction points for the requested wager
    InsufficientFactionPoints = 11,

    /// Amount is invalid (e.g., zero or negative)
    InvalidAmount = 12,

    /// Faction ID is invalid (must be 0, 1, or 2)
    InvalidFaction = 13,

    /// Player's faction is already locked for this epoch (cannot change)
    FactionAlreadyLocked = 14,

    /// Player does not exist (no deposits or interactions yet)
    PlayerNotFound = 15,

    /// Player must select a faction before playing games
    FactionNotSelected = 16,

    // ========================================================================
    // Game errors (20-29)
    // ========================================================================
    /// Game contract is not in the whitelist
    GameNotWhitelisted = 20,

    /// Game session was not found
    SessionNotFound = 21,

    /// Game session with this ID already exists
    SessionAlreadyExists = 22,

    /// Game session is in an invalid state for this operation
    InvalidSessionState = 23,

    /// Game outcome data is invalid
    InvalidGameOutcome = 24,

    /// Game is from a previous epoch and cannot be completed
    GameExpired = 25,

    // ========================================================================
    // Epoch errors (30-39)
    // ========================================================================
    /// Epoch has not been finalized yet
    EpochNotFinalized = 30,

    /// Epoch has already been finalized
    EpochAlreadyFinalized = 31,

    /// Epoch cannot be cycled yet (not enough time has passed)
    EpochNotReady = 32,

    // ========================================================================
    // Reward errors (40-49)
    // ========================================================================
    /// No rewards available for this player in this epoch
    NoRewardsAvailable = 40,

    /// Reward has already been claimed for this epoch
    RewardAlreadyClaimed = 41,

    /// Player was not in the winning faction for this epoch
    NotWinningFaction = 42,

    /// Player must deposit minimum amount to claim rewards (anti-sybil)
    DepositRequiredToClaim = 43,

    // ========================================================================
    // External contract errors (50-59)
    // ========================================================================
    /// Soroswap swap operation failed
    SwapError = 51,

    // ========================================================================
    // Math errors (60-69)
    // ========================================================================
    /// Arithmetic overflow occurred
    OverflowError = 60,

    /// Division by zero attempted
    DivisionByZero = 61,

    // ========================================================================
    // Emergency errors (70-79)
    // ========================================================================
    /// Contract is paused (emergency stop activated)
    ContractPaused = 70,
}
