#![no_std]

//! # Blendizzard
//!
//! A faction-based competitive gaming protocol on Stellar's Soroban platform.
//! Combines DeFi yield generation with gaming mechanics.
//!
//! ## Architecture
//! - Players deposit assets into fee-vault-v2 to earn faction points (fp)
//! - FP calculated from deposit amount and time with asymptotic multipliers
//! - Players compete in games by wagering fp
//! - Every 4-day epoch, winning faction shares BLND yield (converted to USDC)
//!
//! ## External Dependencies
//! - fee-vault-v2: Yield-generating vault
//! - Soroswap: DEX for BLND → USDC conversion
//! - soroban-fixed-point-math: Safe fixed-point arithmetic

use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Map, Vec};

mod errors;
mod events;
mod storage;
mod types;

mod epoch;
mod faction;
mod faction_points;
mod game;
mod rewards;
mod vault;

// External contract type definitions
mod fee_vault_v2;
mod router;

use errors::Error;
use types::{Config, EpochInfo, GameOutcome};

// ============================================================================
// Contract Definition
// ============================================================================

#[contract]
pub struct Blendizzard;

#[contractimpl]
impl Blendizzard {
    // ========================================================================
    // Initialization
    // ========================================================================

    /// Initialize the contract
    ///
    /// Sets up the admin, external contract addresses, and creates the first epoch.
    ///
    /// # Arguments
    /// * `admin` - Admin address (can modify config and upgrade contract)
    /// * `fee_vault` - fee-vault-v2 contract address
    /// * `soroswap_router` - Soroswap router contract address
    /// * `blnd_token` - BLND token address
    /// * `usdc_token` - USDC token address
    /// * `epoch_duration` - Duration of each epoch in seconds (default: 345,600 = 4 days)
    /// * `reserve_token_ids` - Reserve token IDs for claiming BLND emissions (e.g., vec![&env, 1] for reserve 0 b-tokens)
    ///
    /// # Errors
    /// * `AlreadyInitialized` - If contract has already been initialized
    pub fn __constructor(
        env: Env,
        admin: Address,
        fee_vault: Address,
        soroswap_router: Address,
        blnd_token: Address,
        usdc_token: Address,
        epoch_duration: u64,
        reserve_token_ids: Vec<u32>,
    ) -> Result<(), Error> {
        // Check if already initialized
        if storage::is_initialized(&env) {
            return Err(Error::AlreadyInitialized);
        }

        // Create config (admin and pause state stored separately)
        let config = Config {
            fee_vault,
            soroswap_router,
            blnd_token,
            usdc_token,
            epoch_duration,
            reserve_token_ids,
        };

        // Save config, admin, and pause state (all stored separately for single source of truth)
        storage::set_config(&env, &config);
        storage::set_admin(&env, &admin);
        storage::set_pause_state(&env, false); // Contract starts unpaused

        // Extend instance TTL for contract-wide data
        storage::extend_instance_ttl(&env);

        // Initialize first epoch
        epoch::initialize_first_epoch(&env, epoch_duration);

        Ok(())
    }

    // ========================================================================
    // Admin Functions
    // ========================================================================

    /// Update the admin address
    ///
    /// # Errors
    /// * `NotAdmin` - If caller is not the current admin
    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        let admin = storage::get_admin(&env);
        admin.require_auth();

        storage::set_admin(&env, &new_admin);
        events::emit_admin_changed(&env, &admin, &new_admin);

