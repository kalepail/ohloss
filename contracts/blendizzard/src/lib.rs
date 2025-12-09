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

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    vec, Address, BytesN, Env, Val, Vec,
};

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
use types::{Config, EpochInfo};

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
    /// * `free_fp_per_epoch` - Base FP granted to all players each epoch (enables free play)
    /// * `min_deposit_to_claim` - Minimum vault balance required to claim rewards (anti-sybil)
    ///
    pub fn __constructor(
        env: Env,
        admin: Address,
        fee_vault: Address,
        soroswap_router: Address,
        blnd_token: Address,
        usdc_token: Address,
        epoch_duration: u64,
        reserve_token_ids: Vec<u32>,
        free_fp_per_epoch: i128,
        min_deposit_to_claim: i128,
    ) {
        // Create config (admin and pause state stored separately)
        let config = Config {
            fee_vault,
            soroswap_router,
            blnd_token,
            usdc_token,
            epoch_duration,
            reserve_token_ids,
            free_fp_per_epoch,
            min_deposit_to_claim,
        };

        // Save config, admin, and pause state (all stored separately for single source of truth)
        storage::set_config(&env, &config);
        storage::set_admin(&env, &admin);
        storage::set_pause_state(&env, false); // Contract starts unpaused

        // Extend instance TTL for contract-wide data
        storage::extend_instance_ttl(&env);

        // Initialize first epoch
        epoch::initialize_first_epoch(&env, epoch_duration);
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
    /// * `new_free_fp_per_epoch` - New base FP for free play (optional)
    /// * `new_min_deposit_to_claim` - New minimum deposit to claim rewards (optional)
    ///
    /// # Errors
    /// * `NotAdmin` - If caller is not the admin
    #[allow(clippy::too_many_arguments)]
    pub fn update_config(
        env: Env,
        new_fee_vault: Option<Address>,
        new_soroswap_router: Option<Address>,
        new_blnd_token: Option<Address>,
        new_usdc_token: Option<Address>,
        new_epoch_duration: Option<u64>,
        new_reserve_token_ids: Option<Vec<u32>>,
        new_free_fp_per_epoch: Option<i128>,
        new_min_deposit_to_claim: Option<i128>,
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

        // Update free FP per epoch if provided
        if let Some(free_fp) = new_free_fp_per_epoch {
            config.free_fp_per_epoch = free_fp;
        }

        // Update min deposit to claim if provided
        if let Some(min_deposit) = new_min_deposit_to_claim {
            config.min_deposit_to_claim = min_deposit;
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
    /// When paused, all player-facing functions are disabled except admin functions.
    /// This is an emergency mechanism to protect player funds in case of discovered vulnerabilities.
    ///
    /// # Errors
    /// * `NotAdmin` - If caller is not the admin
    pub fn pause(env: Env) -> Result<(), Error> {
        let admin = storage::get_admin(&env);
        admin.require_auth();

        storage::set_pause_state(&env, true);
        events::emit_contract_paused(&env, &admin);

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
        events::emit_contract_unpaused(&env, &admin);

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
    // Vault Operations (REMOVED - Players interact directly with fee-vault-v2)
    // ========================================================================

    // ARCHITECTURE CHANGE: deposit() and withdraw() have been removed.
    // Players now interact directly with the fee-vault-v2 contract for deposits/withdrawals.
    // Blendizzard queries vault balances on-demand at game start and performs
    // cross-epoch withdrawal detection at that time.
    //
    // To deposit: Call fee-vault-v2.deposit() directly
    // To withdraw: Call fee-vault-v2.withdraw() directly
    //
    // The 50% withdrawal reset rule is enforced via cross-epoch balance comparison
    // when players play their first game of a new epoch.

    // ========================================================================
    // Faction Selection
    // ========================================================================

    /// Select a faction for the player
    ///
    /// Sets the player's persistent faction preference. Can be changed at ANY time.
    /// If you haven't played a game this epoch, the new faction applies immediately.
    /// If you've already played this epoch, the current epoch stays locked to your
    /// old faction, and the new selection applies starting next epoch.
    ///
    /// # Arguments
    /// * `faction` - Faction ID (0=WholeNoodle, 1=PointyStick, 2=SpecialRock)
    ///
    /// # Errors
    /// * `InvalidFaction` - If faction ID is not 0, 1, or 2
    pub fn select_faction(env: Env, player: Address, faction: u32) -> Result<(), Error> {
        faction::select_faction(&env, &player, faction)
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
    /// * `PlayerNotFound` - If player has never interacted with the contract
    pub fn get_player(env: Env, player: Address) -> Result<types::Player, Error> {
        storage::get_player(&env, &player).ok_or(Error::PlayerNotFound)
    }

    /// Get player's epoch-specific information for any epoch
    ///
    /// Returns complete epoch-specific data including locked faction, available FP,
    /// total FP contributed, and balance snapshot. Consistent with `get_epoch(epoch)`
    /// which also requires an epoch parameter.
    ///
    /// **Behavior for current epoch:** If player hasn't played any games this epoch yet,
    /// calculates what their FP WOULD be based on current vault balance without writing
    /// to storage. This allows UIs to display FP before the player's first game.
    ///
    /// **Behavior for historical epochs:** Only returns data if player participated in
    /// that epoch (played at least one game).
    ///
    /// # Arguments
    /// * `epoch` - Epoch number to query
    /// * `player` - Player address
    ///
    /// # Examples
    /// ```ignore
    /// // Current epoch
    /// let current = contract.get_current_epoch();
    /// let player_data = contract.get_epoch_player(&current, &player)?;
    ///
    /// // Historical epoch
    /// let epoch0_data = contract.get_epoch_player(&0, &player)?;
    /// ```
    ///
    /// # Errors
    /// * `FactionNotSelected` - If querying current epoch and player hasn't selected faction
    /// * `PlayerNotFound` - If querying historical epoch and player didn't participate
    pub fn get_epoch_player(
        env: Env,
        epoch: u32,
        player: Address,
    ) -> Result<types::EpochPlayer, Error> {
        // Try to get existing epoch player data first
        if let Some(epoch_player) = storage::get_epoch_player(&env, epoch, &player) {
            return Ok(epoch_player);
        }

        // If querying current epoch and no data exists yet, compute it on-the-fly
        if epoch == storage::get_current_epoch(&env) {
            // Check if player has selected a faction
            storage::get_player(&env, &player).ok_or(Error::FactionNotSelected)?;

            // Calculate FP using same logic as initialize_player_epoch
            let total_fp = faction_points::calculate_faction_points(&env, &player)?;
            let current_balance = vault::get_vault_balance(&env, &player);

            // Return computed EpochPlayer (not saved to storage yet)
            Ok(types::EpochPlayer {
                epoch_faction: None, // Faction not locked until first game
                epoch_balance_snapshot: current_balance,
                available_fp: total_fp,
                total_fp_contributed: 0,
            })
        } else {
            // For historical epochs, player must have participated
            Err(Error::PlayerNotFound)
        }
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
    /// * `PlayerNotFound` - If players don't exist
    /// * `InsufficientFactionPoints` - If players don't have enough fp
    /// * `ContractPaused` - If contract is in emergency pause mode
    pub fn start_game(
        env: Env,
        game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_wager: i128,
        player2_wager: i128,
    ) -> Result<(), Error> {
        storage::require_not_paused(&env)?;
        game::start_game(
            &env,
            &game_id,
            session_id,
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
    ///
    /// Outcome verification is handled by the individual game contracts.
    /// Each game is responsible for implementing its own verification mechanism
    /// (multi-sig oracle, ZK proofs, etc.) before calling this function.
    ///
    /// # Arguments
    /// * `session_id` - The unique session identifier
    /// * `player1_won` - true if player1 won, false if player2 won
    ///
    /// # Errors
    /// * `SessionNotFound` - If session doesn't exist
    /// * `InvalidSessionState` - If session is not Pending
    /// * `GameExpired` - If game is from a previous epoch
    pub fn end_game(env: Env, session_id: u32, player1_won: bool) -> Result<(), Error> {
        game::end_game(&env, session_id, player1_won)
    }

    // ========================================================================
    // Epoch Management
    // ========================================================================

    /// Get the current epoch number
    ///
    /// # Returns
    /// The current epoch number
    pub fn get_current_epoch(env: Env) -> u32 {
        storage::get_current_epoch(&env)
    }

    /// Get epoch information for a specific epoch
    ///
    /// # Arguments
    /// * `epoch` - The epoch number to retrieve
    ///
    /// # Errors
    /// * `EpochNotFinalized` - If requested epoch doesn't exist
    pub fn get_epoch(env: Env, epoch: u32) -> Result<EpochInfo, Error> {
        storage::get_epoch(&env, epoch).ok_or(Error::EpochNotFinalized)
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

    /// Claim epoch reward for a player for a specific epoch
    ///
    /// Players who contributed FP to the winning faction can claim their share
    /// of the epoch's reward pool (USDC converted from BLND yield).
    ///
    /// **Note:** To check claimable amounts or claim status before calling,
    /// use transaction simulation. This is the idiomatic Soroban pattern.
    ///
    /// # Returns
    /// Amount of USDC claimed
    ///
    /// # Errors
    /// * `EpochNotFinalized` - If epoch doesn't exist or isn't finalized
    /// * `RewardAlreadyClaimed` - If player already claimed for this epoch
    /// * `NotWinningFaction` - If player wasn't in the winning faction
    /// * `NoRewardsAvailable` - If player has no rewards to claim
    /// * `ContractPaused` - If contract is in emergency pause mode
    pub fn claim_epoch_reward(env: Env, player: Address, epoch: u32) -> Result<i128, Error> {
        storage::require_not_paused(&env)?;
        rewards::claim_epoch_reward(&env, &player, epoch)
    }
}

#[contractimpl]
impl CustomAccountInterface for Blendizzard {
    type Error = Error;
    type Signature = Option<Val>;

    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        _signature: Option<Val>,
        _auth_contexts: Vec<Context>,
    ) -> Result<(), Error> {
        let admin = storage::get_admin(&env);
        admin.require_auth_for_args(vec![&env, signature_payload.to_val()]);
        Ok(())
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests;
