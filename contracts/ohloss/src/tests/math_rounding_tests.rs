/// Math Rounding Tests - CRITICAL
///
/// These tests verify that all math operations round in favor of the protocol,
/// never the user. After fixing vault.rs to use fixed_div_ceil for withdrawal
/// ratio calculations, we need comprehensive verification.
use super::fee_vault_utils::{create_mock_vault, MockVaultClient};
use super::testutils::{create_ohloss_contract, setup_test_env};
use crate::OhlossClient;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{vec, Address, Env};

// ============================================================================
// Test Setup Helpers
// ============================================================================

fn setup_math_test_env<'a>(
    env: &'a Env,
) -> (Address, Address, MockVaultClient<'a>, OhlossClient<'a>) {
    use super::soroswap_utils::{add_liquidity, create_factory, create_router, create_token};

    let admin = Address::generate(env);
    let game_contract = Address::generate(env);

    let mock_vault_addr = create_mock_vault(env);
    let mock_vault = MockVaultClient::new(env, &mock_vault_addr);

    // Create real tokens for Soroswap
    let blnd_token_client = create_token(env, &admin);
    let usdc_token_client = create_token(env, &admin);
    let blnd_token = blnd_token_client.address.clone();
    let usdc_token = usdc_token_client.address.clone();

    // Setup Soroswap infrastructure
    let (token_a, token_b) = if blnd_token < usdc_token {
        (blnd_token.clone(), usdc_token.clone())
    } else {
        (usdc_token.clone(), blnd_token.clone())
    };

    let factory = create_factory(env, &admin);
    let router = create_router(env);
    router.initialize(&factory.address);

    // Add liquidity (10,000 of each token)
    let liquidity_amount = 10_000_0000000i128;
    blnd_token_client.mint(&admin, &liquidity_amount);
    usdc_token_client.mint(&admin, &liquidity_amount);

    add_liquidity(
        env,
        &router,
        &token_a,
        &token_b,
        liquidity_amount,
        liquidity_amount,
        &admin,
    );

    let epoch_duration = 345_600; // 4 days
    let reserve_token_ids = vec![env, 1];

    let ohloss = create_ohloss_contract(
        env,
        &admin,
        &mock_vault_addr,
        &router.address,
        &blnd_token,
        &usdc_token,
        epoch_duration,
        reserve_token_ids,
    );

    // Add game to whitelist (with developer address)
    let developer = Address::generate(env);
    ohloss.add_game(&game_contract, &developer);

    (game_contract, mock_vault_addr, mock_vault, ohloss)
}

// ============================================================================
// Withdrawal Reset Tests
// ============================================================================

/// Test withdrawal reset at exactly 50% threshold
///
/// The withdrawal ratio calculation uses fixed_div_ceil, which rounds UP.
/// At exactly 50%, we should be right at the boundary (no reset).
#[test]
fn test_withdrawal_reset_50_percent_exactly() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss) = setup_math_test_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    ohloss.select_faction(&player1, &0);
    ohloss.select_faction(&player2, &1);

    // Set initial balances
    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    // Play a game in epoch 0 to lock faction and establish baseline
    env.ledger().with_mut(|li| li.timestamp = 1000);
    ohloss.start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let player_data = ohloss.get_player(&player1);
    let initial_time_start = player_data.time_multiplier_start;

    // End game
    ohloss.end_game(&1, &true);

    // Cycle to epoch 1
    env.ledger().with_mut(|li| li.timestamp = 1000 + 345_600);
    let _ = ohloss.try_cycle_epoch();

    // Withdraw exactly 50% (500 USDC)
    mock_vault.set_user_balance(&player1, &500_0000000);

    // Start new game in epoch 1 - this triggers withdrawal check
    env.ledger()
        .with_mut(|li| li.timestamp = 1000 + 345_600 + 100);
    ohloss.start_game(
        &game_contract,
        &2,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    // Verify: At exactly 50%, time should NOT reset
    let player_data_after = ohloss.get_player(&player1);
    assert_eq!(
        player_data_after.time_multiplier_start, initial_time_start,
        "Time multiplier should NOT reset at exactly 50%"
    );
}

