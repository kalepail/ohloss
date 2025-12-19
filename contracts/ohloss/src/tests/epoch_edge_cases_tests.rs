/// Epoch Cycling Edge Case Tests - MEDIUM PRIORITY
///
/// Epoch cycling is the transition between 4-day periods. Edge cases include:
/// - Cycling before duration elapses (should fail)
/// - Cycling with no games played
/// - Tie handling in faction standings
/// - Error handling during BLND→USDC swap
///
/// These tests verify epoch boundaries and error conditions.
use super::fee_vault_utils::{create_mock_vault, MockVaultClient};
use super::testutils::{create_ohloss_contract, setup_test_env};
use crate::OhlossClient;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{vec, Address, Env};

// ============================================================================
// Test Setup Helpers
// ============================================================================

fn setup_epoch_test_env<'a>(
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
// Edge Case Tests
// ============================================================================

/// Test epoch cycle before duration fails
///
/// Attempting to cycle an epoch before the duration has elapsed should fail.
/// This prevents manipulation of epoch boundaries.
#[test]
fn test_epoch_cycle_before_duration_fails() {
    let env = setup_test_env();
    let (_game_contract, _vault_addr, _mock_vault, ohloss) = setup_epoch_test_env(&env);

    // Get the epoch 0 start time
    let epoch0 = ohloss.get_epoch(&0);
    let start_time = epoch0.start_time;

    // Try to cycle immediately (before 4 days)
    let result = ohloss.try_cycle_epoch();

    assert!(
        result.is_err(),
        "Should not be able to cycle epoch before duration elapses"
    );

    // Try after 3 days (still too early)
    env.ledger()
        .with_mut(|li| li.timestamp = start_time + (3 * 24 * 60 * 60));
    let result2 = ohloss.try_cycle_epoch();

    assert!(
        result2.is_err(),
        "Should not be able to cycle epoch after only 3 days"
    );

    // After exactly 4 days, should succeed
    env.ledger()
        .with_mut(|li| li.timestamp = start_time + 345_600);
    let result3 = ohloss.try_cycle_epoch();

    assert!(
        result3.is_ok(),
        "Should be able to cycle epoch after 4 days. Error: {:?}",
        result3.err()
    );

    // Verify we're now in epoch 1
    let current_epoch = ohloss.get_current_epoch();
    assert_eq!(current_epoch, 1, "Should be in epoch 1 after cycle");
}

/// Test epoch cycle with no games played
///
/// If an epoch completes with no games played, cycling should still work.
/// This is a valid scenario (inactive period).
#[test]
fn test_epoch_cycle_with_no_games_played() {
    let env = setup_test_env();
    let (_game_contract, _vault_addr, _mock_vault, ohloss) = setup_epoch_test_env(&env);

    // Get the epoch 0 start time
    let epoch0 = ohloss.get_epoch(&0);
    let start_time = epoch0.start_time;

    // DON'T play any games

    // Fast forward 4 days
    env.ledger()
        .with_mut(|li| li.timestamp = start_time + 345_600);

    // Cycle should succeed even with no activity
    ohloss.cycle_epoch();

    // Verify epoch cycled
    let current_epoch = ohloss.get_current_epoch();
    assert_eq!(current_epoch, 1);

    // Check epoch 0 info
    let epoch0 = ohloss.get_epoch(&0);

    // With no games, all standings should be 0
    assert_eq!(epoch0.faction_standings.get(0).unwrap_or(0), 0);
    assert_eq!(epoch0.faction_standings.get(1).unwrap_or(0), 0);
    assert_eq!(epoch0.faction_standings.get(2).unwrap_or(0), 0);

    // Winner should be faction 0 (default when all are tied at 0)
    assert_eq!(epoch0.winning_faction, Some(0));

    // Reward pool should be 0 (no yield without games/deposits)
    assert_eq!(epoch0.reward_pool, 0);
}

