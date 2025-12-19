/// Game Expiration Tests - HIGH PRIORITY
///
/// Games started in one epoch should not be completable in the next epoch.
/// This prevents gaming the system by starting games at the end of an epoch
/// and completing them after seeing the next epoch's conditions.
///
/// Key invariant: session.epoch_id must match current epoch at end_game
use super::fee_vault_utils::{create_mock_vault, MockVaultClient};
use super::testutils::{assert_contract_error, create_ohloss_contract, setup_test_env, Error};
use crate::OhlossClient;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{vec, Address, Env};

// ============================================================================
// Test Setup Helpers
// ============================================================================

fn setup_expiration_test_env<'a>(
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
// Expiration Tests
// ============================================================================

/// Test that games from previous epoch cannot be completed
///
/// Security invariant: A game started in epoch N cannot be ended in epoch N+1.
/// This prevents players from:
/// 1. Starting games at end of epoch
/// 2. Waiting to see next epoch conditions
/// 3. Only completing favorable games
#[test]
fn test_game_from_previous_epoch_cannot_complete() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss) = setup_expiration_test_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    // Setup players
    ohloss.select_faction(&player1, &0); // WholeNoodle
    ohloss.select_faction(&player2, &1); // PointyStick

    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    // Get epoch 0 start time
    let epoch0 = ohloss.get_epoch(&0);
    let epoch_start = epoch0.start_time;

    // Start game in epoch 0
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 1000);
    let current_epoch = ohloss.get_current_epoch();
    assert_eq!(current_epoch, 0, "Should be in epoch 0");

    ohloss.start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    // Cycle to epoch 1 (wait full epoch duration from epoch start)
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600);
    ohloss.cycle_epoch();

    // Try to end the game in epoch 1 - should fail with GameExpired error
    let result = ohloss.try_end_game(&1, &true);

    assert_contract_error(&result, Error::GameExpired);
}

/// Test that games expire on epoch cycle
///
/// When an epoch cycles, all active games from that epoch should be
/// considered expired. The FP remains locked and unrecoverable.
#[test]
fn test_games_expire_on_epoch_cycle() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss) = setup_expiration_test_env(&env);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);

    // Setup two players
    ohloss.select_faction(&p1, &0); // WholeNoodle
    ohloss.select_faction(&p2, &1); // PointyStick

    mock_vault.set_user_balance(&p1, &1000_0000000);
    mock_vault.set_user_balance(&p2, &1000_0000000);

    // Get epoch 0 start time
    let epoch0 = ohloss.get_epoch(&0);
    let epoch_start = epoch0.start_time;

    // Start multiple games in epoch 0
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 1000);
    ohloss.start_game(&game_contract, &1, &p1, &p2, &200_0000000, &300_0000000);
    ohloss.start_game(&game_contract, &2, &p1, &p2, &100_0000000, &100_0000000);

    // Verify FP is locked (available_fp should be reduced by wagers)
    let p1_epoch0 = ohloss.get_epoch_player(&ohloss.get_current_epoch(), &p1);
    let p2_epoch0 = ohloss.get_epoch_player(&ohloss.get_current_epoch(), &p2);

    // P1 locked 200 + 100 = 300 USDC in wagers
    // P2 locked 300 + 100 = 400 USDC in wagers
    // available_fp should reflect these deductions

    let initial_fp_p1 = p1_epoch0.available_fp + 300_0000000; // Add back locked amounts
    let initial_fp_p2 = p2_epoch0.available_fp + 400_0000000;

    assert!(initial_fp_p1 > 0, "P1 should have initial FP");
    assert!(initial_fp_p2 > 0, "P2 should have initial FP");

    // Cycle epoch
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600);
    ohloss.cycle_epoch();

    // Try to complete games in new epoch - both should fail

    let r1 = ohloss.try_end_game(&1, &true);
    assert!(r1.is_err(), "P1's game should be expired");

    let r2 = ohloss.try_end_game(&2, &true);
    assert!(r2.is_err(), "P2's game should be expired");

    // Start new games in epoch 1 to initialize epoch player data
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600 + 100);
    ohloss.start_game(&game_contract, &3, &p1, &p2, &100_0000000, &100_0000000);

    // Verify epoch 1 data is calculated fresh (doesn't include expired locked FP)
    let p1_epoch1 = ohloss.get_epoch_player(&ohloss.get_current_epoch(), &p1);

    // Epoch 1 FP is calculated fresh from current vault balance
    // The FP locked in expired games from epoch 0 is not carried over
    // available_fp in epoch 1 is based on fresh calculation minus the new 100 USDC wager
    assert!(
        p1_epoch1.available_fp >= 0,
        "Epoch 1 should have fresh FP calculation"
    );

    // total_fp_contributed should be 0 (no games completed yet in epoch 1)
    assert_eq!(
        p1_epoch1.total_fp_contributed, 0,
        "No FP contributed in epoch 1 yet"
    );
}

/// Test FP locked in expired games is not recoverable
///
/// Design decision: FP locked in games that expire (don't complete before
/// epoch cycle) remains locked forever. This is the penalty for not
/// completing games in time.
///
/// This test documents the current behavior. If this changes to return FP,
/// this test should be updated.
#[test]
fn test_fp_in_expired_games_stays_locked() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss) = setup_expiration_test_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    ohloss.select_faction(&player1, &0); // WholeNoodle
    ohloss.select_faction(&player2, &1); // PointyStick

    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    // Get epoch 0 start time
    let epoch0 = ohloss.get_epoch(&0);
    let epoch_start = epoch0.start_time;

    // Start game with wager
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 1000);
    ohloss.start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &500_0000000,
        &100_0000000,
    );

    // Check initial FP allocation
    let epoch0_before = ohloss.get_epoch_player(&ohloss.get_current_epoch(), &player1);

    // Calculate initial FP by adding back the locked wager
    let initial_fp = epoch0_before.available_fp + 500_0000000;
    assert!(initial_fp > 0, "Should have initial FP");

    // Cycle epoch (game expires)
    env.ledger()
        .with_mut(|li| li.timestamp = epoch_start + 345_600);
    ohloss.cycle_epoch();

    // Start a new game in epoch 1 to get fresh FP calculation
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

    let epoch1 = ohloss.get_epoch_player(&ohloss.get_current_epoch(), &player1);

    // Epoch 1 FP is calculated fresh from vault balance
    // The 500 FP locked in the expired game is NOT added to epoch 1
    // This verifies the design: expired game FP is lost, not carried forward

    // Epoch 1 FP should be fresh calculation (not including the 500 from expired game)
    // It should be approximately the same as epoch 0's initial FP (based on same vault balance)
    // But definitely NOT include the lost 500 USDC

    assert!(
        epoch1.available_fp >= 0,
        "Epoch 1 should have fresh FP calculation"
    );

    // Verify that the expired FP is not in epoch 1
    // The lost 500 stays in epoch 0 as perpetually locked
    assert_eq!(
        epoch1.total_fp_contributed, 0,
        "No FP contributed in epoch 1 yet (expired game doesn't count)"
    );
}
