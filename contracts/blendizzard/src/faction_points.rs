use soroban_fixed_point_math::FixedPoint;
use soroban_sdk::{Address, Env};

use crate::errors::Error;
use crate::storage;
use crate::types::{EpochUser, FIXED_POINT_ONE, MAX_AMOUNT_USD, MAX_TIME_SECONDS, SCALAR_7};

// ============================================================================
// Faction Points Calculation
// ============================================================================

/// Calculate faction points for a user in the current epoch
///
/// **NEW ARCHITECTURE:** Queries vault balance instead of using cached User.total_deposited
///
/// From PLAN.md:
/// ```
/// fp = base_deposit_amount * amount_multiplier(deposit_amount) * time_multiplier(time_held)
/// ```
///
/// # Amount Multiplier
/// Asymptotic curve toward bonus at $1,000 USD:
/// ```
/// multiplier = 1.0 + (amount_usd / (amount_usd + $1000))
/// ```
/// Results in: 1.0x at $0, ~1.5x at $1k, ~1.75x at $3k, ~1.9x at $9k
///
/// # Time Multiplier
/// Asymptotic curve toward bonus at 30 days:
/// ```
/// multiplier = 1.0 + (time_held_seconds / (time_held_seconds + 30_days))
/// ```
/// Results in: 1.0x at 0 days, ~1.5x at 30 days, ~1.67x at 60 days
///
/// # Arguments
/// * `env` - Contract environment
/// * `user` - User to calculate FP for
///
/// # Returns
/// Total faction points for the user
///
/// # Errors
/// * `OverflowError` - If calculation overflows
pub(crate) fn calculate_faction_points(env: &Env, user: &Address) -> Result<i128, Error> {
    // Get user data
    let user_data = storage::get_user(env, user).ok_or(Error::InsufficientBalance)?;

    // NEW: Query vault balance instead of using cached total_deposited
    let base_amount = crate::vault::get_vault_balance(env, user);

    // If no deposit, no faction points
    if base_amount == 0 {
        return Ok(0);
    }

    // Calculate amount multiplier
    // MVP: Assumes USDC deposits only (1:1 with USD)
    // Future: Add oracle support for multi-asset deposits with price feeds
    let amount_mult = calculate_amount_multiplier(base_amount)?;

    // Calculate time multiplier
    let time_mult = calculate_time_multiplier(env, user_data.deposit_timestamp)?;

    // Calculate final FP: base_amount * amount_mult * time_mult
    let fp = calculate_fp_from_multipliers(base_amount, amount_mult, time_mult)?;

    Ok(fp)
}

/// Calculate amount multiplier
///
/// Formula: 1.0 + (amount / (amount + MAX_AMOUNT))
/// Where MAX_AMOUNT = $1,000 (with 7 decimals)
///
/// # Arguments
/// * `amount_usd` - Deposit amount in USD (7 decimals)
///
/// # Returns
/// Multiplier in fixed-point format (7 decimals)
fn calculate_amount_multiplier(amount_usd: i128) -> Result<i128, Error> {
    if amount_usd == 0 {
        return Ok(FIXED_POINT_ONE);
    }

    // Calculate: amount / (amount + MAX_AMOUNT)
    let denominator = amount_usd
        .checked_add(MAX_AMOUNT_USD)
        .ok_or(Error::OverflowError)?;

    let fraction = amount_usd
        .fixed_div_floor(denominator, SCALAR_7)
        .ok_or(Error::OverflowError)?;

    // Calculate: 1.0 + fraction
    let multiplier = FIXED_POINT_ONE
        .checked_add(fraction)
        .ok_or(Error::OverflowError)?;

    Ok(multiplier)
}

/// Calculate time multiplier
///
/// Formula: 1.0 + (time_held / (time_held + MAX_TIME))
/// Where MAX_TIME = 30 days in seconds
///
/// # Arguments
/// * `env` - Contract environment
/// * `deposit_timestamp` - When user deposited (or last reset)
///
/// # Returns
/// Multiplier in fixed-point format (7 decimals)
fn calculate_time_multiplier(env: &Env, deposit_timestamp: u64) -> Result<i128, Error> {
    let current_time = env.ledger().timestamp();

    // If no deposit yet, multiplier is 1.0
    if deposit_timestamp == 0 || deposit_timestamp > current_time {
        return Ok(FIXED_POINT_ONE);
    }

    // Calculate time held in seconds
    let time_held = current_time - deposit_timestamp;

    if time_held == 0 {
        return Ok(FIXED_POINT_ONE);
    }

    // Convert to i128 for calculations
    let time_held_i128 = i128::from(time_held);
    let max_time_i128 = i128::from(MAX_TIME_SECONDS);

    // Calculate: time_held / (time_held + MAX_TIME)
    let denominator = time_held_i128
        .checked_add(max_time_i128)
        .ok_or(Error::OverflowError)?;

    let fraction = time_held_i128
        .fixed_div_floor(denominator, SCALAR_7)
        .ok_or(Error::OverflowError)?;

    // Calculate: 1.0 + fraction
    let multiplier = FIXED_POINT_ONE
        .checked_add(fraction)
        .ok_or(Error::OverflowError)?;

    Ok(multiplier)
}

