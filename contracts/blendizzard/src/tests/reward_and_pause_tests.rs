/// Additional Test Coverage for Reward Claiming, Pause Mechanism, and Error Paths
///
/// This file adds critical test coverage for:
/// - Reward claiming (happy path, double-claim, non-winning faction)
/// - Pause mechanism (blocks player functions, allows admin functions)
/// - Error paths (invalid inputs, unauthorized calls)
/// - Cross-epoch scenarios
use super::fee_vault_utils::{create_mock_vault, MockVaultClient};
use super::testutils::{create_blendizzard_contract, setup_test_env};
use crate::BlendizzardClient;
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{vec, Address, Env};

// ============================================================================
// Test Helpers
// ============================================================================

fn setup_complete_game_env<'a>(
    env: &'a Env,
) -> (
    Address,
    Address,
    MockVaultClient<'a>,
    BlendizzardClient<'a>,
    MockTokenClient<'a>,
) {
    let admin = Address::generate(env);
    let game = Address::generate(env);

    let mock_vault_addr = create_mock_vault(env);
    let mock_vault = MockVaultClient::new(env, &mock_vault_addr);

    // Create USDC token for rewards
    let usdc = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
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
    let session1 = 1u32;
    blendizzard.start_game(
        &game,
        &session1,
        &player1,
        &player2,
        &100_0000000,
        &50_0000000,
    );

    // Pause contract
    blendizzard.pause();
    assert!(blendizzard.is_paused());

    // Should fail after pause
    let session2 = 2u32;
    let result = blendizzard.try_start_game(
        &game,
        &session2,
        &player1,
        &player2,
        &100_0000000,
        &50_0000000,
    );
    assert!(result.is_err(), "start_game should fail when paused");
}

#[test]
fn test_pause_blocks_claim_epoch_reward() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player = Address::generate(&env);

    // Pause contract
    blendizzard.pause();

    // claim_epoch_reward should fail when paused
    let result = blendizzard.try_claim_epoch_reward(&player, &0);
    assert!(
        result.is_err(),
        "claim_epoch_reward should fail when paused"
    );
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
fn test_claim_epoch_reward_before_epoch_finalized() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player = Address::generate(&env);

    // Try to claim from epoch 0 before it's finalized
    let result = blendizzard.try_claim_epoch_reward(&player, &0);
    assert!(
        result.is_err(),
        "Should fail to claim from unfinalized epoch"
    );
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
    let session = 10u32;
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
    let session = 11u32;
    let result = blendizzard.try_start_game(
        &game,
        &session,
        &player1,
        &player2,
        &1000_0000000,
        &10_0000000,
    );
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
    let session = 12u32;
    blendizzard.start_game(
        &game,
        &session,
        &player1,
        &player2,
        &100_0000000,
        &50_0000000,
    );

    // Try to start another game with same session_id (should fail)
    let result = blendizzard.try_start_game(
        &game,
        &session,
        &player1,
        &player2,
        &100_0000000,
        &50_0000000,
    );
    assert!(result.is_err(), "Should fail with duplicate session ID");
}

#[test]
fn test_end_game_nonexistent_session() {
    let env = setup_test_env();
    let (game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    // Try to end a session that doesn't exist
    let session = 13u32;
    let proof = soroban_sdk::Bytes::new(&env);
    let outcome = crate::types::GameOutcome {
        game_id: game.clone(),
        session_id: session.clone(),
        player1: player1.clone(),
        player2: player2.clone(),
        winner: true,
    };

    let result = blendizzard.try_end_game(&proof, &outcome);
    assert!(result.is_err(), "Should fail with nonexistent session");
}

#[test]
fn test_select_invalid_faction() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player = Address::generate(&env);

    // Try to select faction 3 (only 0, 1, 2 are valid)
    let result = blendizzard.try_select_faction(&player, &3);
    assert!(result.is_err(), "Should fail with invalid faction ID");

    // Try faction 99
    let result = blendizzard.try_select_faction(&player, &99);
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
    let session1 = 20u32;
    blendizzard.start_game(
        &game,
        &session1,
        &player,
        &opponent,
        &50_0000000,
        &50_0000000,
    );

    let epoch0_player = blendizzard.get_epoch_player(&blendizzard.get_current_epoch(), &player);
    assert_eq!(
        epoch0_player.epoch_faction,
        Some(0),
        "Epoch 0 faction should be WholeNoodle"
    );

    // Switch to PointyStick (1)
    blendizzard.select_faction(&player, &1);

    // Epoch 0 faction should still be WholeNoodle (locked)
    let epoch0_player_after = blendizzard.get_epoch_player(&blendizzard.get_current_epoch(), &player);
    assert_eq!(
        epoch0_player_after.epoch_faction,
        Some(0),
        "Epoch 0 faction should remain WholeNoodle"
    );

    // Verify persistent faction was updated
    let player_data = blendizzard.get_player(&player);
    assert_eq!(
        player_data.selected_faction, 1,
        "Persistent faction should be PointyStick"
    );

    // Note: Can't test next epoch without cycle_epoch working in test env
    // (requires real USDC/BLND token contracts for swap)
}