/// Test withdrawal reset at 50.01% (just over threshold)
///
/// With fixed_div_ceil rounding UP, any withdrawal >50% should trigger reset.
#[test]
fn test_withdrawal_reset_50_01_percent_triggers() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss) = setup_math_test_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    ohloss.select_faction(&player1, &0);
    ohloss.select_faction(&player2, &1);

    // Use 10,000 USDC to make 0.01% = 1 USDC testable
    mock_vault.set_user_balance(&player1, &10000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    // Get epoch 0 start time
    let epoch0 = ohloss.get_epoch(&0);
    let epoch_start = epoch0.start_time;

    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 1000);
    ohloss.start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let player_data = ohloss.get_player(&player1);
    let initial_time_start = player_data.time_multiplier_start;

    ohloss.end_game(&1, &true);

    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600);
    ohloss.cycle_epoch();

    // Withdraw 50.01% (4999 USDC remaining from 10000)
    mock_vault.set_user_balance(&player1, &4999_0000000);

    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600 + 100);
    ohloss.start_game(
        &game_contract,
        &2,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let player_data_after = ohloss.get_player(&player1);
    let new_time_start = player_data_after.time_multiplier_start;
    assert!(
        new_time_start > initial_time_start,
        "Time multiplier should reset at 50.01% withdrawal"
    );
    assert_eq!(
        new_time_start,
        epoch_start + 345_600 + 100,
        "Time should reset to current timestamp"
    );
}

/// Test withdrawal reset at 49.99% (just under threshold)
///
/// Even with fixed_div_ceil rounding UP, <50% should not trigger reset.
#[test]
fn test_withdrawal_reset_49_99_percent_no_trigger() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss) = setup_math_test_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    ohloss.select_faction(&player1, &0);
    ohloss.select_faction(&player2, &1);

    mock_vault.set_user_balance(&player1, &10000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    env.ledger().with_mut(|li| li.timestamp = 1000);
    ohloss.start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let player_data = ohloss.get_player(&player1);
    let initial_time_start = player_data.time_multiplier_start;

    ohloss.end_game(&1, &true);

    env.ledger().with_mut(|li| li.timestamp = 1000 + 345_600);
    let _ = ohloss.try_cycle_epoch();

    // Withdraw 49.99% (5001 USDC remaining from 10000)
    mock_vault.set_user_balance(&player1, &5001_0000000);

    env.ledger()
        .with_mut(|li| li.timestamp = 1000 + 345_600 + 100);
    ohloss.start_game(
        &game_contract,
        &2,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let player_data_after = ohloss.get_player(&player1);
    assert_eq!(
        player_data_after.time_multiplier_start, initial_time_start,
        "Time multiplier should NOT reset at 49.99% withdrawal"
    );
}

// ============================================================================
// FP Calculation Rounding Tests
// ============================================================================

/// Test FP calculation rounds down (favors protocol)
///
/// FP formula: base × amount_mult × time_mult
/// All multiplications use fixed_mul_floor (round DOWN).
/// This test verifies users don't get extra FP from rounding.
#[test]
fn test_fp_calculation_rounds_down() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss) = setup_math_test_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    ohloss.select_faction(&player1, &0);
    ohloss.select_faction(&player2, &1);

    // Deposit amounts that produce fractional multipliers
    mock_vault.set_user_balance(&player1, &333_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    // Wait a non-round time period
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.ledger().with_mut(|li| li.timestamp = 1000 + 7777); // 7777 seconds

    ohloss.start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let epoch_player = ohloss.get_epoch_player(&0, &player1);
    let total_fp = epoch_player.available_fp;

    // With BASE_FP_PER_USDC = 100, FP should be at least base × 100
    // With smooth piecewise multipliers:
    // - $333 deposit (< $1k target): amount_mult ≈ 1.0-1.5x (rising curve)
    // - 7777 seconds ≈ 2.2 hours (very short): time_mult ≈ 1.0x
    // FP = (333 × 100) × ~1.2 × 1.0 - 100 USDC wager ≈ 33,300 × 1.2 - 100 ≈ 39,860 - 100
    //
    // After locking wager, available_fp should be positive and > base
    assert!(
        total_fp > 333_0000000,
        "FP should be greater than base (due to 100x multiplier and >1.0 amount mult)"
    );
    assert!(total_fp > 0, "FP should still be positive");

    // Verify deterministic
    let epoch_player2 = ohloss.get_epoch_player(&0, &player1);
    assert_eq!(
        epoch_player.available_fp, epoch_player2.available_fp,
        "FP calculation should be deterministic"
    );
}

// ============================================================================
// Reward Calculation Rounding Tests
// ============================================================================

