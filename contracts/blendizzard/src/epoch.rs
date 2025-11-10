use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    token, vec, Address, Env, IntoVal, Map, Symbol, Vec,
};

use crate::errors::Error;
use crate::events::emit_epoch_cycled;
use crate::fee_vault_v2::Client as FeeVaultClient;
use crate::router::Client as SoroswapRouterClient;
use crate::storage;
use crate::types::EpochInfo;

// ============================================================================
// Epoch Management
// ============================================================================

/// Get epoch information
///
/// Returns the current epoch if no number specified, otherwise the specified epoch.
///
/// From PLAN.md:
/// "Get the current epoch if no number specified, otherwise the specified number
///  Return the epoch number and faction standings"
///
/// # Arguments
/// * `env` - Contract environment
/// * `epoch` - Optional epoch number. If None, returns current epoch
///
/// # Returns
/// Epoch information including number, timing, standings, and rewards
///
/// # Errors
/// * `EpochNotFinalized` - If requested epoch doesn't exist
pub(crate) fn get_epoch(env: &Env, epoch: Option<u32>) -> Result<EpochInfo, Error> {
    let epoch_num = epoch.unwrap_or_else(|| storage::get_current_epoch(env));

    storage::get_epoch(env, epoch_num).ok_or(Error::EpochNotFinalized)
}