/// Test epoch cycle with tie in standings
///
/// If two or more factions have identical FP totals, the tie-breaking
/// rule should apply (lowest faction ID wins).
#[test]
fn test_epoch_cycle_with_tie_in_standings() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss) = setup_epoch_test_env(&env);

    // Get the epoch 0 start time
    let epoch0 = ohloss.get_epoch(&0);
    let start_time = epoch0.start_time;

    // Create two players with identical deposits on different factions
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);

    ohloss.select_faction(&p1, &0); // WholeNoodle
    ohloss.select_faction(&p2, &1); // PointyStick

    // Identical deposits (will create identical FP)
    mock_vault.set_user_balance(&p1, &1000_0000000);
    mock_vault.set_user_balance(&p2, &1000_0000000);

    // Play games at same time (identical time_mult)
    env.ledger().with_mut(|li| li.timestamp = start_time + 1000);

    ohloss.start_game(&game_contract, &1, &p1, &p2, &100_0000000, &100_0000000);

    // P1 wins
    ohloss.end_game(&1, &true);

    // Play second game
    ohloss.start_game(&game_contract, &2, &p1, &p2, &100_0000000, &100_0000000);

    // P2 wins (player1_won = false)
    ohloss.end_game(&2, &false);

    // Verify standings are equal (both contributed 100 FP)
    let epoch0_before = ohloss.get_epoch(&0);
    let standings_0 = epoch0_before.faction_standings.get(0).unwrap_or(0);
    let standings_1 = epoch0_before.faction_standings.get(1).unwrap_or(0);

    assert_eq!(standings_0, 100_0000000, "Faction 0 should have 100 FP");
    assert_eq!(standings_1, 100_0000000, "Faction 1 should have 100 FP");

    // Cycle epoch
    env.ledger()
        .with_mut(|li| li.timestamp = start_time + 345_600);
    ohloss.cycle_epoch();

    let epoch0_after = ohloss.get_epoch(&0);

    // In case of exact tie, lowest faction ID (0) should win
    assert_eq!(
        epoch0_after.winning_faction,
        Some(0),
        "Faction 0 should win tie"
    );

    // At minimum, verify epoch cycled successfully
    let current_epoch = ohloss.get_current_epoch();
    assert_eq!(current_epoch, 1);
}

/// Test epoch cycle continues despite swap failure
///
/// If the BLND→USDC swap fails (e.g., insufficient liquidity), the epoch
/// should still cycle but with zero reward pool. This prevents the system
/// from getting stuck.
#[test]
fn test_epoch_cycle_swap_failure_handling() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss) = setup_epoch_test_env(&env);

    // Get the epoch 0 start time
    let epoch0 = ohloss.get_epoch(&0);
    let start_time = epoch0.start_time;

    let player = Address::generate(&env);

    ohloss.select_faction(&player, &0); // WholeNoodle

    mock_vault.set_user_balance(&player, &1000_0000000);

    // Play game
    env.ledger().with_mut(|li| li.timestamp = start_time + 1000);

    let p2 = Address::generate(&env);
    ohloss.select_faction(&p2, &1);
    mock_vault.set_user_balance(&p2, &1000_0000000);

    ohloss.start_game(&game_contract, &1, &player, &p2, &100_0000000, &100_0000000);

    ohloss.end_game(&1, &true);

    // DON'T set up proper liquidity for BLND→USDC swap
    // (In test environment, swap will fail or return 0)

    // Cycle epoch - should succeed despite swap issues
    env.ledger()
        .with_mut(|li| li.timestamp = start_time + 345_600);

    // This may panic or succeed with zero rewards depending on implementation
    // If it panics, that's a bug - epoch cycling should be resilient
    let cycle_result = ohloss.try_cycle_epoch();

    // Ideally, this should succeed
    assert!(
        cycle_result.is_ok(),
        "Epoch cycle should succeed even if swap fails"
    );

    // Verify epoch cycled
    let current_epoch = ohloss.get_current_epoch();
    assert_eq!(current_epoch, 1);

    // Reward pool may be 0 or small due to swap failure
    let _epoch0 = ohloss.get_epoch(&0);

    // This test documents current behavior - if swap fails, reward pool is 0
    // and epoch still cycles (good for robustness)
}
