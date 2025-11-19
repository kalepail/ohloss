/// Cross-Epoch Balance Tracking Tests - HIGH PRIORITY
///
/// The cross-epoch architecture tracks player balances at epoch boundaries
/// to detect >50% withdrawals and reset time multipliers. These tests verify
/// this core mechanism works correctly.
///
/// Key behaviors:
/// - last_epoch_balance updated on first game of each epoch
/// - >50% net withdrawal triggers deposit_timestamp reset
/// - Deposits don't trigger reset (only withdrawals)
/// - Time multiplier persists across epochs unless reset
use super::fee_vault_utils::{create_mock_vault, MockVaultClient};
use super::testutils::{create_blendizzard_contract, setup_test_env};
use crate::BlendizzardClient;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{vec, Address, Env};

// ============================================================================
// Test Setup Helpers
// ============================================================================

fn setup_cross_epoch_test<'a>(
    env: &'a Env,
) -> (Address, Address, MockVaultClient<'a>, BlendizzardClient<'a>) {
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

    let blendizzard = create_blendizzard_contract(
        env,
        &admin,
        &mock_vault_addr,
        &router.address,
        &blnd_token,
        &usdc_token,
        epoch_duration,
        reserve_token_ids,
    );

    blendizzard.add_game(&game_contract);

    (game_contract, mock_vault_addr, mock_vault, blendizzard)
}

// ============================================================================
// Cross-Epoch Tests
// ============================================================================

/// Test cross-epoch withdrawal detection
///
/// Verifies that withdrawing >50% between epochs is correctly detected
/// and triggers time multiplier reset.
#[test]
fn test_cross_epoch_withdrawal_detection() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, blendizzard) = setup_cross_epoch_test(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Initial balances
    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    // Get epoch 0 start time
    let epoch0 = blendizzard.get_epoch(&0);
    let epoch_start = epoch0.start_time;

    // Play first game in epoch 0 (establishes last_epoch_balance = 1000)
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 1000);
    blendizzard.start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let player_data = blendizzard.get_player(&player1);
    let initial_time_start = player_data.time_multiplier_start;
    assert_eq!(
        player_data.last_epoch_balance, 1000_0000000,
        "last_epoch_balance should be set"
    );

    // Complete game

    blendizzard.end_game(&1, &true);

    // Cycle to epoch 1
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600);
    blendizzard.cycle_epoch();

    // Withdraw 60% (400 USDC remaining from 1000)
    mock_vault.set_user_balance(&player1, &400_0000000);

    // Play first game of epoch 1 - should detect withdrawal and reset
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600 + 100);
    blendizzard.start_game(
        &game_contract,
        &2,
        &player1,
        &player2,
        &50_0000000,
        &50_0000000,
    );

    let player_data_after = blendizzard.get_player(&player1);

    // Verify time multiplier was reset
    assert!(
        player_data_after.time_multiplier_start > initial_time_start,
        "Time multiplier should reset after >50% withdrawal. initial_time_start={}, after={}, last_epoch_balance={}",
        initial_time_start,
        player_data_after.time_multiplier_start,
        player_data_after.last_epoch_balance
    );
    assert_eq!(
        player_data_after.time_multiplier_start,
        epoch_start + 345_600 + 100,
        "Time should reset to first game of new epoch"
    );
}

/// Test that cross-epoch deposits don't trigger reset
///
/// Only withdrawals should trigger time multiplier reset.
/// Deposits between epochs should NOT reset the time multiplier.
#[test]
fn test_cross_epoch_deposit_no_reset() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, blendizzard) = setup_cross_epoch_test(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Initial balance
    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    // Get epoch 0 start time
    let epoch0 = blendizzard.get_epoch(&0);
    let epoch_start = epoch0.start_time;

    // Play first game in epoch 0
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 1000);
    blendizzard.start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let player_data = blendizzard.get_player(&player1);
    let initial_time_start = player_data.time_multiplier_start;

    // Complete game

    blendizzard.end_game(&1, &true);

    // Cycle to epoch 1
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600);
    blendizzard.cycle_epoch();

    // Deposit MORE (3000 USDC total) - net change is positive
    mock_vault.set_user_balance(&player1, &3000_0000000);

    // Play first game of epoch 1
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600 + 100);
    blendizzard.start_game(
        &game_contract,
        &2,
        &player1,
        &player2,
        &50_0000000,
        &50_0000000,
    );

    let player_data_after = blendizzard.get_player(&player1);

    // Verify time multiplier was NOT reset (deposits don't trigger reset)
    assert_eq!(
        player_data_after.time_multiplier_start, initial_time_start,
        "Time multiplier should NOT reset on deposit"
    );
}