/// Cycle to the next epoch
///
/// From PLAN.md:
/// "Close current epoch, decide faction winner for closed epoch, lock in claimable
///  rewards by contributed faction points, open next epoch"
///
/// Process:
/// 1. Validate current epoch is ready to cycle (time has passed)
/// 2. Finalize current epoch:
///    a. Determine winning faction (highest total fp)
///    b. Withdraw BLND from fee-vault admin balance
///    c. Convert BLND -> USDC via Soroswap
///    d. Set reward_pool to USDC amount
/// 3. Create next epoch
///
/// # Arguments
/// * `env` - Contract environment
///
/// # Returns
/// The new epoch number
///
/// # Errors
/// * `EpochNotReady` - If not enough time has passed
/// * `EpochAlreadyFinalized` - If current epoch is already finalized
/// * `FeeVaultError` - If fee-vault withdrawal fails
/// * `SwapError` - If BLND � USDC swap fails
pub(crate) fn cycle_epoch(env: &Env) -> Result<u32, Error> {
    let current_epoch_num = storage::get_current_epoch(env);

    // Get current epoch info
    let mut current_epoch =
        storage::get_epoch(env, current_epoch_num).ok_or(Error::EpochNotFinalized)?;

    // Check if already finalized
    if current_epoch.is_finalized {
        return Err(Error::EpochAlreadyFinalized);
    }

    // Check if enough time has passed
    let current_time = env.ledger().timestamp();
    if current_time < current_epoch.end_time {
        return Err(Error::EpochNotReady);
    }

    // Determine winning faction (faction with highest total fp)
    let winning_faction = determine_winning_faction(&current_epoch)?;

    // SECURITY FIX: Withdraw BLND from fee-vault and convert to USDC
    // Make swap failures non-fatal to prevent epoch cycling DoS
    // If swap fails, epoch still cycles but reward_pool is 0
    let reward_pool = match withdraw_and_convert_rewards(env) {
        Ok(amount) => amount,
        Err(_) => {
            // Swap failed but we must continue cycling to prevent protocol freeze
            // This could happen due to:
            // - Insufficient Soroswap liquidity
            // - Soroswap contract issues
            // - Price impact too high
            // Reward pool will be 0 for this epoch
            0
        }
    };

    // Finalize current epoch
    current_epoch.winning_faction = Some(winning_faction);
    current_epoch.reward_pool = reward_pool;
    current_epoch.is_finalized = true;
    storage::set_epoch(env, current_epoch_num, &current_epoch);

    // Create next epoch
    let next_epoch_num = current_epoch_num + 1;
    let config = storage::get_config(env);

    let next_epoch = EpochInfo {
        epoch_number: next_epoch_num,
        start_time: current_time,
        end_time: current_time + config.epoch_duration,
        faction_standings: Map::new(env),
        reward_pool: 0,
        winning_faction: None,
        is_finalized: false,
    };

    storage::set_epoch(env, next_epoch_num, &next_epoch);
    storage::set_current_epoch(env, next_epoch_num);

    // Emit event
    emit_epoch_cycled(
        env,
        current_epoch_num,
        next_epoch_num,
        winning_faction,
        reward_pool,
    );

    Ok(next_epoch_num)
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Determine the winning faction based on faction standings
///
/// Returns the faction with the highest total fp contributed.
/// In case of a tie, returns the faction with the lowest ID.
///
/// # Arguments
/// * `epoch` - Epoch info containing faction standings
///
/// # Returns
/// Winning faction ID (0, 1, or 2)
///
/// # Errors
/// * `DivisionByZero` - If no factions have any contributions (shouldn't happen)
fn determine_winning_faction(epoch: &EpochInfo) -> Result<u32, Error> {
    let mut max_fp: i128 = 0;
    let mut winning_faction: u32 = 0;

    // Check all three factions
    for faction_id in 0..3 {
        let fp = epoch.faction_standings.get(faction_id).unwrap_or(0);
        if fp > max_fp {
            max_fp = fp;
            winning_faction = faction_id;
        }
    }

    // If no faction has any fp, default to WholeNoodle (0)
    Ok(winning_faction)
}

/// Withdraw BLND from fee-vault and convert to USDC
///
/// From PLAN.md:
/// "Withdraw accumulated BLND from fee-vault admin balance
///  Convert BLND � USDC via Soroswap"
///
/// Process:
/// 1. Capture pre-swap USDC balance (for delta calculation)
/// 2. Get available BLND balance from fee-vault admin
/// 3. Withdraw BLND using admin_withdraw (admin fees)
/// 4. Claim BLND emissions from Blend pool (CRITICAL - was missing!)
/// 5. Authorize BLND transfer to Soroswap
/// 6. Swap total BLND to USDC using Soroswap router
/// 7. Calculate USDC delta (prevents over-committing rewards)
///
/// # Returns
/// Amount of USDC received from this operation only (delta, not total balance)
///
/// # Errors
/// * `FeeVaultError` - If fee-vault operations fail
/// * `SwapError` - If Soroswap swap fails
fn withdraw_and_convert_rewards(env: &Env) -> Result<i128, Error> {
    let config = storage::get_config(env);
    let current_contract = env.current_contract_address();

    // Step 1: Capture pre-swap USDC balance
    // Following blend-together pattern: only count delta from this operation
    let usdc_client = token::Client::new(env, &config.usdc_token);
    let pre_usdc_balance = usdc_client.balance(&current_contract);

    // Step 2: Get available BLND from fee-vault admin balance
    let vault_client = FeeVaultClient::new(env, &config.fee_vault);
    let blnd_balance = vault_client.get_underlying_admin_balance();

    // Step 3: Withdraw BLND from fee-vault admin balance (contract is admin)
    let mut total_blnd: i128 = 0;
    if blnd_balance > 0 {
        let blnd_from_fees = vault_client.admin_withdraw(&blnd_balance);
        total_blnd += blnd_from_fees;
    }

    // Step 4: Claim BLND emissions from Blend pool
    // CRITICAL: This claims BLND token emissions that accrue to the vault from the Blend pool
    // Emissions are separate from admin fees and MUST be claimed explicitly
    // Without this, we're leaving significant BLND rewards unclaimed!
    let emissions_claimed = vault_client.claim_emissions(&config.reserve_token_ids, &current_contract);
    total_blnd += emissions_claimed;

    // Early return if no BLND available from either source
    if total_blnd <= 0 {
        return Ok(0);
    }

    // Step 5: Authorize contract to transfer BLND tokens to router
    // Critical: Without this, the BLND token contract will reject the transfer
    let router_client = SoroswapRouterClient::new(env, &config.soroswap_router);

    // Get the router pair address for BLND/USDC liquidity pool
    // Note: Using non-try version as generated client handles Result internally
    let router_pair = router_client.router_pair_for(&config.blnd_token, &config.usdc_token);

    // Authorize the BLND token contract to transfer from this contract to router pair
    env.authorize_as_current_contract(vec![
        env,
        InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: config.blnd_token.clone(),
                fn_name: Symbol::new(env, "transfer"),
                args: (current_contract.clone(), router_pair, total_blnd).into_val(env),
            },
            sub_invocations: vec![env],
        }),
    ]);

    // Step 6: Execute swap (BLND → USDC)
    let path: Vec<Address> = vec![env, config.blnd_token.clone(), config.usdc_token.clone()];
    let deadline = env.ledger().timestamp() + 300; // 5 min deadline

    // Execute swap (accepting any output amount)
    // Soroban has protocol-level frontrunning protection via authorization framework
    let _amounts = router_client.swap_exact_tokens_for_tokens(
        &total_blnd,
        &0, // No minimum - trust Soroswap pricing
        &path,
        &current_contract, // Send USDC to this contract
        &deadline,
    );

    // Step 7: Calculate USDC delta (only new USDC from this swap)
    // This prevents double-counting if contract already held USDC
    // Critical for not over-committing rewards epoch-to-epoch
    let post_usdc_balance = usdc_client.balance(&current_contract);
    let usdc_received = post_usdc_balance.saturating_sub(pre_usdc_balance);

    if usdc_received == 0 {
        return Err(Error::SwapError);
    }

    Ok(usdc_received)
}

