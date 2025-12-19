use soroban_fixed_point_math::FixedPoint;
use soroban_sdk::{Address, Env};

use crate::errors::Error;
use crate::storage;
use crate::types::{
    EpochPlayer, BASE_FP_PER_USDC, COMPONENT_PEAK, FIXED_POINT_ONE, MAX_AMOUNT_USD,
    MAX_TIME_SECONDS, SCALAR_7, TARGET_AMOUNT_USD, TARGET_TIME_SECONDS,
};

// ============================================================================
// Faction Points Calculation
// ============================================================================

/// Calculate faction points for a player in the current epoch
///
/// **FREE PLAY ARCHITECTURE:** All players receive a base free FP allocation each epoch,
/// plus additional FP calculated from their vault deposit (if any).
///
/// # Formula
/// ```
/// total_fp = free_fp_per_epoch + deposit_fp
/// deposit_fp = (deposit_amount * 100) * amount_multiplier * time_multiplier
/// ```
/// Where: **1 USDC = 100 FP** (before multipliers)
///
/// # Free Play Mechanics
/// - All players receive `config.free_fp_per_epoch` FP each epoch (default: 100 FP)
/// - Players can participate in games without depositing
/// - Deposit-based FP is additive (stacks on top of free FP)
/// - Rewards require minimum deposit to claim (anti-sybil)
///
/// # Smooth Piecewise Multiplier System (Cubic Hermite Splines)
///
/// Both amount and time multipliers use smooth piecewise curves that:
/// - Rise smoothly from 1.0x to peak at target
/// - Fall smoothly from peak back to 1.0x at maximum
/// - Peak combined multiplier: 6.0x (each component: 2.449x)
///
/// ## Amount Multiplier
/// - Target: $1,000 → 2.449x (component peak)
/// - Maximum: $10,000 → 1.0x
/// - Smooth cubic interpolation with zero derivatives at endpoints
///
/// ## Time Multiplier
/// - Target: 35 days (5 weeks) → 2.449x (component peak)
/// - Maximum: 245 days (35 weeks) → 1.0x
/// - Smooth cubic interpolation with zero derivatives at endpoints
///
/// **Combined at target**: 2.449 × 2.449 ≈ 6.0x
/// **Result**: Target players ($1k, 35d) get 600 FP per $1 + 100 free FP
///
/// # Arguments
/// * `env` - Contract environment
/// * `player` - Player to calculate FP for
///
/// # Returns
/// Total faction points for the player (free FP + deposit FP)
///
/// # Errors
/// * `OverflowError` - If calculation overflows
pub(crate) fn calculate_faction_points(env: &Env, player: &Address) -> Result<i128, Error> {
    // Get player data
    let player_data = storage::get_player(env, player).ok_or(Error::PlayerNotFound)?;

    // Get config for free FP allocation
    let config = storage::get_config(env);

    // Query vault balance
    let base_amount = crate::vault::get_vault_balance(env, player);

    // If no deposit, return only the free FP allocation
    if base_amount == 0 {
        return Ok(config.free_fp_per_epoch);
    }

    // Calculate deposit-based FP with multipliers
    // MVP: Assumes USDC deposits only (1:1 with USD)
    // Future: Add oracle support for multi-asset deposits with price feeds
    let amount_mult = calculate_amount_multiplier(base_amount)?;

    // Calculate time multiplier
    let time_mult = calculate_time_multiplier(env, player_data.time_multiplier_start)?;

    // Calculate deposit FP: base_amount * amount_mult * time_mult
    let deposit_fp = calculate_fp_from_multipliers(base_amount, amount_mult, time_mult)?;

    // Total FP = free FP + deposit FP (additive)
    let total_fp = config
        .free_fp_per_epoch
        .checked_add(deposit_fp)
        .ok_or(Error::OverflowError)?;

    Ok(total_fp)
}