/// Test time multiplier persists across epochs (no withdrawal)
///
/// If player doesn't withdraw significantly, time multiplier should
/// continue accumulating across multiple epochs.
#[test]
fn test_time_multiplier_persists_across_epochs() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, blendizzard) = setup_cross_epoch_test(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Deposit
    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    // Get epoch 0 start time
    let epoch0 = blendizzard.get_epoch(&0);
    let epoch_start = epoch0.start_time;

    // Play first game in epoch 0 at timestamp 1000
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 1000);
    blendizzard.start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let player_data = blendizzard.get_player(&player1);
    let time_start = player_data.time_multiplier_start;
    assert_eq!(time_start, epoch_start + 1000);

    // Complete game

    blendizzard.end_game(&1, &true);

    // Cycle to epoch 1 (4 days later)
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600);
    blendizzard.cycle_epoch();

    // Play game in epoch 1 (no withdrawal, so no reset)
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600 + 1000);
    blendizzard.start_game(
        &game_contract,
        &2,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let player_data_epoch1 = blendizzard.get_player(&player1);
    assert_eq!(
        player_data_epoch1.time_multiplier_start, time_start,
        "Time multiplier start should persist into epoch 1"
    );

    // Complete game (session 2)
    blendizzard.end_game(&2, &true);

    // Cycle to epoch 2 (8 days from start)
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 2 * 345_600);
    blendizzard.cycle_epoch();

    // Play game in epoch 2
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 2 * 345_600 + 1000);
    blendizzard.start_game(
        &game_contract,
        &3,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let player_data_epoch2 = blendizzard.get_player(&player1);
    assert_eq!(
        player_data_epoch2.time_multiplier_start, time_start,
        "Time multiplier start should persist into epoch 2"
    );

    // Verify time has been held for 2 epochs (8 days)
    let time_held = (epoch_start + 2 * 345_600 + 1000) - time_start;
    assert_eq!(
        time_held, 691_200,
        "Time held should accumulate across epochs"
    );

    // With 8 days held, time multiplier should be significantly boosted
    // (asymptotic toward 35 days target, but 8 days should give decent boost)
}

/// Test time multiplier reset after large withdrawal
///
/// Comprehensive test: Start with time accumulation, withdraw >50%,
/// verify reset, then accumulate time again.
#[test]
fn test_time_multiplier_reset_after_large_withdrawal() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, blendizzard) = setup_cross_epoch_test(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Deposit
    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    // Get epoch 0 start time
    let epoch0 = blendizzard.get_epoch(&0);
    let epoch_start = epoch0.start_time;

    // === EPOCH 0: Accumulate time ===
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 1000);
    blendizzard.start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    let time_start_epoch0 = blendizzard.get_player(&player1).time_multiplier_start;

    blendizzard.end_game(&1, &true);

    // === EPOCH 1: Continue time accumulation (no withdrawal) ===
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600);
    blendizzard.cycle_epoch();

    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600 + 1000);
    blendizzard.start_game(
        &game_contract,
        &2,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    // Time should still be from epoch 0
    assert_eq!(
        blendizzard.get_player(&player1).time_multiplier_start,
        time_start_epoch0
    );

    blendizzard.end_game(&2, &true);

    // === EPOCH 2: Large withdrawal, triggers reset ===
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 2 * 345_600);
    blendizzard.cycle_epoch();

    // Withdraw 60% (400 USDC remaining from 1000)
    mock_vault.set_user_balance(&player1, &400_0000000);

    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 2 * 345_600 + 5000);
    blendizzard.start_game(
        &game_contract,
        &3,
        &player1,
        &player2,
        &50_0000000,
        &50_0000000,
    );

    let time_start_after_reset = blendizzard.get_player(&player1).time_multiplier_start;

    // Time should have reset to epoch 2
    assert!(time_start_after_reset > time_start_epoch0);
    assert_eq!(time_start_after_reset, epoch_start + 2 * 345_600 + 5000);

    blendizzard.end_game(&3, &true);

    // === EPOCH 3: Verify time accumulation restarts from reset point ===
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 3 * 345_600);
    blendizzard.cycle_epoch();

    // Keep balance same (no reset on stable balance)
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 3 * 345_600 + 10_000);
    blendizzard.start_game(
        &game_contract,
        &4,
        &player1,
        &player2,
        &50_0000000,
        &50_0000000,
    );

    // Time should still be from epoch 2 reset point
    assert_eq!(
        blendizzard.get_player(&player1).time_multiplier_start,
        time_start_after_reset
    );

    // Time held since reset
    let time_since_reset = (epoch_start + 3 * 345_600 + 10_000) - time_start_after_reset;
    assert_eq!(
        time_since_reset,
        345_600 + 5000,
        "Time should accumulate from reset point"
    );
}
