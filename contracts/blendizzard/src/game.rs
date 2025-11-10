use soroban_sdk::{Address, Bytes, BytesN, Env};

use crate::errors::Error;
use crate::events::{emit_game_ended, emit_game_started};
use crate::faction::lock_epoch_faction;
use crate::faction_points::{initialize_epoch_fp, lock_fp};
use crate::storage;
use crate::types::{GameOutcome, GameSession, GameStatus};

// ============================================================================
// Game Registry
// ============================================================================

/// Add a game contract to the approved list
///
/// Only whitelisted games can be played. This prevents malicious contracts
/// from interacting with the Blendizzard system.
///
/// # Arguments
/// * `env` - Contract environment
/// * `game_id` - Address of the game contract to whitelist
///
/// # Errors
/// * `NotAdmin` - If caller is not the admin
pub(crate) fn add_game(env: &Env, game_id: &Address) -> Result<(), Error> {
    // Authenticate admin
    let admin = storage::get_admin(env);
    admin.require_auth();

    // Add to whitelist
    storage::add_game_to_whitelist(env, game_id);

    // Emit event
    crate::events::emit_game_added(env, game_id);

    Ok(())
}

/// Remove a game contract from the approved list
///
/// # Arguments
/// * `env` - Contract environment
/// * `game_id` - Address of the game contract to remove
///
/// # Errors
/// * `NotAdmin` - If caller is not the admin
pub(crate) fn remove_game(env: &Env, game_id: &Address) -> Result<(), Error> {
    // Authenticate admin
    let admin = storage::get_admin(env);
    admin.require_auth();

    // Remove from whitelist
    storage::remove_game_from_whitelist(env, game_id);

    // Emit event
    crate::events::emit_game_removed(env, game_id);

    Ok(())
}

/// Check if a contract is an approved game
///
/// # Arguments
/// * `env` - Contract environment
/// * `game_id` - Address of the game contract to check
///
/// # Returns
/// * `true` if the game is whitelisted
/// * `false` otherwise
pub(crate) fn is_game(env: &Env, game_id: &Address) -> bool {
    storage::is_game_whitelisted(env, game_id)
}

// ============================================================================
// Game Lifecycle
// ============================================================================

/// Start a new game session
///
/// From PLAN.md:
/// "When a game starts there's actually quite a bit that needs to be recorded:
/// - If it's the players first game for the epoch we need to lock in their total
///   available factions points for the epoch
/// - Lock in the user's faction if it hasn't been elected yet via `select_faction`"
///
/// # Arguments
/// * `env` - Contract environment
/// * `game_id` - Address of the game contract
/// * `session_id` - Unique session identifier
/// * `player1` - First player's address
/// * `player2` - Second player's address
/// * `player1_wager` - Faction points wagered by player1
/// * `player2_wager` - Faction points wagered by player2
///
/// # Errors
/// * `GameNotWhitelisted` - If game_id is not in the whitelist
/// * `SessionAlreadyExists` - If session_id already exists
/// * `InvalidAmount` - If wagers are <= 0
/// * `InsufficientFactionPoints` - If players don't have enough FP
pub(crate) fn start_game(
    env: &Env,
    game_id: &Address,
    session_id: &BytesN<32>,
    player1: &Address,
    player2: &Address,
    player1_wager: i128,
    player2_wager: i128,
) -> Result<(), Error> {
    // SECURITY: Require game contract to authorize this call
    // Only the whitelisted game contract should be able to start sessions
    // This prevents fake sessions from being created with a whitelisted game_id
    game_id.require_auth();

    // Validate game is whitelisted
    if !storage::is_game_whitelisted(env, game_id) {
        return Err(Error::GameNotWhitelisted);
    }

    // Validate session doesn't already exist
    if storage::has_session(env, session_id) {
        return Err(Error::SessionAlreadyExists);
    }

    // Validate wagers
    if player1_wager <= 0 || player2_wager <= 0 {
        return Err(Error::InvalidAmount);
    }

    // Authenticate players (for their consent to lock FP)
    player1.require_auth();
    player2.require_auth();

    // Get current epoch
    let current_epoch = storage::get_current_epoch(env);

    // Initialize faction points for each player if this is their first game
    // This also locks in their total available FP for the epoch
    initialize_player_epoch(env, player1, current_epoch)?;
    initialize_player_epoch(env, player2, current_epoch)?;

    // Lock factions for both players (stored in EpochUser.epoch_faction)
    lock_epoch_faction(env, player1, current_epoch)?;
    lock_epoch_faction(env, player2, current_epoch)?;

    // Lock faction points for both players
    lock_fp(env, player1, player1_wager, current_epoch)?;
    lock_fp(env, player2, player2_wager, current_epoch)?;

    // Create game session
    let session = GameSession {
        game_id: game_id.clone(),
        session_id: session_id.clone(),
        player1: player1.clone(),
        player2: player2.clone(),
        player1_wager,
        player2_wager,
        status: GameStatus::Pending,
        winner: None,
        created_at: env.ledger().timestamp(),
    };

    // Save session
    storage::set_session(env, session_id, &session);

    // Emit event
    emit_game_started(
        env,
        game_id,
        session_id,
        player1,
        player2,
        player1_wager,
        player2_wager,
    );

    Ok(())
}