/// Calculate final FP from base amount and multipliers
///
/// Formula: base_amount * amount_mult * time_mult
/// Uses fixed-point math to avoid overflow
///
/// # Arguments
/// * `base_amount` - Base deposit amount
/// * `amount_mult` - Amount multiplier (fixed-point)
/// * `time_mult` - Time multiplier (fixed-point)
///
/// # Returns
/// Final faction points
fn calculate_fp_from_multipliers(
    base_amount: i128,
    amount_mult: i128,
    time_mult: i128,
) -> Result<i128, Error> {
    // First: base_amount * amount_mult
    let temp = base_amount
        .fixed_mul_floor(amount_mult, SCALAR_7)
        .ok_or(Error::OverflowError)?;

    // Second: temp * time_mult
    let fp = temp
        .fixed_mul_floor(time_mult, SCALAR_7)
        .ok_or(Error::OverflowError)?;

    Ok(fp)
}

// ============================================================================
// Faction Points Management
// ============================================================================

/// Initialize or update faction points for a user in the current epoch
///
/// **NEW ARCHITECTURE:** Snapshots vault balance at epoch start
///
/// This is called when a user starts their first game in an epoch.
/// It calculates their total FP and sets it as available_fp.
///
/// # Arguments
/// * `env` - Contract environment
/// * `user` - User to initialize FP for
/// * `current_epoch` - Current epoch number
///
/// # Returns
/// Total faction points calculated
pub(crate) fn initialize_epoch_fp(env: &Env, user: &Address, current_epoch: u32) -> Result<i128, Error> {
    // Calculate total FP (queries vault internally)
    let total_fp = calculate_faction_points(env, user)?;

    // Get current vault balance for snapshot
    let current_balance = crate::vault::get_vault_balance(env, user);

    // Get or create epoch user data
    let mut epoch_user = storage::get_epoch_user(env, current_epoch, user).unwrap_or(EpochUser {
        epoch_faction: None,
        initial_balance: current_balance, // Snapshot current balance
        available_fp: 0,
        locked_fp: 0,
        total_fp_contributed: 0,
    });

    // Set available FP (only if not already set)
    if epoch_user.available_fp == 0 && epoch_user.locked_fp == 0 {
        epoch_user.available_fp = total_fp;
        epoch_user.initial_balance = current_balance; // Update snapshot
    }

    // Save epoch user data
    storage::set_epoch_user(env, current_epoch, user, &epoch_user);

    Ok(total_fp)
}

/// Lock faction points for a game
///
/// Moves FP from available to locked.
///
/// # Arguments
/// * `env` - Contract environment
/// * `user` - User whose FP to lock
/// * `amount` - Amount of FP to lock
/// * `current_epoch` - Current epoch number
///
/// # Errors
/// * `InsufficientFactionPoints` - If user doesn't have enough available FP
pub(crate) fn lock_fp(env: &Env, user: &Address, amount: i128, current_epoch: u32) -> Result<(), Error> {
    let mut epoch_user = storage::get_epoch_user(env, current_epoch, user)
        .ok_or(Error::InsufficientFactionPoints)?;

    // Check if user has enough available FP
    if epoch_user.available_fp < amount {
        return Err(Error::InsufficientFactionPoints);
    }

    // Move FP from available to locked
    epoch_user.available_fp = epoch_user
        .available_fp
        .checked_sub(amount)
        .ok_or(Error::OverflowError)?;

    epoch_user.locked_fp = epoch_user
        .locked_fp
        .checked_add(amount)
        .ok_or(Error::OverflowError)?;

    // Save epoch user data
    storage::set_epoch_user(env, current_epoch, user, &epoch_user);

    Ok(())
}


