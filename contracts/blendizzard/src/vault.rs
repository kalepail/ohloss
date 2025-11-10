use soroban_sdk::{Address, Env};

use crate::errors::Error;
use crate::fee_vault_v2::Client as FeeVaultClient;
use crate::storage;

// ============================================================================
// Vault Query Operations
// ============================================================================

/// Query the user's underlying token balance from fee-vault-v2
///
/// This is the primary way to check a user's vault position in the new architecture.
/// The contract no longer tracks balances internally - we query the vault directly.
///
/// # Arguments
/// * `env` - Contract environment
/// * `user` - User whose balance to query
///
/// # Returns
/// * User's underlying token balance in the vault
pub(crate) fn get_vault_balance(env: &Env, user: &Address) -> i128 {
    let config = storage::get_config(env);
    let vault_client = FeeVaultClient::new(env, &config.fee_vault);
    vault_client.get_underlying_tokens(user)
}


// ============================================================================
// Cross-Epoch Balance Comparison
// ============================================================================

/// Check if user's balance has decreased by >50% since last epoch
///
/// This implements the deposit reset rule in the new cross-epoch architecture:
/// - Compare current vault balance to last_epoch_balance
/// - If net withdrawal > 50%, reset deposit_timestamp
///
/// # Arguments
/// * `env` - Contract environment
/// * `user` - User to check
/// * `current_balance` - User's current vault balance
///
/// # Returns
/// * `true` if reset was triggered (>50% withdrawal detected)
/// * `false` if no reset needed
pub(crate) fn check_cross_epoch_withdrawal_reset(
    env: &Env,
    user: &Address,
    current_balance: i128,
) -> Result<bool, Error> {
    // Get user data
    let mut user_data = storage::get_user(env, user).ok_or(Error::UserNotFound)?;

    // Skip check if no previous balance recorded
    if user_data.last_epoch_balance == 0 {
        return Ok(false);
    }

    // Calculate net change
    let net_change = current_balance - user_data.last_epoch_balance;

    // Only care about withdrawals (negative change)
    if net_change >= 0 {
        return Ok(false);
    }

    // Calculate withdrawal percentage (as fixed-point with 7 decimals)
    // Formula: abs(net_change) / last_epoch_balance > 0.5
    let abs_withdrawal = -net_change;
    let withdrawal_ratio = (abs_withdrawal * crate::types::SCALAR_7)
        .checked_div(user_data.last_epoch_balance)
        .ok_or(Error::OverflowError)?;

    // Check if > 50% (SCALAR_7 / 2 = 5_000_000)
    let threshold = crate::types::SCALAR_7 / 2;
    let reset = withdrawal_ratio > threshold;

    if reset {
        // Reset deposit timestamp to now
        user_data.deposit_timestamp = env.ledger().timestamp();
        storage::set_user(env, user, &user_data);
    }

    Ok(reset)
}

// ============================================================================
// Migration Notes
// ============================================================================

// REMOVED FUNCTIONS (no longer needed in cross-epoch architecture):
// - deposit() - Users deposit directly to fee-vault-v2
// - withdraw() - Users withdraw directly from fee-vault-v2
// - check_and_handle_withdrawal_reset() - Replaced by cross-epoch comparison
// - get_balance() - Replaced by get_vault_balance()
// - get_deposit_timestamp() - Still available via storage::get_user()

// NEW ARCHITECTURE:
// 1. Users interact directly with fee-vault-v2 for deposits/withdrawals
// 2. Blendizzard queries vault balances on-demand at game start
// 3. Withdrawal reset happens via cross-epoch comparison (not per-transaction)
// 4. FP calculated once per epoch based on vault balance snapshot