/// End a game session with outcome verification
///
/// From PLAN.md:
/// "Requires risc0 or noir proof"
/// "Output: game_id, session_id, player 1 address, player 2 address,
///          winner (true for player 1, false for player 2)"
///
/// # Arguments
/// * `env` - Contract environment
/// * `game_id` - Address of the game contract (must authorize call)
/// * `session_id` - Unique session identifier
/// * `proof` - ZK proof placeholder (verification handled client-side for MVP)
/// * `outcome` - Game outcome data
///
/// # Errors
/// * `SessionNotFound` - If session doesn't exist
/// * `InvalidSessionState` - If session is not in Pending state
/// * `InvalidGameOutcome` - If outcome data doesn't match session
/// * `ProofVerificationFailed` - If ZK proof is invalid (future implementation)
pub(crate) fn end_game(
    env: &Env,
    game_id: &Address,
    session_id: &BytesN<32>,
    proof: &Bytes,
    outcome: &GameOutcome,
) -> Result<(), Error> {
    // SECURITY: Require game contract to authorize this call
    // Only the whitelisted game contract should be able to submit outcomes
    game_id.require_auth();

    // Get session
    let mut session = storage::get_session(env, session_id).ok_or(Error::SessionNotFound)?;

    // Validate session state
    if session.status != GameStatus::Pending {
        return Err(Error::InvalidSessionState);
    }

    // Validate outcome matches session
    if outcome.game_id != *game_id
        || outcome.session_id != *session_id
        || outcome.player1 != session.player1
        || outcome.player2 != session.player2
    {
        return Err(Error::InvalidGameOutcome);
    }

    // Proof verification (currently placeholder for MVP)
    // Phase 1-2: Multi-sig oracle handled client-side before calling end_game
    // Phase 4: On-chain ZK proof verification (risc0/noir) when WASM verifier available
    verify_proof(env, proof, outcome)?;

    // Determine winner and loser
    let (winner, loser, winner_wager, loser_wager) = if outcome.winner {
        // Player1 won
        (
            &session.player1,
            &session.player2,
            session.player1_wager,
            session.player2_wager,
        )
    } else {
        // Player2 won
        (
            &session.player2,
            &session.player1,
            session.player2_wager,
            session.player1_wager,
        )
    };

    // Spend FP: Both players LOSE their wagered FP (it's consumed/burned)
    // Only the winner's wager contributes to their faction standings
    let current_epoch = storage::get_current_epoch(env);

    // Get both players' epoch data
    let mut winner_epoch = storage::get_epoch_user(env, current_epoch, winner)
        .ok_or(Error::InsufficientFactionPoints)?;
    let mut loser_epoch = storage::get_epoch_user(env, current_epoch, loser)
        .ok_or(Error::InsufficientFactionPoints)?;

    // Step 1: Remove winner's wager from locked_fp (spent/burned)
    winner_epoch.locked_fp = winner_epoch
        .locked_fp
        .checked_sub(winner_wager)
        .ok_or(Error::OverflowError)?;

    // Step 2: Remove loser's wager from locked_fp (spent/burned)
    loser_epoch.locked_fp = loser_epoch
        .locked_fp
        .checked_sub(loser_wager)
        .ok_or(Error::OverflowError)?;

    // Step 3: Only winner's wager contributes to faction standings
    winner_epoch.total_fp_contributed = winner_epoch
        .total_fp_contributed
        .checked_add(winner_wager)
        .ok_or(Error::OverflowError)?;

    // Save both players' updated data
    storage::set_epoch_user(env, current_epoch, winner, &winner_epoch);
    storage::set_epoch_user(env, current_epoch, loser, &loser_epoch);

    // Update session
    session.status = GameStatus::Completed;
    session.winner = Some(outcome.winner);
    storage::set_session(env, session_id, &session);

    // Update faction standings (only winner's wager contributes)
    update_faction_standings(env, winner, winner_wager, current_epoch)?;

    // Emit event (only winner's wager counts as contribution)
    emit_game_ended(env, game_id, session_id, winner, loser, winner_wager);

    Ok(())
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Initialize faction points for a player if this is their first game in the epoch
///
/// **NEW ARCHITECTURE (Cross-Epoch Balance Comparison):**
/// 1. Query current vault balance
/// 2. Check for >50% withdrawal since last epoch
/// 3. Initialize deposit_timestamp if first-time user
/// 4. Calculate FP based on current balance + multipliers
/// 5. Save epoch snapshot and update last_epoch_balance
fn initialize_player_epoch(env: &Env, player: &Address, current_epoch: u32) -> Result<(), Error> {
    // Check if player already has epoch data
    if storage::has_epoch_user(env, current_epoch, player) {
        // Already initialized this epoch
        return Ok(());
    }

    // STEP 1: Query current vault balance
    let current_balance = crate::vault::get_vault_balance(env, player);

    // STEP 2: Get or create user record
    let mut user_data = storage::get_user(env, player).unwrap_or(crate::types::User {
        selected_faction: 0, // Default to WholeNoodle
        deposit_timestamp: 0,
        last_epoch_balance: 0,
    });

    // STEP 3: Initialize deposit_timestamp if first-time user
    if user_data.deposit_timestamp == 0 && current_balance > 0 {
        user_data.deposit_timestamp = env.ledger().timestamp();
    }

    // STEP 4: Check for cross-epoch withdrawal reset (>50%)
    let _reset = crate::vault::check_cross_epoch_withdrawal_reset(env, player, current_balance)?;

    // STEP 5: Calculate FP based on current balance and multipliers
    // This calls initialize_epoch_fp which will use the balance we pass
    initialize_epoch_fp(env, player, current_epoch)?;

    // STEP 6: Update last_epoch_balance for next epoch comparison
    user_data.last_epoch_balance = current_balance;
    storage::set_user(env, player, &user_data);

    Ok(())
}

/// Verify ZK proof (Placeholder for MVP)
///
/// **Current Implementation (Phase 1-2):**
/// - Returns Ok() without verification (placeholder)
/// - Multi-sig oracle verification handled client-side
/// - Game contract authorization via require_auth() provides security
///
/// **Future Implementation (Phase 4):**
/// When WASM-based ZK verifiers are available on Soroban:
/// - Verify risc0 or noir proofs on-chain
/// - Example: `verifier.verify(proof, &encode_outcome(outcome))?`
///
/// This function will be updated when:
/// 1. Multi-sig oracle needs on-chain verification, or
/// 2. ZK proof WASM verifiers become available on Soroban
fn verify_proof(_env: &Env, _proof: &Bytes, _outcome: &GameOutcome) -> Result<(), Error> {
    // Placeholder - always succeeds
    // Security provided by game_id.require_auth() in end_game()
    Ok(())
}

/// Update faction standings with the winner's FP contribution
fn update_faction_standings(
    env: &Env,
    winner: &Address,
    fp_amount: i128,
    current_epoch: u32,
) -> Result<(), Error> {
    // Get winner's faction
    let epoch_user = storage::get_epoch_user(env, current_epoch, winner)
        .ok_or(Error::InsufficientFactionPoints)?;

    let faction = epoch_user
        .epoch_faction
        .ok_or(Error::FactionAlreadyLocked)?;

    // Get current epoch info
    let mut epoch_info = storage::get_epoch(env, current_epoch).ok_or(Error::EpochNotFinalized)?;

    // Update faction standings
    let current_standing = epoch_info.faction_standings.get(faction).unwrap_or(0);
    let new_standing = current_standing
        .checked_add(fp_amount)
        .ok_or(Error::OverflowError)?;

    epoch_info.faction_standings.set(faction, new_standing);

    // Save epoch info
    storage::set_epoch(env, current_epoch, &epoch_info);

    Ok(())
}