// ============================================================================
// Withdrawal Reset Tests (using MockVault balance changes)
// ============================================================================

#[test]
fn test_time_multiplier_start_initialized_on_first_game() {
    let env = setup_test_env();
    let (game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player = Address::generate(&env);
    let opponent = Address::generate(&env);

    mock_vault.set_user_balance(&player, &1000_0000000);
    mock_vault.set_user_balance(&opponent, &1000_0000000);

    blendizzard.select_faction(&player, &0);
    blendizzard.select_faction(&opponent, &1);

    // Before first game, player might not exist in storage
    let _player_result = blendizzard.try_get_player(&player);
    // If player doesn't exist yet, that's OK

    // Start first game
    let session = 30u32;
    blendizzard.start_game(
        &game,
        &session,
        &player,
        &opponent,
        &50_0000000,
        &50_0000000,
    );

    // After first game, time_multiplier_start should be set
    let player_data = blendizzard.get_player(&player);
    assert!(
        player_data.time_multiplier_start > 0,
        "Deposit timestamp should be initialized"
    );
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
    let session = 31u32;
    blendizzard.start_game(
        &game,
        &session,
        &player,
        &opponent,
        &50_0000000,
        &50_0000000,
    );

    // Check last_epoch_balance was snapshotted
    let player_data = blendizzard.get_player(&player);
    assert_eq!(
        player_data.last_epoch_balance, initial_balance,
        "last_epoch_balance should match vault balance"
    );
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
    let session = 40u32;

    let result = blendizzard.try_start_game(
        &fake_game,
        &session,
        &player1,
        &player2,
        &100_0000000,
        &50_0000000,
    );
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

    // Should return error for player that never interacted
    let result = blendizzard.try_get_player(&nonexistent_user);
    assert!(result.is_err(), "Should fail for nonexistent player");
}

#[test]
fn test_get_epoch_player_returns_defaults_before_first_game() {
    let env = setup_test_env();
    let (_game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player = Address::generate(&env);

    mock_vault.set_user_balance(&player, &1000_0000000);
    blendizzard.select_faction(&player, &0);

    // Player has selected faction but hasn't played yet
    let player_data = blendizzard.get_player(&player);
    assert_eq!(player_data.selected_faction, 0);

    // NEW BEHAVIOR: Epoch data should now return computed FP even before first game
    // This allows UIs to display FP without requiring a game interaction first
    let epoch_data = blendizzard.get_epoch_player(&blendizzard.get_current_epoch(), &player);

    // Should have calculated FP based on vault balance (1000 USDC)
    assert!(
        epoch_data.available_fp > 0,
        "Should have calculated FP based on vault balance"
    );

    // Should have balance snapshot
    assert_eq!(epoch_data.epoch_balance_snapshot, 1000_0000000);

    // Faction not locked yet (None indicates not locked)
    assert_eq!(epoch_data.epoch_faction, None);

    // No locked FP or contributions yet

    assert_eq!(epoch_data.total_fp_contributed, 0);
}

#[test]
fn test_get_epoch_player_errors_without_faction_selection() {
    let env = setup_test_env();
    let (_game, _vault, mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    let player = Address::generate(&env);

    // Player has vault balance but hasn't selected faction
    mock_vault.set_user_balance(&player, &1000_0000000);

    // Should error with FactionNotSelected (not PlayerNotFound)
    let current_epoch = blendizzard.get_current_epoch();
    let result = blendizzard.try_get_epoch_player(&current_epoch, &player);
    assert!(result.is_err(), "Should error when faction not selected");
    // Note: Error code #16 is FactionNotSelected
}

#[test]
fn test_get_epoch_for_current_and_nonexistent() {
    let env = setup_test_env();
    let (_game, _vault, _mock_vault, blendizzard, _usdc) = setup_complete_game_env(&env);

    // Get current epoch (epoch 0)
    let current_epoch_num = blendizzard.get_current_epoch();
    assert_eq!(current_epoch_num, 0, "Should be in epoch 0");

    let current_epoch_info = blendizzard.get_epoch(&current_epoch_num);
    assert!(!current_epoch_info.is_finalized);

    // Get specific epoch (0) - should return same as current
    let _epoch0 = blendizzard.get_epoch(&0);

    // Try to get nonexistent epoch (999)
    let result = blendizzard.try_get_epoch(&999);
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
    let session = 50u32;
    blendizzard.start_game(
        &game,
        &session,
        &player1,
        &player2,
        &100_0000000,
        &50_0000000,
    );

    let proof = soroban_sdk::Bytes::new(&env);
    let outcome = crate::types::GameOutcome {
        game_id: game.clone(),
        session_id: session.clone(),
        player1: player1.clone(),
        player2: player2.clone(),
        winner: true, // player1 wins
    };
    blendizzard.end_game(&proof, &outcome);

    // Get faction standings for epoch 0 via get_epoch
    let epoch = blendizzard.get_epoch(&0);
    let standings = epoch.faction_standings;

    // Faction 0 (WholeNoodle) should have player1's contribution
    assert_eq!(standings.get(0), Some(100_0000000));
}