/// Calculate amount multiplier using smooth piecewise (cubic Hermite spline)
///
/// Smooth piecewise curve that:
/// - [0, TARGET]: Rises smoothly from 1.0x to COMPONENT_PEAK
/// - [TARGET, MAX]: Falls smoothly from COMPONENT_PEAK to 1.0x
///
/// Uses Hermite basis function: h(t) = 3t² - 2t³
/// This provides smooth acceleration/deceleration with zero derivatives at endpoints
///
/// # Arguments
/// * `amount_usd` - Deposit amount in USD (7 decimals)
///
/// # Returns
/// Multiplier in fixed-point format (7 decimals)
fn calculate_amount_multiplier(amount_usd: i128) -> Result<i128, Error> {
    if amount_usd <= 0 {
        return Ok(FIXED_POINT_ONE);
    }

    if amount_usd <= TARGET_AMOUNT_USD {
        // Rising segment: 1.0 -> COMPONENT_PEAK
        // t = amount / TARGET
        let t = amount_usd
            .fixed_div_floor(TARGET_AMOUNT_USD, SCALAR_7)
            .ok_or(Error::OverflowError)?;

        // Hermite basis: h(t) = 3t² - 2t³
        let t_squared = t.fixed_mul_floor(t, SCALAR_7).ok_or(Error::OverflowError)?;

        let t_cubed = t_squared
            .fixed_mul_floor(t, SCALAR_7)
            .ok_or(Error::OverflowError)?;

        let three_t_squared = t_squared.checked_mul(3).ok_or(Error::OverflowError)?;

        let two_t_cubed = t_cubed.checked_mul(2).ok_or(Error::OverflowError)?;

        let h = three_t_squared
            .checked_sub(two_t_cubed)
            .ok_or(Error::OverflowError)?;

        // multiplier = 1.0 + h * (COMPONENT_PEAK - 1.0)
        let peak_minus_one = COMPONENT_PEAK
            .checked_sub(FIXED_POINT_ONE)
            .ok_or(Error::OverflowError)?;

        let h_times_peak = h
            .fixed_mul_floor(peak_minus_one, SCALAR_7)
            .ok_or(Error::OverflowError)?;

        let multiplier = FIXED_POINT_ONE
            .checked_add(h_times_peak)
            .ok_or(Error::OverflowError)?;

        return Ok(multiplier);
    } else {
        // Falling segment: COMPONENT_PEAK -> 1.0
        // Cap at MAX_AMOUNT_USD
        let capped_amount = if amount_usd > MAX_AMOUNT_USD {
            MAX_AMOUNT_USD
        } else {
            amount_usd
        };

        let excess = capped_amount
            .checked_sub(TARGET_AMOUNT_USD)
            .ok_or(Error::OverflowError)?;

        let range = MAX_AMOUNT_USD
            .checked_sub(TARGET_AMOUNT_USD)
            .ok_or(Error::OverflowError)?;

        // t = excess / range
        let t = excess
            .fixed_div_floor(range, SCALAR_7)
            .ok_or(Error::OverflowError)?;

        // Hermite basis: h(t) = 3t² - 2t³
        let t_squared = t.fixed_mul_floor(t, SCALAR_7).ok_or(Error::OverflowError)?;

        let t_cubed = t_squared
            .fixed_mul_floor(t, SCALAR_7)
            .ok_or(Error::OverflowError)?;

        let three_t_squared = t_squared.checked_mul(3).ok_or(Error::OverflowError)?;

        let two_t_cubed = t_cubed.checked_mul(2).ok_or(Error::OverflowError)?;

        let h = three_t_squared
            .checked_sub(two_t_cubed)
            .ok_or(Error::OverflowError)?;

        // multiplier = COMPONENT_PEAK - h * (COMPONENT_PEAK - 1.0)
        let peak_minus_one = COMPONENT_PEAK
            .checked_sub(FIXED_POINT_ONE)
            .ok_or(Error::OverflowError)?;

        let h_times_peak = h
            .fixed_mul_floor(peak_minus_one, SCALAR_7)
            .ok_or(Error::OverflowError)?;

        let multiplier = COMPONENT_PEAK
            .checked_sub(h_times_peak)
            .ok_or(Error::OverflowError)?;

        return Ok(multiplier);
    }
}

