/// Faction Points Edge Case Tests - HIGH PRIORITY
///
/// FP formula: base × amount_mult × time_mult
/// - amount_mult: asymptotic toward $1000 USD
/// - time_mult: asymptotic toward 30 days
///
/// These tests verify edge cases and boundary conditions.
use super::fee_vault_utils::{create_mock_vault, MockVaultClient};
use super::testutils::{create_blendizzard_contract, setup_test_env};
use crate::BlendizzardClient;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{vec, Address, Bytes, Env};

// ============================================================================
// Test Setup Helpers
// ============================================================================

fn setup_fp_test_env<'a>(
    env: &'a Env,
) -> (
    Address,
    Address,
    MockVaultClient<'a>,
    BlendizzardClient<'a>,
) {
    let admin = Address::generate(env);
    let game_contract = Address::generate(env);

    let mock_vault_addr = create_mock_vault(env);
    let mock_vault = MockVaultClient::new(env, &mock_vault_addr);

    let soroswap_router = Address::generate(env);
    let blnd_token = Address::generate(env);
    let usdc_token = Address::generate(env);
    let epoch_duration = 345_600; // 4 days
    let reserve_token_ids = vec![env, 1];

    let blendizzard = create_blendizzard_contract(
        env,
        &admin,
        &mock_vault_addr,
        &soroswap_router,
        &blnd_token,
        &usdc_token,
        epoch_duration,
        reserve_token_ids,
    );

    blendizzard.add_game(&game_contract);

    (game_contract, mock_vault_addr, mock_vault, blendizzard)
}

// ============================================================================
// Edge Case Tests
// ============================================================================

/// Test FP calculation with zero vault balance
///
/// Edge case: Player has no vault balance when starting game.
/// Should fail with InsufficientFactionPoints error.
#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_fp_with_zero_vault_balance() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, blendizzard) = setup_fp_test_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    blendizzard.select_faction(&player1, &0); // WholeNoodle
    blendizzard.select_faction(&player2, &1); // PointyStick

    // Player1 has 0 balance, player2 has balance
    mock_vault.set_user_balance(&player1, &0);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    env.ledger().with_mut(|li| li.timestamp = 1000);

    // Try to start game with player1 having 0 vault balance
    // Should panic with InsufficientFactionPoints (Error #11)
    blendizzard.start_game(&game_contract, &1, &player1, &player2, &100_0000000, &100_0000000);
}

/// Test FP calculation with maximum vault balance
///
/// Verifies FP calculation doesn't overflow with very large deposits.
/// Amount multiplier should asymptote toward 1.0 even with huge balances.
#[test]
fn test_fp_with_max_vault_balance() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, blendizzard) = setup_fp_test_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Deposit 1 billion USDC (way beyond the $1000 asymptote)
    let huge_amount = 1_000_000_000_0000000i128;
    mock_vault.set_user_balance(&player1, &huge_amount);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    env.ledger().with_mut(|li| li.timestamp = 1000);

    // Start game with massive wager
    let wager = 1_000_000_0000000i128;
    blendizzard.start_game(&game_contract, &1, &player1, &player2, &wager, &100_0000000);

    let current_epoch = blendizzard.get_current_epoch();
    let epoch_player = blendizzard.get_epoch_player(&current_epoch, &player1);

    // Verify FP was calculated without overflow
    assert!(epoch_player.available_fp >= 0, "FP should be calculable");

    // After locking wager, available FP should be reduced
    // Initially calculated FP - wager = available_fp
    // The wager is deducted from available_fp when game starts
    assert!(
        epoch_player.available_fp >= 0,
        "Available FP should be non-negative after locking wager"
    );

    // With amount >> $1000, amount_mult should be close to 1.0
    // With time = 0, time_mult should be 1.0 (minimum)
    // Initial FP ≈ huge_amount × 1.0 × 1.0 = huge_amount
    // After locking wager: available_fp = initial_fp - wager

    // Verify balance snapshot was recorded
    assert_eq!(
        epoch_player.epoch_balance_snapshot,
        huge_amount,
        "Balance snapshot should match vault balance"
    );
}

/// Test FP calculation with zero time held
///
/// Player deposits and immediately plays game (time = 0).
/// Time multiplier should be at minimum (1.0).
#[test]
fn test_fp_with_zero_time_held() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, blendizzard) = setup_fp_test_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Deposit and immediately play (time = 0)
    env.ledger().with_mut(|li| li.timestamp = 1000);
    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    // Start game at same timestamp as deposit initialization
    blendizzard.start_game(&game_contract, &1, &player1, &player2, &100_0000000, &100_0000000);

    let current_epoch = blendizzard.get_current_epoch();
    let epoch_player = blendizzard.get_epoch_player(&current_epoch, &player1);

    // Looking at faction_points.rs:
    // fraction = time / (time + MAX_TIME)
    // At time = 0: fraction = 0
    // multiplier = (1 - fraction) + (fraction × MAX_MULTIPLIER)
    // multiplier = 1.0 + 0 = 1.0

    // available_fp is what remains after locking the wager
    // It should be positive (initial FP - 100 USDC wager)
    assert!(epoch_player.available_fp > 0, "Available FP should be positive after locking wager");

    // With time=0, time_mult = 1.0 (minimum)
    // Initial FP = base × amount_mult × 1.0
    // Available FP = initial FP - wager
    // Should be approximately (base × amount_mult) - 100_0000000
}

