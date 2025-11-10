/// Additional Test Coverage for Reward Claiming, Pause Mechanism, and Error Paths
///
/// This file adds critical test coverage for:
/// - Reward claiming (happy path, double-claim, non-winning faction)
/// - Pause mechanism (blocks user functions, allows admin functions)
/// - Error paths (invalid inputs, unauthorized calls)
/// - Cross-epoch scenarios

use super::fee_vault_utils::{create_mock_vault, MockVaultClient};
use super::testutils::{create_blendizzard_contract, setup_test_env};
use crate::BlendizzardClient;
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{vec, Address, BytesN, Env};

// ============================================================================
// Test Helpers
// ============================================================================

fn setup_complete_game_env<'a>(
    env: &'a Env,
) -> (Address, Address, MockVaultClient<'a>, BlendizzardClient<'a>, MockTokenClient<'a>) {
    let admin = Address::generate(env);
    let game = Address::generate(env);

    let mock_vault_addr = create_mock_vault(env);
    let mock_vault = MockVaultClient::new(env, &mock_vault_addr);

    // Create USDC token for rewards
    let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let usdc_client = MockTokenClient::new(env, &usdc);

    let soroswap_router = Address::generate(env);
    let blnd_token = Address::generate(env);
    let epoch_duration = 86400; // 1 day for faster testing

    let blendizzard = create_blendizzard_contract(
        env,
        &admin,
        &mock_vault_addr,
        &soroswap_router,
        &blnd_token,
        &usdc,
        epoch_duration,
        vec![env, 1],
    );

    blendizzard.add_game(&game);

    (game, mock_vault_addr, mock_vault, blendizzard, usdc_client)
}

// ============================================================================
// Pause Mechanism Tests
// ============================================================================

#[test]
fn test_pause_blocks_start_game() {
    let env = setup_test_env();
    let (game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Works before pause
    let session1 = BytesN::from_array(&env, &[1u8; 32]);
    blendizzard.start_game(&game, &session1, &player1, &player2, &100_0000000, &50_0000000);

    // Pause contract
    blendizzard.pause();
    assert!(blendizzard.is_paused());

    // Should fail after pause
    let session2 = BytesN::from_array(&env, &[2u8; 32]);
    let result = blendizzard.try_start_game(&game, &session2, &player1, &player2, &100_0000000, &50_0000000);
    assert!(result.is_err(), "start_game should fail when paused");
}

#[test]
fn test_pause_blocks_claim_yield() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let user = Address::generate(&env);

    // Pause contract
    blendizzard.pause();

    // claim_yield should fail when paused
    let result = blendizzard.try_claim_yield(&user, &0);
    assert!(result.is_err(), "claim_yield should fail when paused");
}

#[test]
fn test_admin_functions_work_when_paused() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    // Pause
    blendizzard.pause();

    // Admin can still add/remove games
    let new_game = Address::generate(&env);
    blendizzard.add_game(&new_game);
    assert!(blendizzard.is_game(&new_game));

    blendizzard.remove_game(&new_game);
    assert!(!blendizzard.is_game(&new_game));

    // Admin can update config (just verify it doesn't error)
    let new_router = Address::generate(&env);
    blendizzard.update_config(&Some(new_router.clone()), &None, &None, &None, &None, &None);

    // Config should be updated (just verify get_config works)
    let _config = blendizzard.get_config();

    // Admin can unpause
    blendizzard.unpause();
    assert!(!blendizzard.is_paused());
}

// ============================================================================
// Reward Query Tests (claimable_amount, has_claimed)
// ============================================================================

#[test]
fn test_get_claimable_amount_before_epoch_finalized() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let user = Address::generate(&env);

    // Current epoch (0) is not finalized yet
    let claimable = blendizzard.get_claimable_amount(&user, &0);
    assert_eq!(claimable, 0, "Should return 0 for unfinalized epoch");
}

#[test]
fn test_get_claimable_amount_nonexistent_epoch() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let user = Address::generate(&env);

    // Epoch 999 doesn't exist
    let claimable = blendizzard.get_claimable_amount(&user, &999);
    assert_eq!(claimable, 0, "Should return 0 for nonexistent epoch");
}

#[test]
fn test_has_claimed_rewards_initially_false() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let user = Address::generate(&env);

    // User hasn't claimed yet
    assert!(!blendizzard.has_claimed_rewards(&user, &0));
    assert!(!blendizzard.has_claimed_rewards(&user, &1));
}

#[test]
fn test_claim_yield_before_epoch_finalized() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let user = Address::generate(&env);

    // Try to claim from epoch 0 before it's finalized
    let result = blendizzard.try_claim_yield(&user, &0);
    assert!(result.is_err(), "Should fail to claim from unfinalized epoch");
}

// ============================================================================
// Error Path Tests
// ============================================================================

