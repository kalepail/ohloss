use soroban_sdk::{Address, Env};

use crate::errors::Error;
use crate::events::emit_faction_selected;
use crate::storage;
use crate::types::Faction;

// ============================================================================
// Faction Selection
// ============================================================================

/// Select a faction for the player
///
/// This sets the player's persistent faction preference for future epochs.
/// Players can change their faction selection at ANY time - this updates their
/// preference but does NOT affect the current epoch if already locked.
///
/// Architecture:
/// - `Player.selected_faction` - Persistent preference (can always change)
/// - `EpochPlayer.epoch_faction` - Locked for current epoch on first game (cannot change)
///
/// Behavior:
/// - Changing faction updates your persistent preference immediately
/// - If you haven't played a game this epoch, next game uses new faction
/// - If you've already played this epoch, current epoch stays locked to old faction
/// - New selection applies starting next epoch
///
/// # Arguments
/// * `env` - Contract environment
/// * `player` - Player selecting the faction
/// * `faction` - Faction ID (0=WholeNoodle, 1=PointyStick, 2=SpecialRock)
///
/// # Errors
/// * `InvalidFaction` - If faction ID is not 0, 1, or 2
pub(crate) fn select_faction(env: &Env, player: &Address, faction: u32) -> Result<(), Error> {
    // Validate faction
    if !Faction::is_valid(faction) {
        return Err(Error::InvalidFaction);
    }

    // Authenticate player
    player.require_auth();

    // Get or create player data
    let mut player_data =
        storage::get_player(env, player).unwrap_or_else(|| crate::types::Player {
            selected_faction: faction,
            time_multiplier_start: 0,
            last_epoch_balance: 0,
        });

    // Update faction selection (always allowed - affects future epochs)
    player_data.selected_faction = faction;

    // Save player data
    storage::set_player(env, player, &player_data);

    // Emit event
    emit_faction_selected(env, player, faction);

    Ok(())
}
