use soroban_sdk::{Address, Env};

use crate::errors::Error;
use crate::events::{emit_faction_locked, emit_faction_selected};
use crate::storage;
use crate::types::{EpochUser, Faction};

// ============================================================================
// Faction Selection
// ============================================================================

/// Select a faction for the user
///
/// This sets the user's persistent faction preference for future epochs.
/// Users can change their faction selection at ANY time - this updates their
/// preference but does NOT affect the current epoch if already locked.
///
/// Architecture:
/// - `User.selected_faction` - Persistent preference (can always change)
/// - `EpochUser.epoch_faction` - Locked for current epoch on first game (cannot change)
///
/// Behavior:
/// - Changing faction updates your persistent preference immediately
/// - If you haven't played a game this epoch, next game uses new faction
/// - If you've already played this epoch, current epoch stays locked to old faction
/// - New selection applies starting next epoch
///
/// # Arguments
/// * `env` - Contract environment
/// * `user` - User selecting the faction
/// * `faction` - Faction ID (0=WholeNoodle, 1=PointyStick, 2=SpecialRock)
///
/// # Errors
/// * `InvalidFaction` - If faction ID is not 0, 1, or 2
pub(crate) fn select_faction(env: &Env, user: &Address, faction: u32) -> Result<(), Error> {
    // Validate faction
    if !Faction::is_valid(faction) {
        return Err(Error::InvalidFaction);
    }

    // Authenticate user
    user.require_auth();

    // Get or create user data
    let mut user_data = storage::get_user(env, user).unwrap_or_else(|| crate::types::User {
        selected_faction: faction,
        deposit_timestamp: 0,
        last_epoch_balance: 0,
    });

    // Update faction selection (always allowed - affects future epochs)
    user_data.selected_faction = faction;

    // Save user data
    storage::set_user(env, user, &user_data);

    // Emit event
    emit_faction_selected(env, user, faction);

    Ok(())
}

/// Lock the user's faction for the current epoch
///
/// This is called automatically when a user starts their first game in an epoch.
/// Once locked, the faction cannot be changed for the rest of the epoch.
///
/// From PLAN.md:
/// - "Lock in the user's faction if it hasn't been elected yet via `select_faction`"
/// - This happens during start_game if epoch_faction is None
///
/// # Arguments
/// * `env` - Contract environment
/// * `user` - User whose faction to lock
/// * `current_epoch` - Current epoch number
///
/// # Returns
/// The locked faction ID
///
/// # Errors
/// * `FactionAlreadyLocked` - If faction is already locked for this epoch
pub(crate) fn lock_epoch_faction(env: &Env, user: &Address, current_epoch: u32) -> Result<u32, Error> {
    // Get user's selected faction (default to WholeNoodle if not set)
    let user_data = storage::get_user(env, user);
    let selected_faction = user_data.map(|u| u.selected_faction).unwrap_or(0);

    // Get or create epoch user data
    let mut epoch_user = storage::get_epoch_user(env, current_epoch, user).unwrap_or(EpochUser {
        epoch_faction: None,
        initial_balance: 0, // Will be set when FP is calculated
        available_fp: 0,
        locked_fp: 0,
        total_fp_contributed: 0,
    });

    // Check if already locked
    if let Some(locked_faction) = epoch_user.epoch_faction {
        return Ok(locked_faction);
    }

    // Lock the faction
    epoch_user.epoch_faction = Some(selected_faction);

    // Save epoch user data
    storage::set_epoch_user(env, current_epoch, user, &epoch_user);

    // Emit event
    emit_faction_locked(env, user, current_epoch, selected_faction);

    Ok(selected_faction)
}


/// Check if user's faction is locked for the current epoch
pub(crate) fn is_faction_locked(env: &Env, user: &Address, epoch: u32) -> bool {
    storage::get_epoch_user(env, epoch, user)
        .and_then(|eu| eu.epoch_faction)
        .is_some()
}