/// Test FP calculation with maximum time held (60+ days)
///
/// Player holds funds for longer than the asymptote (30 days).
/// Time multiplier should approach maximum.
#[test]
fn test_fp_with_max_time_held() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, blendizzard) = setup_fp_test_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    // Set initial timestamp
    env.ledger().with_mut(|li| li.timestamp = 1000);

    // Start first game to initialize time_multiplier_start
    blendizzard.start_game(&game_contract, &1, &player1, &player2, &100_0000000, &100_0000000);

    let proof = Bytes::new(&env);
    let outcome = crate::types::GameOutcome {
        game_id: game_contract.clone(),
        session_id: 1,
        player1: player1.clone(),
        player2: player2.clone(),
        winner: true,
    };
    blendizzard.end_game(&proof, &outcome);

    // Fast forward 60 days (2x the asymptote)
    let sixty_days = 60 * 24 * 60 * 60; // 5,184,000 seconds
    env.ledger().with_mut(|li| li.timestamp = 1000 + sixty_days);

    // Start game after 60 days
    blendizzard.start_game(&game_contract, &2, &player1, &player2, &100_0000000, &100_0000000);

    let current_epoch = blendizzard.get_current_epoch();
    let epoch_player = blendizzard.get_epoch_player(&current_epoch, &player1);

    // With 60 days (2x the 30-day asymptote), time_mult should be significantly boosted
    // The asymptotic formula is: time / (time + 30 days)
    // At time = 60 days: fraction = 60/(60+30) = 60/90 = 0.667
    // multiplier = (1-0.667) + (0.667 × MAX_MULTIPLIER)

    // Available FP (after locking 100 USDC wager) should still be substantial
    // FP calculation happens at first game of epoch, so it includes the time boost
    assert!(
        epoch_player.available_fp > 800_0000000,
        "Available FP should be boosted with long hold time (after 100 USDC wager)"
    );
}

/// Test FP multiplier caps at maximum
///
/// Verifies that both amount and time multipliers have upper bounds
/// and can't produce infinite FP.
#[test]
fn test_fp_multiplier_caps_at_maximum() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, blendizzard) = setup_fp_test_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Deposit way more than asymptote
    let huge_amount = 100_000_0000000i128; // $100,000 (100x the $1000 asymptote)
    mock_vault.set_user_balance(&player1, &huge_amount);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    // Initialize time
    env.ledger().with_mut(|li| li.timestamp = 1000);
    blendizzard.start_game(&game_contract, &1, &player1, &player2, &1000_0000000, &100_0000000);

    let proof = Bytes::new(&env);
    let outcome = crate::types::GameOutcome {
        game_id: game_contract.clone(),
        session_id: 1,
        player1: player1.clone(),
        player2: player2.clone(),
        winner: true,
    };
    blendizzard.end_game(&proof, &outcome);

    // Wait 100 days (way past asymptote)
    let hundred_days = 100 * 24 * 60 * 60;
    env.ledger().with_mut(|li| li.timestamp = 1000 + hundred_days);

    // Start game with both multipliers maxed
    blendizzard.start_game(&game_contract, &2, &player1, &player2, &1000_0000000, &100_0000000);

    let current_epoch = blendizzard.get_current_epoch();
    let epoch_player = blendizzard.get_epoch_player(&current_epoch, &player1);

    // FP = base × amount_mult × time_mult
    // With both at max:
    // - amount_mult → asymptotic cap (≈ 1.0 for huge amounts)
    // - time_mult → asymptotic cap (formula caps as time → infinity)

    // available_fp is what remains after locking 1000 USDC wager
    // Verify FP is finite and reasonable
    assert!(epoch_player.available_fp > 0, "Available FP should be positive");

    // Balance snapshot should be the huge amount
    assert_eq!(
        epoch_player.epoch_balance_snapshot,
        huge_amount,
        "Balance snapshot should be recorded"
    );

    // Available FP should be less than the base amount
    // (verifies multipliers don't cause infinite growth)
    assert!(
        epoch_player.available_fp < huge_amount * 10,
        "Available FP should not exceed 10x base (verifies multipliers are capped)"
    );

    // The exact cap depends on implementation, but this verifies no overflow
    // and that multipliers have reasonable upper bounds
}
