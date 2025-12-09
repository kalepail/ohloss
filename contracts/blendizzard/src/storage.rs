use soroban_sdk::{contracttype, Address, Env};

use crate::types::{Config, EpochInfo, EpochPlayer, GameSession, Player};

// ============================================================================
// Storage Keys
// ============================================================================
// Uses type-safe enum keys to prevent storage collisions and improve type safety
//
// Storage Types:
// - Instance: Admin, Config, CurrentEpoch, Paused
// - Persistent: Player, Game
// - Temporary: EpochPlayer, Epoch, Session, Claimed

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Admin address - singleton (Instance storage)
    Admin,

    /// Global configuration - singleton (Instance storage)
    Config,

    /// Current epoch number - singleton (Instance storage)
    CurrentEpoch,

    /// Pause state - singleton (Instance storage)
    Paused,

    /// Player persistent data - Player(player_address) -> Player (Persistent storage)
    Player(Address),

    /// Player epoch-specific data - EpochPlayer(epoch_number, player_address) -> EpochPlayer (Temporary storage)
    EpochPlayer(u32, Address),

    /// Epoch metadata - Epoch(epoch_number) -> EpochInfo (Temporary storage)
    Epoch(u32),

    /// Game session data - Session(session_id) -> GameSession (Temporary storage)
    Session(u32),

    /// Whitelisted game contracts - Game(game_address) -> bool (Persistent storage)
    Game(Address),

    /// Reward claim tracking - Claimed(player_address, epoch_number) -> bool (Temporary storage)
    Claimed(Address, u32),
}

// ============================================================================
// Storage Utilities
// ============================================================================

/// Get the admin address
pub(crate) fn get_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("Admin not set")
}

/// Set the admin address
pub(crate) fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

/// Get the global configuration
pub(crate) fn get_config(env: &Env) -> Config {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .expect("Config not set")
}

/// Set the global configuration
pub(crate) fn set_config(env: &Env, config: &Config) {
    env.storage().instance().set(&DataKey::Config, config);
}

/// Get the current epoch number
pub(crate) fn get_current_epoch(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::CurrentEpoch)
        .unwrap_or(0)
}

/// Set the current epoch number
pub(crate) fn set_current_epoch(env: &Env, epoch: u32) {
    env.storage().instance().set(&DataKey::CurrentEpoch, &epoch);
}

/// Get player persistent data
pub(crate) fn get_player(env: &Env, player: &Address) -> Option<Player> {
    let key = DataKey::Player(player.clone());
    let result = env.storage().persistent().get(&key);
    if result.is_some() {
        extend_player_ttl(env, player);
    }
    result
}

/// Set player persistent data
pub(crate) fn set_player(env: &Env, player: &Address, data: &Player) {
    env.storage()
        .persistent()
        .set(&DataKey::Player(player.clone()), data);
    extend_player_ttl(env, player);
}

/// Get epoch-specific player data
pub(crate) fn get_epoch_player(env: &Env, epoch: u32, player: &Address) -> Option<EpochPlayer> {
    let key = DataKey::EpochPlayer(epoch, player.clone());
    let result: Option<EpochPlayer> = env.storage().temporary().get(&key);
    if result.is_some() {
        extend_epoch_player_ttl(env, epoch, player);
    }
    result
}

/// Set epoch-specific player data
pub(crate) fn set_epoch_player(env: &Env, epoch: u32, player: &Address, data: &EpochPlayer) {
    let key = DataKey::EpochPlayer(epoch, player.clone());
    env.storage().temporary().set(&key, data);
    extend_epoch_player_ttl(env, epoch, player);
}

/// Check if epoch player exists
pub(crate) fn has_epoch_player(env: &Env, epoch: u32, player: &Address) -> bool {
    env.storage()
        .temporary()
        .has(&DataKey::EpochPlayer(epoch, player.clone()))
}

/// Get epoch metadata
pub(crate) fn get_epoch(env: &Env, epoch: u32) -> Option<EpochInfo> {
    let key = DataKey::Epoch(epoch);
    let result = env.storage().temporary().get(&key);
    if result.is_some() {
        extend_epoch_ttl(env, epoch);
    }
    result
}

/// Set epoch metadata
pub(crate) fn set_epoch(env: &Env, epoch: u32, data: &EpochInfo) {
    let key = DataKey::Epoch(epoch);
    env.storage().temporary().set(&key, data);
    extend_epoch_ttl(env, epoch);
}

/// Get game session
pub(crate) fn get_session(env: &Env, session_id: u32) -> Option<GameSession> {
    let key = DataKey::Session(session_id);
    let result = env.storage().temporary().get(&key);
    if result.is_some() {
        extend_session_ttl(env, session_id);
    }
    result
}

/// Set game session
pub(crate) fn set_session(env: &Env, session_id: u32, data: &GameSession) {
    let key = DataKey::Session(session_id);
    env.storage().temporary().set(&key, data);
    extend_session_ttl(env, session_id);
}

/// Check if session exists
pub(crate) fn has_session(env: &Env, session_id: u32) -> bool {
    env.storage().temporary().has(&DataKey::Session(session_id))
}