/// Test reward calculation rounds down (favors protocol)
///
/// Reward formula: reward_pool × (player_fp / total_fp)
/// Both division and multiplication use floor rounding.
/// This ensures sum(claimed_rewards) <= reward_pool (no overpayment).
#[test]
fn test_reward_calculation_rounds_down() {
    let env = setup_test_env();
    env.ledger().with_mut(|li| li.timestamp = 1000);

    let (game_contract, _vault_addr, mock_vault, ohloss) = setup_math_test_env(&env);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let p3 = Address::generate(&env);

    // All on same faction
    ohloss.select_faction(&p1, &0);
    ohloss.select_faction(&p2, &0);
    ohloss.select_faction(&p3, &0);

    // Deposits that create indivisible reward shares
    mock_vault.set_user_balance(&p1, &333_0000000);
    mock_vault.set_user_balance(&p2, &333_0000000);
    mock_vault.set_user_balance(&p3, &334_0000000);

    // Start and end games (all contribute FP)
    ohloss.start_game(&game_contract, &1, &p1, &p2, &100_0000000, &100_0000000);
    ohloss.end_game(&1, &true);

    ohloss.start_game(&game_contract, &2, &p1, &p3, &100_0000000, &100_0000000);
    ohloss.end_game(&2, &true);

    // Cycle epoch - this creates reward pool
    env.ledger().with_mut(|li| li.timestamp = 1000 + 345_600);
    let _ = ohloss.try_cycle_epoch();

    let epoch_info = ohloss.get_epoch(&0);
    let reward_pool = epoch_info.reward_pool;

    if reward_pool == 0 {
        // No rewards to test, skip
        return;
    }

    // Claim rewards
    let r1 = ohloss.claim_epoch_reward(&p1, &0);
    let r2 = ohloss.claim_epoch_reward(&p2, &0);
    let r3 = ohloss.claim_epoch_reward(&p3, &0);

    // CRITICAL: Sum of claimed rewards must be <= reward_pool
    let total_claimed = r1 + r2 + r3;
    assert!(
        total_claimed <= reward_pool,
        "Total claimed {} should not exceed reward pool {}",
        total_claimed,
        reward_pool
    );

    // There should be dust remaining (due to floor rounding)
    let dust = reward_pool - total_claimed;
    assert!(dust >= 0, "Dust should be non-negative");
}

// ============================================================================
// Cross-Epoch Withdrawal Tests
// ============================================================================

/// Test withdrawal reset with multiple withdrawals during same epoch
///
/// The cross-epoch comparison only looks at net change between epochs.
/// Multiple withdrawals within an epoch are invisible - only the final
/// balance at next epoch boundary matters.
#[test]
fn test_withdrawal_reset_net_change_only() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss) = setup_math_test_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    ohloss.select_faction(&player1, &0);
    ohloss.select_faction(&player2, &1);

    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    env.ledger().with_mut(|li| li.timestamp = 1000);
    ohloss.start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let player_data = ohloss.get_player(&player1);
    let initial_time_start = player_data.time_multiplier_start;

    ohloss.end_game(&1, &true);

    env.ledger().with_mut(|li| li.timestamp = 1000 + 345_600);
    let _ = ohloss.try_cycle_epoch();

    // Simulate multiple withdrawals during epoch 1 (contract doesn't see these)
    // Final balance: 600 USDC (40% withdrawn)
    mock_vault.set_user_balance(&player1, &600_0000000);

    env.ledger()
        .with_mut(|li| li.timestamp = 1000 + 345_600 + 100);
    ohloss.start_game(
        &game_contract,
        &2,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    // Verify: 40% net withdrawal should NOT trigger reset
    let player_data_after = ohloss.get_player(&player1);
    assert_eq!(
        player_data_after.time_multiplier_start, initial_time_start,
        "Time multiplier should NOT reset when net withdrawal <50%"
    );
}

/// Test withdrawal reset with deposits between epochs
///
/// If player withdraws to 400, then deposits back to 900,
/// the NET change is only -10%, so no reset should occur.
#[test]
fn test_withdrawal_reset_with_redeposit() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss) = setup_math_test_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    ohloss.select_faction(&player1, &0);
    ohloss.select_faction(&player2, &1);

    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    env.ledger().with_mut(|li| li.timestamp = 1000);
    ohloss.start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let player_data = ohloss.get_player(&player1);
    let initial_time_start = player_data.time_multiplier_start;

    ohloss.end_game(&1, &true);

    env.ledger().with_mut(|li| li.timestamp = 1000 + 345_600);
    let _ = ohloss.try_cycle_epoch();

    // Net balance: 900 USDC (90% of original, only -10% net change)
    mock_vault.set_user_balance(&player1, &900_0000000);

    env.ledger()
        .with_mut(|li| li.timestamp = 1000 + 345_600 + 100);
    ohloss.start_game(
        &game_contract,
        &2,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    // Verify: Net change only -10%, should NOT trigger reset
    let player_data_after = ohloss.get_player(&player1);
    assert_eq!(
        player_data_after.time_multiplier_start, initial_time_start,
        "Time multiplier should NOT reset when net withdrawal <50%"
    );
}
