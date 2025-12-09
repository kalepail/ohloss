use soroban_fixed_point_math::FixedPoint;
use soroban_sdk::{Address, Env};

use crate::errors::Error;
use crate::events::emit_rewards_claimed;
use crate::fee_vault_v2::Client as FeeVaultClient;
use crate::storage;
use crate::types::SCALAR_7;

// ============================================================================
// Reward Distribution
// ============================================================================

/// Claim epoch reward for a player for a specific epoch
///
/// Players who contributed FP to the winning faction can claim their share
/// of the epoch's reward pool (USDC converted from BLND yield).
///
/// **Free Play Gate:** Players must have a minimum vault deposit to claim rewards.
/// This is an anti-sybil mechanism that prevents farming with free accounts.
/// Free players can participate and contribute to faction standings, but must
/// deposit to unlock their reward share.
///
/// **Important:** The reward is automatically deposited into the fee-vault on behalf
/// of the player, not transferred directly. This means:
/// 1. USDC is transferred from contract → player
/// 2. Vault deposit is called, transferring USDC from player → fee-vault
/// 3. Player receives vault shares representing their deposit
///
/// The player must authorize BOTH actions in their transaction:
/// - Authorization for `blendizzard.claim_epoch_reward()`
/// - Authorization for `fee_vault.deposit()`
///
/// Formula:
/// ```
/// player_reward = (player_fp_contributed / total_winning_faction_fp) * reward_pool
/// ```
///
/// # Arguments
/// * `env` - Contract environment
/// * `player` - Player claiming rewards
/// * `epoch` - Epoch number to claim from
///
/// # Returns
/// Amount of USDC claimed and deposited into fee-vault
///
/// # Errors
/// * `DepositRequiredToClaim` - If player's vault balance is below minimum threshold
/// * `EpochNotFinalized` - If epoch doesn't exist or isn't finalized
/// * `RewardAlreadyClaimed` - If player already claimed for this epoch
/// * `NotWinningFaction` - If player wasn't in the winning faction
/// * `NoRewardsAvailable` - If player has no rewards to claim
pub(crate) fn claim_epoch_reward(env: &Env, player: &Address, epoch: u32) -> Result<i128, Error> {
    // Authenticate player
    player.require_auth();

    // Check minimum deposit requirement for claiming (anti-sybil gate)
    let vault_balance = crate::vault::get_vault_balance(env, player);
    let config = storage::get_config(env);

    if vault_balance < config.min_deposit_to_claim {
        return Err(Error::DepositRequiredToClaim);
    }

    // Check if already claimed
    if storage::has_claimed(env, player, epoch) {
        return Err(Error::RewardAlreadyClaimed);
    }

    // Get epoch info
    let epoch_info = storage::get_epoch(env, epoch).ok_or(Error::EpochNotFinalized)?;

    // Check if epoch is finalized
    if !epoch_info.is_finalized {
        return Err(Error::EpochNotFinalized);
    }

    // Get winning faction
    let winning_faction = epoch_info.winning_faction.ok_or(Error::EpochNotFinalized)?;

    // Get player's epoch data
    let epoch_player =
        storage::get_epoch_player(env, epoch, player).ok_or(Error::NoRewardsAvailable)?;

    // Check if player was in winning faction
    let player_faction = epoch_player
        .epoch_faction
        .ok_or(Error::NoRewardsAvailable)?;

    if player_faction != winning_faction {
        return Err(Error::NotWinningFaction);
    }

    // Get player's fp contribution
    let player_fp_contributed = epoch_player.total_fp_contributed;

    if player_fp_contributed == 0 {
        return Err(Error::NoRewardsAvailable);
    }

    // Get total fp for winning faction
    let total_winning_fp = epoch_info
        .faction_standings
        .get(winning_faction)
        .ok_or(Error::NoRewardsAvailable)?;

    if total_winning_fp == 0 {
        return Err(Error::DivisionByZero);
    }

    // Calculate player's share of rewards
    // Formula: (player_fp / total_fp) * reward_pool
    let reward_amount = calculate_reward_share(
        player_fp_contributed,
        total_winning_fp,
        epoch_info.reward_pool,
    )?;

    if reward_amount == 0 {
        return Err(Error::NoRewardsAvailable);
    }

    // Mark as claimed
    storage::set_claimed(env, player, epoch);

    // Transfer USDC to player, then deposit into fee-vault
    let config = storage::get_config(env);
    let usdc_client = soroban_sdk::token::Client::new(env, &config.usdc_token);

    // Step 1: Transfer USDC from contract to player
    usdc_client.transfer(&env.current_contract_address(), player, &reward_amount);

    // Step 2: Deposit into fee-vault on behalf of player
    // Note: Player must authorize both the claim AND the vault deposit in their transaction
    let vault_client = FeeVaultClient::new(env, &config.fee_vault);
    let _shares_minted = vault_client.deposit(player, &reward_amount);

    // Emit event
    emit_rewards_claimed(env, player, epoch, player_faction, reward_amount);

    Ok(reward_amount)
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Calculate player's share of the reward pool
///
/// Formula: (player_fp_contributed / total_winning_fp) * reward_pool
/// Uses fixed-point math to avoid overflow
///
/// # Arguments
/// * `player_fp` - Player's total fp contributed
/// * `total_fp` - Total fp for winning faction
/// * `reward_pool` - Total USDC available for distribution
///
/// # Returns
/// Player's reward amount in USDC
///
/// # Errors
/// * `OverflowError` - If calculation overflows
/// * `DivisionByZero` - If total_fp is 0
fn calculate_reward_share(
    player_fp: i128,
    total_fp: i128,
    reward_pool: i128,
) -> Result<i128, Error> {
    // Calculate player's share as a fraction: player_fp / total_fp
    let share = player_fp
        .fixed_div_floor(total_fp, SCALAR_7)
        .ok_or(Error::DivisionByZero)?;

    // Calculate reward: share * reward_pool
    let reward = reward_pool
        .fixed_mul_floor(share, SCALAR_7)
        .ok_or(Error::OverflowError)?;

    Ok(reward)
}

// ============================================================================
// Query Functions
// ============================================================================