/// Check if a game contract is whitelisted
pub(crate) fn is_game_whitelisted(env: &Env, game_id: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Game(game_id.clone()))
        .unwrap_or(false)
}

/// Add a game to the whitelist
pub(crate) fn add_game_to_whitelist(env: &Env, game_id: &Address) {
    env.storage()
        .persistent()
        .set(&DataKey::Game(game_id.clone()), &true);
}

/// Remove a game from the whitelist
pub(crate) fn remove_game_from_whitelist(env: &Env, game_id: &Address) {
    env.storage()
        .persistent()
        .remove(&DataKey::Game(game_id.clone()));
}

/// Check if player has claimed rewards for an epoch
pub(crate) fn has_claimed(env: &Env, player: &Address, epoch: u32) -> bool {
    let key = DataKey::Claimed(player.clone(), epoch);
    let result: Option<bool> = env.storage().temporary().get(&key);
    if let Some(true) = result {
        extend_claimed_ttl(env, player, epoch);
        true
    } else {
        false
    }
}

/// Mark rewards as claimed for player and epoch
pub(crate) fn set_claimed(env: &Env, player: &Address, epoch: u32) {
    let key = DataKey::Claimed(player.clone(), epoch);
    env.storage().temporary().set(&key, &true);
    extend_claimed_ttl(env, player, epoch);
}

// ============================================================================
// Storage TTL Management
// ============================================================================
// TTL (Time To Live) management ensures data doesn't expire unexpectedly
// Based on Soroban best practices:
// - Instance storage: Tied to contract lifetime (Admin, Config, CurrentEpoch, Paused)
// - Persistent storage: Cross-epoch data (Player, Game whitelist) - extends to 30 days when accessed
// - Temporary storage: Epoch-specific data (EpochPlayer, Epoch, Claimed, Session) - 30 days from last interaction
//
// Storage Type Summary:
// - Instance: Config-type variables that persist for contract lifetime
// - Persistent: Player data and game whitelist that must survive across epochs
// - Temporary: Epoch-specific data that expires 30 days after last access

/// TTL thresholds and extensions (in ledgers, ~5 seconds per ledger)
/// ~30 days = 518,400 ledgers
/// ~7 days = 120,960 ledgers
const TTL_THRESHOLD_LEDGERS: u32 = 120_960; // Extend if < 7 days remaining
const TTL_EXTEND_TO_LEDGERS: u32 = 518_400; // Extend to 30 days

/// Extend TTL for player data
/// Should be called whenever player data is read/written
pub(crate) fn extend_player_ttl(env: &Env, player: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::Player(player.clone()),
        TTL_THRESHOLD_LEDGERS,
        TTL_EXTEND_TO_LEDGERS,
    );
}

/// Extend TTL for epoch player data (temporary storage)
/// Should be called whenever epoch player data is read/written
pub(crate) fn extend_epoch_player_ttl(env: &Env, epoch: u32, player: &Address) {
    env.storage().temporary().extend_ttl(
        &DataKey::EpochPlayer(epoch, player.clone()),
        TTL_THRESHOLD_LEDGERS,
        TTL_EXTEND_TO_LEDGERS,
    );
}

/// Extend TTL for epoch data (temporary storage)
/// Should be called whenever epoch data is read/written
pub(crate) fn extend_epoch_ttl(env: &Env, epoch: u32) {
    env.storage().temporary().extend_ttl(
        &DataKey::Epoch(epoch),
        TTL_THRESHOLD_LEDGERS,
        TTL_EXTEND_TO_LEDGERS,
    );
}

/// Extend TTL for claimed rewards data (temporary storage)
/// Should be called whenever claim data is written
pub(crate) fn extend_claimed_ttl(env: &Env, player: &Address, epoch: u32) {
    env.storage().temporary().extend_ttl(
        &DataKey::Claimed(player.clone(), epoch),
        TTL_THRESHOLD_LEDGERS,
        TTL_EXTEND_TO_LEDGERS,
    );
}

/// Extend TTL for game session data (temporary storage)
/// Should be called whenever session data is read/written
pub(crate) fn extend_session_ttl(env: &Env, session_id: u32) {
    env.storage().temporary().extend_ttl(
        &DataKey::Session(session_id),
        TTL_THRESHOLD_LEDGERS,
        TTL_EXTEND_TO_LEDGERS,
    );
}

/// Extend TTL for instance storage (contract-wide data)
/// Should be called during initialization and periodically
pub(crate) fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD_LEDGERS, TTL_EXTEND_TO_LEDGERS);
}

// ============================================================================
// Emergency Pause Management
// ============================================================================

/// Check if the contract is paused
pub(crate) fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false) // Default to not paused if not set
}

/// Set pause state
pub(crate) fn set_pause_state(env: &Env, paused: bool) {
    env.storage().instance().set(&DataKey::Paused, &paused);
}

/// Check if contract is not paused, return error if paused
/// Call this at the start of all player-facing functions
pub(crate) fn require_not_paused(env: &Env) -> Result<(), crate::errors::Error> {
    if is_paused(env) {
        Err(crate::errors::Error::ContractPaused)
    } else {
        Ok(())
    }
}