/// Calculate time multiplier using smooth piecewise (cubic Hermite spline)
///
/// Smooth piecewise curve that:
/// - [0, TARGET_TIME]: Rises smoothly from 1.0x to COMPONENT_PEAK
/// - [TARGET_TIME, MAX_TIME]: Falls smoothly from COMPONENT_PEAK to 1.0x
///
/// Uses Hermite basis function: h(t) = 3t² - 2t³
/// This provides smooth acceleration/deceleration with zero derivatives at endpoints
///
/// # Arguments
/// * `env` - Contract environment
/// * `time_multiplier_start` - When the time multiplier clock started (first game or last reset)
///
/// # Returns
/// Multiplier in fixed-point format (7 decimals)
fn calculate_time_multiplier(env: &Env, time_multiplier_start: u64) -> Result<i128, Error> {
    let current_time = env.ledger().timestamp();

    // If not started yet, multiplier is 1.0
    if time_multiplier_start == 0 || time_multiplier_start > current_time {
        return Ok(FIXED_POINT_ONE);
    }

    // Calculate time held in seconds
    let time_held = current_time - time_multiplier_start;

    if time_held == 0 {
        return Ok(FIXED_POINT_ONE);
    }

    if time_held <= TARGET_TIME_SECONDS {
        // Rising segment: 1.0 -> COMPONENT_PEAK
        // t = time_held / TARGET_TIME
        let time_held_i128 = i128::from(time_held);
        let target_time_i128 = i128::from(TARGET_TIME_SECONDS);

        let t = time_held_i128
            .fixed_div_floor(target_time_i128, SCALAR_7)
            .ok_or(Error::OverflowError)?;

        // Hermite basis: h(t) = 3t² - 2t³
        let t_squared = t.fixed_mul_floor(t, SCALAR_7).ok_or(Error::OverflowError)?;

        let t_cubed = t_squared
            .fixed_mul_floor(t, SCALAR_7)
            .ok_or(Error::OverflowError)?;

        let three_t_squared = t_squared.checked_mul(3).ok_or(Error::OverflowError)?;

        let two_t_cubed = t_cubed.checked_mul(2).ok_or(Error::OverflowError)?;

        let h = three_t_squared
            .checked_sub(two_t_cubed)
            .ok_or(Error::OverflowError)?;

        // multiplier = 1.0 + h * (COMPONENT_PEAK - 1.0)
        let peak_minus_one = COMPONENT_PEAK
            .checked_sub(FIXED_POINT_ONE)
            .ok_or(Error::OverflowError)?;

        let h_times_peak = h
            .fixed_mul_floor(peak_minus_one, SCALAR_7)
            .ok_or(Error::OverflowError)?;

        let multiplier = FIXED_POINT_ONE
            .checked_add(h_times_peak)
            .ok_or(Error::OverflowError)?;

        return Ok(multiplier);
    } else {
        // Falling segment: COMPONENT_PEAK -> 1.0
        // Cap at MAX_TIME_SECONDS
        let capped_time = if time_held > MAX_TIME_SECONDS {
            MAX_TIME_SECONDS
        } else {
            time_held
        };

        let excess = capped_time - TARGET_TIME_SECONDS;
        let range = MAX_TIME_SECONDS - TARGET_TIME_SECONDS;

        let excess_i128 = i128::from(excess);
        let range_i128 = i128::from(range);

        // t = excess / range
        let t = excess_i128
            .fixed_div_floor(range_i128, SCALAR_7)
            .ok_or(Error::OverflowError)?;

        // Hermite basis: h(t) = 3t² - 2t³
        let t_squared = t.fixed_mul_floor(t, SCALAR_7).ok_or(Error::OverflowError)?;

        let t_cubed = t_squared
            .fixed_mul_floor(t, SCALAR_7)
            .ok_or(Error::OverflowError)?;

        let three_t_squared = t_squared.checked_mul(3).ok_or(Error::OverflowError)?;

        let two_t_cubed = t_cubed.checked_mul(2).ok_or(Error::OverflowError)?;

        let h = three_t_squared
            .checked_sub(two_t_cubed)
            .ok_or(Error::OverflowError)?;

        // multiplier = COMPONENT_PEAK - h * (COMPONENT_PEAK - 1.0)
        let peak_minus_one = COMPONENT_PEAK
            .checked_sub(FIXED_POINT_ONE)
            .ok_or(Error::OverflowError)?;

        let h_times_peak = h
            .fixed_mul_floor(peak_minus_one, SCALAR_7)
            .ok_or(Error::OverflowError)?;

        let multiplier = COMPONENT_PEAK
            .checked_sub(h_times_peak)
            .ok_or(Error::OverflowError)?;

        return Ok(multiplier);
    }
}