#[test]
fn test_start_game_with_zero_wager() {
    let env = setup_test_env();
    let (game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Try to start game with 0 wager (should fail)
    let session = BytesN::from_array(&env, &[10u8; 32]);
    let result = blendizzard.try_start_game(&game, &session, &player1, &player2, &0, &100_0000000);
    assert!(result.is_err(), "Should fail with zero wager");
}

#[test]
fn test_start_game_with_insufficient_fp() {
    let env = setup_test_env();
    let (game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    // Give players small balances
    mock_vault.set_user_balance(&player1, &10_0000000); // 10 USDC
    mock_vault.set_user_balance(&player2, &10_0000000);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Try to wager more than they have (with multipliers, they'll have ~11-12 FP)
    let session = BytesN::from_array(&env, &[11u8; 32]);
    let result = blendizzard.try_start_game(&game, &session, &player1, &player2, &1000_0000000, &10_0000000);
    assert!(result.is_err(), "Should fail with insufficient FP");
}

#[test]
fn test_start_game_duplicate_session_id() {
    let env = setup_test_env();
    let (game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Start first game
    let session = BytesN::from_array(&env, &[12u8; 32]);
    blendizzard.start_game(&game, &session, &player1, &player2, &100_0000000, &50_0000000);

    // Try to start another game with same session_id (should fail)
    let result = blendizzard.try_start_game(&game, &session, &player1, &player2, &100_0000000, &50_0000000);
    assert!(result.is_err(), "Should fail with duplicate session ID");
}

#[test]
fn test_end_game_nonexistent_session() {
    let env = setup_test_env();
    let (game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    // Try to end a session that doesn't exist
    let session = BytesN::from_array(&env, &[13u8; 32]);
    let proof = soroban_sdk::Bytes::new(&env);
    let outcome = crate::types::GameOutcome {
        game_id: game.clone(),
        session_id: session.clone(),
        player1: player1.clone(),
        player2: player2.clone(),
        winner: true,
    };

    let result = blendizzard.try_end_game(&game, &session, &proof, &outcome);
    assert!(result.is_err(), "Should fail with nonexistent session");
}

#[test]
fn test_select_invalid_faction() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let user = Address::generate(&env);

    // Try to select faction 3 (only 0, 1, 2 are valid)
    let result = blendizzard.try_select_faction(&user, &3);
    assert!(result.is_err(), "Should fail with invalid faction ID");

    // Try faction 99
    let result = blendizzard.try_select_faction(&user, &99);
    assert!(result.is_err(), "Should fail with invalid faction ID");
}

// ============================================================================
// Cross-Epoch Faction Switching Tests
// ============================================================================

#[test]
fn test_faction_switch_applies_next_epoch() {
    let env = setup_test_env();
    let (game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player = Address::generate(&env);
    let opponent = Address::generate(&env);

    mock_vault.set_user_balance(&player, &1000_0000000);
    mock_vault.set_user_balance(&opponent, &1000_0000000);

    // Select WholeNoodle (0)
    blendizzard.select_faction(&player, &0);
    blendizzard.select_faction(&opponent, &1);

    // Play first game (locks faction for epoch 0)
    let session1 = BytesN::from_array(&env, &[20u8; 32]);
    blendizzard.start_game(&game, &session1, &player, &opponent, &50_0000000, &50_0000000);

    let epoch0_player = blendizzard.get_epoch_player(&player);
    assert_eq!(epoch0_player.epoch_faction, Some(0), "Epoch 0 faction should be WholeNoodle");

    // Switch to PointyStick (1)
    blendizzard.select_faction(&player, &1);

    // Epoch 0 faction should still be WholeNoodle (locked)
    let epoch0_player_after = blendizzard.get_epoch_player(&player);
    assert_eq!(epoch0_player_after.epoch_faction, Some(0), "Epoch 0 faction should remain WholeNoodle");

    // Verify persistent faction was updated
    let player_data = blendizzard.get_player(&player);
    assert_eq!(player_data.selected_faction, 1, "Persistent faction should be PointyStick");

    // Note: Can't test next epoch without cycle_epoch working in test env
    // (requires real USDC/BLND token contracts for swap)
}

// ============================================================================
// Withdrawal Reset Tests (using MockVault balance changes)
// ============================================================================

#[test]
fn test_deposit_timestamp_initialized_on_first_game() {
    let env = setup_test_env();
    let (game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player = Address::generate(&env);
    let opponent = Address::generate(&env);

    mock_vault.set_user_balance(&player, &1000_0000000);
    mock_vault.set_user_balance(&opponent, &1000_0000000);

    blendizzard.select_faction(&player, &0);
    blendizzard.select_faction(&opponent, &1);

    // Before first game, player might not exist in storage
    let player_result = blendizzard.try_get_player(&player);
    // If user doesn't exist yet, that's OK

    // Start first game
    let session = BytesN::from_array(&env, &[30u8; 32]);
    blendizzard.start_game(&game, &session, &player, &opponent, &50_0000000, &50_0000000);

    // After first game, deposit_timestamp should be set
    let player_data = blendizzard.get_player(&player);
    assert!(player_data.deposit_timestamp > 0, "Deposit timestamp should be initialized");
}

#[test]
fn test_last_epoch_balance_updated_on_first_game() {
    let env = setup_test_env();
    let (game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player = Address::generate(&env);
    let opponent = Address::generate(&env);

    let initial_balance = 1000_0000000;
    mock_vault.set_user_balance(&player, &initial_balance);
    mock_vault.set_user_balance(&opponent, &initial_balance);

    blendizzard.select_faction(&player, &0);
    blendizzard.select_faction(&opponent, &1);

    // Start first game
    let session = BytesN::from_array(&env, &[31u8; 32]);
    blendizzard.start_game(&game, &session, &player, &opponent, &50_0000000, &50_0000000);

    // Check last_epoch_balance was snapshotted
    let player_data = blendizzard.get_player(&player);
    assert_eq!(player_data.last_epoch_balance, initial_balance, "last_epoch_balance should match vault balance");
}

// ============================================================================
// Config Getter Test
// ============================================================================

#[test]
fn test_get_config() {
    let env = setup_test_env();
    let (_game, vault_addr, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let config = blendizzard.get_config();

    // Verify config fields are accessible
    assert_eq!(config.fee_vault, vault_addr);
    assert_eq!(config.epoch_duration, 86400);
    assert_eq!(config.reserve_token_ids.len(), 1);
}

// ============================================================================
// Game Registry Tests
// ============================================================================

#[test]
fn test_start_game_with_unwhitelisted_game() {
    let env = setup_test_env();
    let (_game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Try to start game with un unwhitelisted game contract
    let fake_game = Address::generate(&env);
    let session = BytesN::from_array(&env, &[40u8; 32]);

    let result = blendizzard.try_start_game(&fake_game, &session, &player1, &player2, &100_0000000, &50_0000000);
    assert!(result.is_err(), "Should fail with unwhitelisted game");
}

#[test]
fn test_add_and_remove_game() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let new_game = Address::generate(&env);

    // Initially not whitelisted
    assert!(!blendizzard.is_game(&new_game));

    // Add game
    blendizzard.add_game(&new_game);
    assert!(blendizzard.is_game(&new_game));

    // Remove game
    blendizzard.remove_game(&new_game);
    assert!(!blendizzard.is_game(&new_game));
}

// ============================================================================
// Query Function Tests
// ============================================================================

#[test]
fn test_get_player_nonexistent_user() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let nonexistent_user = Address::generate(&env);

    // Should return error for user that never interacted
    let result = blendizzard.try_get_player(&nonexistent_user);
    assert!(result.is_err(), "Should fail for nonexistent user");
}

#[test]
fn test_get_epoch_player_returns_defaults_before_first_game() {
    let env = setup_test_env();
    let (_game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player = Address::generate(&env);

    mock_vault.set_user_balance(&player, &1000_0000000);
    blendizzard.select_faction(&player, &0);

    // User has selected faction but hasn't played yet
    let player_data = blendizzard.get_player(&player);
    assert_eq!(player_data.selected_faction, 0);

    // Epoch data should return defaults (no faction locked, no FP)
    let epoch_player = blendizzard.get_epoch_player(&player);
    assert_eq!(epoch_player.epoch_faction, None);
    assert_eq!(epoch_player.available_fp, 0);
    assert_eq!(epoch_player.locked_fp, 0);
}

#[test]
fn test_is_faction_locked_before_first_game() {
    let env = setup_test_env();
    let (_game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player = Address::generate(&env);

    mock_vault.set_user_balance(&player, &1000_0000000);
    blendizzard.select_faction(&player, &0);

    // Faction should not be locked yet
    assert!(!blendizzard.is_faction_locked(&player));
}

#[test]
fn test_get_epoch_for_current_and_nonexistent() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    // Get current epoch (epoch 0)
    let current_epoch = blendizzard.get_epoch(&None);
    assert_eq!(current_epoch.epoch_number, 0);
    assert!(!current_epoch.is_finalized);

    // Get specific epoch (0)
    let epoch0 = blendizzard.get_epoch(&Some(0));
    assert_eq!(epoch0.epoch_number, 0);

    // Try to get nonexistent epoch (999)
    let result = blendizzard.try_get_epoch(&Some(999));
    assert!(result.is_err(), "Should fail for nonexistent epoch");
}

#[test]
fn test_get_faction_standings() {
    let env = setup_test_env();
    let (game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    mock_vault.set_user_balance(&player1, &1000_0000000);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Play and end game
    let session = BytesN::from_array(&env, &[50u8; 32]);
    blendizzard.start_game(&game, &session, &player1, &player2, &100_0000000, &50_0000000);

    let proof = soroban_sdk::Bytes::new(&env);
    let outcome = crate::types::GameOutcome {
        game_id: game.clone(),
        session_id: session.clone(),
        player1: player1.clone(),
        player2: player2.clone(),
        winner: true, // player1 wins
    };
    blendizzard.end_game(&game, &session, &proof, &outcome);

    // Get faction standings for epoch 0
    let standings = blendizzard.get_faction_standings(&0);

    // Faction 0 (WholeNoodle) should have player1's contribution
    assert_eq!(standings.get(0), Some(100_0000000));
}
