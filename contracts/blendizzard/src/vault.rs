use soroban_fixed_point_math::FixedPoint;
use soroban_sdk::{Address, Env};

use crate::errors::Error;
use crate::fee_vault_v2::Client as FeeVaultClient;
use crate::storage;

// ============================================================================
// Vault Query Operations
// ============================================================================

/// Query the player's underlying token balance from fee-vault-v2
///
/// This is the primary way to check a player's vault position in the new architecture.
/// The contract no longer tracks balances internally - we query the vault directly.
///
/// # Arguments
/// * `env` - Contract environment
/// * `player` - Player whose balance to query
///
/// # Returns
/// * Player's underlying token balance in the vault
pub(crate) fn get_vault_balance(env: &Env, player: &Address) -> i128 {
    let config = storage::get_config(env);
    let vault_client = FeeVaultClient::new(env, &config.fee_vault);
    vault_client.get_underlying_tokens(player)
}

// ============================================================================
// Cross-Epoch Balance Comparison
// ============================================================================

/// Check if player's balance has decreased by >50% since last epoch
///
/// This implements the time multiplier reset rule in the cross-epoch architecture:
/// - Compare current vault balance to last_epoch_balance
/// - If net withdrawal > 50%, reset time_multiplier_start
///
/// # Arguments
/// * `env` - Contract environment
/// * `player` - Player to check
/// * `current_balance` - Player's current vault balance
/// * `epoch` - Current epoch (for event emission)
///
/// # Returns
/// * `true` if reset was triggered (>50% withdrawal detected)
/// * `false` if no reset needed
pub(crate) fn check_cross_epoch_withdrawal_reset(
    env: &Env,
    player: &Address,
    current_balance: i128,
    epoch: u32,
) -> Result<bool, Error> {
    // Get player data - if player doesn't exist yet, no reset needed
    let Some(mut player_data) = storage::get_player(env, player) else {
        return Ok(false);
    };

    // Skip check if no previous balance recorded
    if player_data.last_epoch_balance == 0 {
        return Ok(false);
    }

    // Calculate net change
    let net_change = current_balance - player_data.last_epoch_balance;

    // Only care about withdrawals (negative change)
    if net_change >= 0 {
        return Ok(false);
    }

    // Calculate withdrawal percentage (as fixed-point with 7 decimals)
    // Formula: abs(net_change) / last_epoch_balance > 0.5
    // SECURITY: Use fixed_div_ceil to round UP (more conservative, favors protocol)
    // Example: 50.1% withdrawal rounds to ceiling → more likely to trigger reset
    let abs_withdrawal = -net_change;
    let withdrawal_ratio = abs_withdrawal
        .fixed_div_ceil(player_data.last_epoch_balance, crate::types::SCALAR_7)
        .ok_or(Error::OverflowError)?;

    // Check if > 50% (use constant for efficiency)
    let reset = withdrawal_ratio > crate::types::WITHDRAWAL_RESET_THRESHOLD;

    if reset {
        // Reset time multiplier start to now
        player_data.time_multiplier_start = env.ledger().timestamp();
        storage::set_player(env, player, &player_data);

        // Emit event for transparency
        crate::events::emit_time_multiplier_reset(
            env,
            player,
            epoch,
            player_data.last_epoch_balance,
            current_balance,
            withdrawal_ratio,
        );
    }

    Ok(reset)
}