/// Calculate final FP from base amount and multipliers
///
/// Formula: (base_amount * BASE_FP_PER_USDC) * amount_mult * time_mult
/// Where BASE_FP_PER_USDC = 100 (so 1 USDC = 100 FP before multipliers)
/// Uses fixed-point math to avoid overflow
///
/// # Arguments
/// * `base_amount` - Base deposit amount in USDC (7 decimals)
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
    // First: base_amount * BASE_FP_PER_USDC
    let base_fp = base_amount
        .checked_mul(BASE_FP_PER_USDC)
        .ok_or(Error::OverflowError)?;

    // Second: base_fp * amount_mult
    let temp = base_fp
        .fixed_mul_floor(amount_mult, SCALAR_7)
        .ok_or(Error::OverflowError)?;

    // Third: temp * time_mult
    let fp = temp
        .fixed_mul_floor(time_mult, SCALAR_7)
        .ok_or(Error::OverflowError)?;

    Ok(fp)
}

// ============================================================================
// Faction Points Management
// ============================================================================

/// Initialize or update faction points for a player in the current epoch
///
/// **NEW ARCHITECTURE:** Snapshots vault balance at epoch start
///
/// This is called when a player starts their first game in an epoch.
/// It calculates their total FP and sets it as available_fp.
///
/// # Arguments
/// * `env` - Contract environment
/// * `player` - Player to initialize FP for
/// * `current_epoch` - Current epoch number
///
/// # Returns
/// Total faction points calculated
pub(crate) fn initialize_epoch_fp(
    env: &Env,
    player: &Address,
    current_epoch: u32,
) -> Result<i128, Error> {
    // Calculate total FP (queries vault internally)
    let total_fp = calculate_faction_points(env, player)?;

    // Get current vault balance for snapshot
    let current_balance = crate::vault::get_vault_balance(env, player);

    // Get or create epoch player data
    let mut epoch_player =
        storage::get_epoch_player(env, current_epoch, player).unwrap_or(EpochPlayer {
            epoch_faction: None,
            epoch_balance_snapshot: current_balance, // Snapshot current balance
            available_fp: 0,
            total_fp_contributed: 0,
        });

    // Set available FP (only if not already set)
    if epoch_player.available_fp == 0 && epoch_player.total_fp_contributed == 0 {
        epoch_player.available_fp = total_fp;
        epoch_player.epoch_balance_snapshot = current_balance; // Update snapshot
    }

    // Save epoch player data
    storage::set_epoch_player(env, current_epoch, player, &epoch_player);

    Ok(total_fp)
}

/// Prepare a player for a game: lock faction + lock FP (single read/write for efficiency)
///
/// Combines faction locking and FP locking into a single storage operation.
/// Returns the updated EpochPlayer for event emission (avoids another read).
///
/// # Arguments
/// * `env` - Contract environment
/// * `player` - Player to prepare
/// * `wager` - Amount of FP to lock for this game
/// * `current_epoch` - Current epoch number
///
/// # Returns
/// Updated EpochPlayer (for event emission without re-reading)
///
/// # Errors
/// * `FactionNotSelected` - If player hasn't selected a faction
/// * `PlayerNotFound` - If player has no epoch data
/// * `InsufficientFactionPoints` - If player doesn't have enough available FP
pub(crate) fn prepare_player_for_game(
    env: &Env,
    player: &Address,
    wager: i128,
    current_epoch: u32,
) -> Result<EpochPlayer, Error> {
    // Get player's selected faction (single read of Player)
    let player_data = storage::get_player(env, player).ok_or(Error::FactionNotSelected)?;
    let selected_faction = player_data.selected_faction;

    // Get epoch player data (single read of EpochPlayer)
    let mut epoch_player =
        storage::get_epoch_player(env, current_epoch, player).ok_or(Error::PlayerNotFound)?;

    // Lock faction if not already locked
    if epoch_player.epoch_faction.is_none() {
        epoch_player.epoch_faction = Some(selected_faction);
    }

    // Check if player has enough available FP
    if epoch_player.available_fp < wager {
        return Err(Error::InsufficientFactionPoints);
    }

    // Subtract FP from available
    epoch_player.available_fp = epoch_player
        .available_fp
        .checked_sub(wager)
        .ok_or(Error::OverflowError)?;

    // Save epoch player data (single write)
    storage::set_epoch_player(env, current_epoch, player, &epoch_player);

    Ok(epoch_player)
}