        Ok(())
    }

    /// Get the admin address
    pub fn get_admin(env: Env) -> Address {
        storage::get_admin(&env)
    }

    /// Get the current configuration
    pub fn get_config(env: Env) -> Config {
        storage::get_config(&env)
    }

    /// Update global configuration
    ///
    /// Allows admin to update specific configuration parameters.
    /// Only updates parameters that are provided (non-None).
    ///
    /// # Arguments
    /// * `new_fee_vault` - New fee-vault-v2 contract address (optional)
    /// * `new_soroswap_router` - New Soroswap router contract address (optional)
    /// * `new_blnd_token` - New BLND token address (optional)
    /// * `new_usdc_token` - New USDC token address (optional)
    /// * `new_epoch_duration` - New epoch duration in seconds (optional)
    /// * `new_reserve_token_ids` - New reserve token IDs for claiming BLND emissions (optional)
    ///
    /// # Errors
    /// * `NotAdmin` - If caller is not the admin
    pub fn update_config(
        env: Env,
        new_fee_vault: Option<Address>,
        new_soroswap_router: Option<Address>,
        new_blnd_token: Option<Address>,
        new_usdc_token: Option<Address>,
        new_epoch_duration: Option<u64>,
        new_reserve_token_ids: Option<Vec<u32>>,
    ) -> Result<(), Error> {
        let admin = storage::get_admin(&env);
        admin.require_auth();

        let mut config = storage::get_config(&env);

        // Update fee vault if provided
        if let Some(vault) = new_fee_vault {
            config.fee_vault = vault;
        }

        // Update soroswap router if provided
        if let Some(router) = new_soroswap_router {
            config.soroswap_router = router;
        }

        // Update BLND token if provided
        if let Some(blnd) = new_blnd_token {
            config.blnd_token = blnd;
        }

        // Update USDC token if provided
        if let Some(usdc) = new_usdc_token {
            config.usdc_token = usdc;
        }

        // Update epoch duration if provided
        if let Some(duration) = new_epoch_duration {
            config.epoch_duration = duration;
        }

        // Update reserve token IDs if provided
        if let Some(reserve_ids) = new_reserve_token_ids {
            config.reserve_token_ids = reserve_ids;
        }

        storage::set_config(&env, &config);

        // Emit config updated event
        events::emit_config_updated(&env, &admin);

        Ok(())
    }

    /// Update the contract WASM hash (upgrade contract)
    ///
    /// # Errors
    /// * `NotAdmin` - If caller is not the admin
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        let admin = storage::get_admin(&env);
        admin.require_auth();

        env.deployer().update_current_contract_wasm(new_wasm_hash);

        Ok(())
    }

    /// Pause the contract (emergency stop)
    ///
    /// When paused, all user-facing functions are disabled except admin functions.
    /// This is an emergency mechanism to protect user funds in case of discovered vulnerabilities.
    ///
    /// # Errors
    /// * `NotAdmin` - If caller is not the admin
    pub fn pause(env: Env) -> Result<(), Error> {
        let admin = storage::get_admin(&env);
        admin.require_auth();

        storage::set_pause_state(&env, true);

        Ok(())
    }

    /// Unpause the contract
    ///
    /// Restores normal contract functionality after emergency pause.
    ///
    /// # Errors
    /// * `NotAdmin` - If caller is not the admin
    pub fn unpause(env: Env) -> Result<(), Error> {
        let admin = storage::get_admin(&env);
        admin.require_auth();

        storage::set_pause_state(&env, false);

        Ok(())
    }

    /// Check if contract is paused
    pub fn is_paused(env: Env) -> bool {
        storage::is_paused(&env)
    }

    // ========================================================================
    // Game Registry
    // ========================================================================

    /// Add a game contract to the approved list
    ///
    /// # Errors
    /// * `NotAdmin` - If caller is not the admin
    pub fn add_game(env: Env, id: Address) -> Result<(), Error> {
        game::add_game(&env, &id)
    }

    /// Remove a game contract from the approved list
    ///
    /// # Errors
    /// * `NotAdmin` - If caller is not the admin
    pub fn remove_game(env: Env, id: Address) -> Result<(), Error> {
        game::remove_game(&env, &id)
    }

    /// Check if a contract is an approved game
    pub fn is_game(env: Env, id: Address) -> bool {
        game::is_game(&env, &id)
    }

    // ========================================================================
    // Vault Operations (REMOVED - Users interact directly with fee-vault-v2)
    // ========================================================================

    // ARCHITECTURE CHANGE: deposit() and withdraw() have been removed.
    // Users now interact directly with the fee-vault-v2 contract for deposits/withdrawals.
    // Blendizzard queries vault balances on-demand at game start and performs
    // cross-epoch withdrawal detection at that time.
    //
    // To deposit: Call fee-vault-v2.deposit() directly
    // To withdraw: Call fee-vault-v2.withdraw() directly
    //
    // The 50% withdrawal reset rule is enforced via cross-epoch balance comparison
    // when users play their first game of a new epoch.

    // ========================================================================
    // Faction Selection
    // ========================================================================

    /// Select a faction for the user
    ///
    /// Sets the user's persistent faction preference. Can be changed at ANY time.
    /// If you haven't played a game this epoch, the new faction applies immediately.
    /// If you've already played this epoch, the current epoch stays locked to your
    /// old faction, and the new selection applies starting next epoch.
    ///
    /// # Arguments
    /// * `faction` - Faction ID (0=WholeNoodle, 1=PointyStick, 2=SpecialRock)
    ///
    /// # Errors
    /// * `InvalidFaction` - If faction ID is not 0, 1, or 2
    pub fn select_faction(env: Env, user: Address, faction: u32) -> Result<(), Error> {
        faction::select_faction(&env, &user, faction)
    }

    // ========================================================================
    // Player Queries
    // ========================================================================

    /// Get player information
    ///
    /// Returns complete persistent player data including selected faction, total deposited,
    /// and deposit timestamp.
    ///
    /// # Errors
    /// * `UserNotFound` - If user has never interacted with the contract
    pub fn get_player(env: Env, user: Address) -> Result<types::User, Error> {
        storage::get_user(&env, &user).ok_or(Error::UserNotFound)
    }

    /// Get player's epoch-specific information
    ///
    /// Returns complete epoch-specific data including locked faction, available/locked FP,
    /// total FP contributed, and initial balance snapshot.
    ///
    /// If the user exists but hasn't played this epoch yet, returns a valid EpochUser with:
    /// - No faction locked (epoch_faction = None)
    /// - Zero faction points (available_fp = 0, locked_fp = 0)
    /// - No contributions (total_fp_contributed = 0)
    /// - Initial balance of 0 (not yet snapshotted)
    ///
    /// # Errors
    /// * `UserNotFound` - If user has never interacted with the contract
    pub fn get_epoch_player(env: Env, user: Address) -> Result<types::EpochUser, Error> {
        // Verify user exists first
        let _user_data = storage::get_user(&env, &user).ok_or(Error::UserNotFound)?;

        // Get epoch data - if user hasn't played this epoch, return valid defaults
        let current_epoch = storage::get_current_epoch(&env);
        let epoch_user =
            storage::get_epoch_user(&env, current_epoch, &user).unwrap_or(types::EpochUser {
                epoch_faction: None,
                initial_balance: 0,
                available_fp: 0,
                locked_fp: 0,
                total_fp_contributed: 0,
            });

        Ok(epoch_user)
    }

    // ========================================================================
    // Game Lifecycle
    // ========================================================================

    /// Start a new game session
    ///
    /// Locks factions and fp for both players. If this is a player's first game
    /// in the epoch, initializes their fp and locks their faction.
    ///
    /// # Errors
    /// * `GameNotWhitelisted` - If game_id is not approved
    /// * `SessionAlreadyExists` - If session_id already exists
    /// * `InvalidAmount` - If wagers are <= 0
    /// * `InsufficientFactionPoints` - If players don't have enough fp
    /// * `ContractPaused` - If contract is in emergency pause mode
    pub fn start_game(
        env: Env,
        game_id: Address,
        session_id: BytesN<32>,
        player1: Address,
        player2: Address,
        player1_wager: i128,
        player2_wager: i128,
    ) -> Result<(), Error> {
        storage::require_not_paused(&env)?;
        game::start_game(
            &env,
            &game_id,
            &session_id,
            &player1,
            &player2,
            player1_wager,
            player2_wager,
        )
    }

    /// End a game session with outcome verification
    ///
    /// Requires game contract authorization. Both players' FP wagers are spent/burned.
    /// Only the winner's wager contributes to their faction standings.
    /// ZK proof verification handled client-side for MVP.
    ///
    /// # Errors
    /// * `SessionNotFound` - If session doesn't exist
    /// * `InvalidSessionState` - If session is not Pending
    /// * `InvalidGameOutcome` - If outcome data doesn't match session
    /// * `ProofVerificationFailed` - If ZK proof is invalid
    pub fn end_game(
        env: Env,
        game_id: Address,
        session_id: BytesN<32>,
        proof: Bytes,
        outcome: GameOutcome,
    ) -> Result<(), Error> {
        game::end_game(&env, &game_id, &session_id, &proof, &outcome)
    }

    // ========================================================================
    // Epoch Management
    // ========================================================================

    /// Get epoch information
    ///
    /// Returns current epoch if no number specified, otherwise the specified epoch.
    ///
    /// # Errors
    /// * `EpochNotFinalized` - If requested epoch doesn't exist
    pub fn get_epoch(env: Env, epoch: Option<u32>) -> Result<EpochInfo, Error> {
        epoch::get_epoch(&env, epoch)
    }

    /// Cycle to the next epoch
    ///
    /// Finalizes current epoch (determines winner, withdraws BLND, swaps to USDC,
    /// sets reward pool) and opens next epoch.
    ///
    /// # Returns
    /// The new epoch number
    ///
    /// # Errors
    /// * `EpochNotReady` - If not enough time has passed
    /// * `EpochAlreadyFinalized` - If current epoch is already finalized
    /// * `FeeVaultError` - If fee-vault operations fail
    /// * `SwapError` - If BLND → USDC swap fails
    pub fn cycle_epoch(env: Env) -> Result<u32, Error> {
        epoch::cycle_epoch(&env)
    }

    // ========================================================================
    // Reward Claims
    // ========================================================================

    /// Claim epoch winnings/yield for a user for a specific epoch
    ///
    /// Calculates user's share of the reward pool based on their fp contribution
    /// to the winning faction.
    ///
    /// # Returns
    /// Amount of USDC claimed
    ///
    /// # Errors
    /// * `EpochNotFinalized` - If epoch doesn't exist or isn't finalized
    /// * `RewardAlreadyClaimed` - If user already claimed for this epoch
    /// * `NotWinningFaction` - If user wasn't in the winning faction
    /// * `NoRewardsAvailable` - If user has no rewards to claim
    /// * `ContractPaused` - If contract is in emergency pause mode
    pub fn claim_yield(env: Env, user: Address, epoch: u32) -> Result<i128, Error> {
        storage::require_not_paused(&env)?;
        rewards::claim_yield(&env, &user, epoch)
    }

    /// Calculate how much a user would receive if they claimed now
    ///
    /// This doesn't actually claim, just calculates the amount.
    /// Useful for UIs to show pending rewards.
    ///
    /// # Returns
    /// Amount user would receive, or 0 if not eligible
    pub fn get_claimable_amount(env: Env, user: Address, epoch: u32) -> i128 {
        rewards::get_claimable_amount(&env, &user, epoch)
    }

    /// Check if user has claimed rewards for an epoch
    pub fn has_claimed_rewards(env: Env, user: Address, epoch: u32) -> bool {
        rewards::has_claimed_rewards(&env, &user, epoch)
    }

    // ========================================================================
    // Additional Query Functions
    // ========================================================================

    /// Check if a user's faction is locked for the current epoch
    ///
    /// Once locked (after first game), faction cannot be changed until next epoch.
    pub fn is_faction_locked(env: Env, user: Address) -> bool {
        let current_epoch = storage::get_current_epoch(&env);
        faction::is_faction_locked(&env, &user, current_epoch)
    }

    /// Get faction standings for a specific epoch
    ///
    /// Returns a map of faction ID to total faction points.
    ///
    /// # Errors
    /// * `EpochNotFinalized` - If epoch doesn't exist
    pub fn get_faction_standings(env: Env, epoch: u32) -> Result<Map<u32, i128>, Error> {
        epoch::get_faction_standings(&env, epoch)
    }

    /// Get the winning faction for a finalized epoch
    ///
    /// # Errors
    /// * `EpochNotFinalized` - If epoch doesn't exist or isn't finalized
    pub fn get_winning_faction(env: Env, epoch: u32) -> Result<u32, Error> {
        epoch::get_winning_faction(&env, epoch)
    }

    /// Get the reward pool (USDC) for a finalized epoch
    ///
    /// # Errors
    /// * `EpochNotFinalized` - If epoch doesn't exist or isn't finalized
    pub fn get_reward_pool(env: Env, epoch: u32) -> Result<i128, Error> {
        epoch::get_reward_pool(&env, epoch)
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests;