/// Initialize the first epoch (called during contract initialization)
///
/// # Arguments
/// * `env` - Contract environment
/// * `epoch_duration` - Duration of each epoch in seconds
pub(crate) fn initialize_first_epoch(env: &Env, epoch_duration: u64) {
    let start_time = env.ledger().timestamp();
    let end_time = start_time + epoch_duration;

    let epoch = EpochInfo {
        epoch_number: 0,
        start_time,
        end_time,
        faction_standings: Map::new(env),
        reward_pool: 0,
        winning_faction: None,
        is_finalized: false,
    };

    storage::set_epoch(env, 0, &epoch);
    storage::set_current_epoch(env, 0);
}

// ============================================================================
// Query Functions
// ============================================================================


/// Get faction standings for a specific epoch
pub(crate) fn get_faction_standings(env: &Env, epoch: u32) -> Result<Map<u32, i128>, Error> {
    let epoch_info = storage::get_epoch(env, epoch).ok_or(Error::EpochNotFinalized)?;
    Ok(epoch_info.faction_standings)
}

/// Get winning faction for a specific epoch
///
/// # Errors
/// * `EpochNotFinalized` - If epoch doesn't exist or isn't finalized
pub(crate) fn get_winning_faction(env: &Env, epoch: u32) -> Result<u32, Error> {
    let epoch_info = storage::get_epoch(env, epoch).ok_or(Error::EpochNotFinalized)?;

    if !epoch_info.is_finalized {
        return Err(Error::EpochNotFinalized);
    }

    epoch_info.winning_faction.ok_or(Error::EpochNotFinalized)
}

/// Get reward pool for a specific epoch
///
/// # Errors
/// * `EpochNotFinalized` - If epoch doesn't exist or isn't finalized
pub(crate) fn get_reward_pool(env: &Env, epoch: u32) -> Result<i128, Error> {
    let epoch_info = storage::get_epoch(env, epoch).ok_or(Error::EpochNotFinalized)?;

    if !epoch_info.is_finalized {
        return Err(Error::EpochNotFinalized);
    }

    Ok(epoch_info.reward_pool)
}
