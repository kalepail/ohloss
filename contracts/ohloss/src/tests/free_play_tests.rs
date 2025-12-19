//! Free Play Feature Tests
//!
//! Tests for the free play feature where players can participate without depositing,
//! but must deposit to claim rewards.

use super::fee_vault_utils::{create_mock_vault, MockVaultClient};
use super::testutils::{
    assert_contract_error, create_ohloss_contract_with_free_play, setup_test_env, Error,
    DEFAULT_FREE_FP_PER_EPOCH, DEFAULT_MIN_DEPOSIT_TO_CLAIM,
};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{vec, Address};

// ============================================================================
// Free FP Calculation Tests
// ============================================================================

#[test]
fn test_free_player_gets_free_fp_only() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player = Address::generate(&env);

    // Create mock vault
    let vault_address = create_mock_vault(&env);
    let vault_client = MockVaultClient::new(&env, &vault_address);

    // Player has no vault balance (free player)
    vault_client.set_user_balance(&player, &0);

    let soroswap_router = Address::generate(&env);
    let blnd_token = Address::generate(&env);
    let usdc_token = Address::generate(&env);

    let ohloss = create_ohloss_contract_with_free_play(
        &env,
        &admin,
        &vault_address,
        &soroswap_router,
        &blnd_token,
        &usdc_token,
        345_600,
        vec![&env, 1],
        DEFAULT_FREE_FP_PER_EPOCH,    // 100 FP
        DEFAULT_MIN_DEPOSIT_TO_CLAIM, // 1 USDC
    );

    // Select faction (required before playing)
    ohloss.select_faction(&player, &0);

    // Get epoch player data - should have free FP only
    let epoch = ohloss.get_current_epoch();
    let epoch_player = ohloss.get_epoch_player(&epoch, &player);

    // Free player gets exactly free_fp_per_epoch (100 FP with 7 decimals)
    assert_eq!(epoch_player.available_fp, DEFAULT_FREE_FP_PER_EPOCH);
}

#[test]
fn test_deposited_player_gets_free_fp_plus_deposit_fp() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player = Address::generate(&env);

    // Create mock vault
    let vault_address = create_mock_vault(&env);
    let vault_client = MockVaultClient::new(&env, &vault_address);

    // Player has 100 USDC deposit
    let deposit_amount = 100_0000000i128; // 100 USDC
    vault_client.set_user_balance(&player, &deposit_amount);

    let soroswap_router = Address::generate(&env);
    let blnd_token = Address::generate(&env);
    let usdc_token = Address::generate(&env);

    let ohloss = create_ohloss_contract_with_free_play(
        &env,
        &admin,
        &vault_address,
        &soroswap_router,
        &blnd_token,
        &usdc_token,
        345_600,
        vec![&env, 1],
        DEFAULT_FREE_FP_PER_EPOCH,    // 100 FP
        DEFAULT_MIN_DEPOSIT_TO_CLAIM, // 1 USDC
    );

    // Select faction
    ohloss.select_faction(&player, &0);

    // Get epoch player data
    let epoch = ohloss.get_current_epoch();
    let epoch_player = ohloss.get_epoch_player(&epoch, &player);

    // Deposited player gets free_fp + deposit_fp
    // At minimum (time_mult = 1.0, amount_mult = 1.0):
    // deposit_fp = 100 USDC * 100 FP/USDC * 1.0 * 1.0 = 10,000 FP
    // Total = 100 free FP + 10,000 deposit FP = 10,100 FP
    // With 7 decimals: 10100_0000000
    // But time_mult starts at 1.0x so we get base calculation
    let expected_min_fp = DEFAULT_FREE_FP_PER_EPOCH + (deposit_amount * 100);

    // FP should be at least free_fp + base deposit FP (with 1.0x multipliers)
    assert!(
        epoch_player.available_fp >= expected_min_fp,
        "Expected at least {} FP, got {}",
        expected_min_fp,
        epoch_player.available_fp
    );

    // FP should be more than just free FP (proving additive)
    assert!(
        epoch_player.available_fp > DEFAULT_FREE_FP_PER_EPOCH,
        "Deposited player should have more than free FP"
    );
}

#[test]
fn test_config_free_fp_is_configurable() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player = Address::generate(&env);

    // Create mock vault
    let vault_address = create_mock_vault(&env);
    let vault_client = MockVaultClient::new(&env, &vault_address);
    vault_client.set_user_balance(&player, &0);

    let soroswap_router = Address::generate(&env);
    let blnd_token = Address::generate(&env);
    let usdc_token = Address::generate(&env);

    // Create with custom free FP (200 FP instead of default 100)
    let custom_free_fp = 200_0000000i128;

    let ohloss = create_ohloss_contract_with_free_play(
        &env,
        &admin,
        &vault_address,
        &soroswap_router,
        &blnd_token,
        &usdc_token,
        345_600,
        vec![&env, 1],
        custom_free_fp,
        DEFAULT_MIN_DEPOSIT_TO_CLAIM,
    );

    // Verify config
    let config = ohloss.get_config();
    assert_eq!(config.free_fp_per_epoch, custom_free_fp);

    // Select faction and check FP
    ohloss.select_faction(&player, &0);
    let epoch = ohloss.get_current_epoch();
    let epoch_player = ohloss.get_epoch_player(&epoch, &player);

    // Free player should get the custom free FP amount
    assert_eq!(epoch_player.available_fp, custom_free_fp);
}

#[test]
fn test_update_config_changes_free_fp() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    let vault_address = create_mock_vault(&env);
    let soroswap_router = Address::generate(&env);
    let blnd_token = Address::generate(&env);
    let usdc_token = Address::generate(&env);

    let ohloss = create_ohloss_contract_with_free_play(
        &env,
        &admin,
        &vault_address,
        &soroswap_router,
        &blnd_token,
        &usdc_token,
        345_600,
        vec![&env, 1],
        DEFAULT_FREE_FP_PER_EPOCH,
        DEFAULT_MIN_DEPOSIT_TO_CLAIM,
    );

    // Initial config
    let config = ohloss.get_config();
    assert_eq!(config.free_fp_per_epoch, DEFAULT_FREE_FP_PER_EPOCH);

    // Update free FP via update_config
    let new_free_fp = 500_0000000i128;
    ohloss.update_config(
        &None,              // fee_vault
        &None,              // soroswap_router
        &None,              // blnd_token
        &None,              // usdc_token
        &None,              // epoch_duration
        &None,              // reserve_token_ids
        &Some(new_free_fp), // new_free_fp_per_epoch
        &None,              // min_deposit_to_claim
        &None,              // dev_reward_share
    );

    // Verify config updated
    let config = ohloss.get_config();
    assert_eq!(config.free_fp_per_epoch, new_free_fp);
}

// ============================================================================
// Deposit Gate Tests (Claim Requirements)
// ============================================================================

#[test]
fn test_free_player_cannot_claim_rewards() {
    // Use the complete test environment with Soroswap for epoch cycling
    use super::testutils::create_ohloss_with_soroswap;

    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let game_id = Address::generate(&env);

    // Create ohloss with real soroswap for epoch cycling
    let ohloss = create_ohloss_with_soroswap(&env, &admin);

    // Get the mock vault from config and set balances
    let config = ohloss.get_config();
    let vault_client = MockVaultClient::new(&env, &config.fee_vault);

    // Player1 is a free player (no deposit)
    vault_client.set_user_balance(&player1, &0);
    // Player2 has deposit (to play against)
    vault_client.set_user_balance(&player2, &10_0000000);

    // Add game and select factions
    let developer = Address::generate(&env);
    ohloss.add_game(&game_id, &developer);
    ohloss.select_faction(&player1, &0); // Same faction to ensure winner
    ohloss.select_faction(&player2, &0);

    // Play a game where player1 wins
    let session_id = 1u32;
    let wager = 50_0000000i128; // 50 FP
    ohloss.start_game(&game_id, &session_id, &player1, &player2, &wager, &wager);
    ohloss.end_game(&session_id, &true); // player1 wins

    // Advance time and cycle epoch
    let epoch_duration = 345_600u64;
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + epoch_duration + 1);
    ohloss.cycle_epoch();

    // Free player tries to claim - should fail with DepositRequiredToClaim
    let claim_result = ohloss.try_claim_epoch_reward(&player1, &0);
    assert_contract_error(&claim_result, Error::DepositRequiredToClaim);
}

#[test]
fn test_player_can_claim_after_depositing() {
    // Use the complete test environment with Soroswap for epoch cycling
    use super::testutils::create_ohloss_with_soroswap;

    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let game_id = Address::generate(&env);

    // Create ohloss with real soroswap for epoch cycling
    let ohloss = create_ohloss_with_soroswap(&env, &admin);

    // Get the mock vault from config and set balances
    let config = ohloss.get_config();
    let vault_client = MockVaultClient::new(&env, &config.fee_vault);

    // Both players start with deposits
    let deposit_amount = 10_0000000i128; // 10 USDC (above minimum)
    vault_client.set_user_balance(&player1, &deposit_amount);
    vault_client.set_user_balance(&player2, &deposit_amount);

    // Add game and select factions
    let developer = Address::generate(&env);
    ohloss.add_game(&game_id, &developer);
    ohloss.select_faction(&player1, &0);
    ohloss.select_faction(&player2, &0);

    // Play a game where player1 wins
    let session_id = 1u32;
    let wager = 50_0000000i128;
    ohloss.start_game(&game_id, &session_id, &player1, &player2, &wager, &wager);
    ohloss.end_game(&session_id, &true);

    // Advance time and cycle epoch
    let epoch_duration = 345_600u64;
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + epoch_duration + 1);
    ohloss.cycle_epoch();

    // Try to claim - may fail for reasons like no reward pool,
    // but should NOT fail with DepositRequiredToClaim
    let claim_result = ohloss.try_claim_epoch_reward(&player1, &0);

    // If it fails, make sure it's NOT because of deposit requirement
    if let Err(Ok(error)) = &claim_result {
        assert_ne!(
            *error,
            Error::DepositRequiredToClaim,
            "Deposited player should pass deposit gate"
        );
    }
}

#[test]
fn test_deposit_below_threshold_cannot_claim() {
    // Use the complete test environment with Soroswap for epoch cycling
    use super::testutils::create_ohloss_with_soroswap;

    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player = Address::generate(&env);

    // Create ohloss with real soroswap for epoch cycling
    let ohloss = create_ohloss_with_soroswap(&env, &admin);

    // Get the mock vault from config and set balance below threshold
    let config = ohloss.get_config();
    let vault_client = MockVaultClient::new(&env, &config.fee_vault);

    // Player has deposit below minimum (0.5 USDC when minimum is 1 USDC)
    let below_threshold = 5_000000i128; // 0.5 USDC
    vault_client.set_user_balance(&player, &below_threshold);

    ohloss.select_faction(&player, &0);

    // Advance time and cycle epoch (need a finalized epoch to claim)
    let epoch_duration = 345_600u64;
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + epoch_duration + 1);
    ohloss.cycle_epoch();

    // Try to claim - should fail with DepositRequiredToClaim
    let claim_result = ohloss.try_claim_epoch_reward(&player, &0);
    assert_contract_error(&claim_result, Error::DepositRequiredToClaim);
}

#[test]
fn test_deposit_exactly_at_threshold_can_pass_gate() {
    // Use the complete test environment with Soroswap for epoch cycling
    use super::testutils::create_ohloss_with_soroswap;

    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player = Address::generate(&env);

    // Create ohloss with real soroswap for epoch cycling
    let ohloss = create_ohloss_with_soroswap(&env, &admin);

    // Get the mock vault from config and set balance at exactly threshold
    let config = ohloss.get_config();
    let vault_client = MockVaultClient::new(&env, &config.fee_vault);

    // Player has deposit exactly at minimum (1 USDC)
    vault_client.set_user_balance(&player, &config.min_deposit_to_claim);

    ohloss.select_faction(&player, &0);

    // Advance time and cycle epoch
    let epoch_duration = 345_600u64;
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + epoch_duration + 1);
    ohloss.cycle_epoch();

    // Try to claim - should NOT fail with DepositRequiredToClaim
    // (may fail for other reasons like NoRewardsAvailable)
    let claim_result = ohloss.try_claim_epoch_reward(&player, &0);

    if let Err(Ok(error)) = &claim_result {
        assert_ne!(
            *error,
            Error::DepositRequiredToClaim,
            "Player at exactly minimum threshold should pass deposit gate"
        );
    }
}

#[test]
fn test_min_deposit_threshold_is_configurable() {
    // Use the complete test environment with Soroswap for epoch cycling
    use super::testutils::create_ohloss_with_soroswap;

    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player = Address::generate(&env);

    // Create ohloss with real soroswap for epoch cycling
    let ohloss = create_ohloss_with_soroswap(&env, &admin);

    // Get the mock vault from config
    let config = ohloss.get_config();
    let vault_client = MockVaultClient::new(&env, &config.fee_vault);

    // Update config to custom minimum deposit (5 USDC instead of default 1)
    let custom_min_deposit = 5_0000000i128;
    ohloss.update_config(
        &None,
        &None,
        &None,
        &None,
        &None,
        &None,
        &None,
        &Some(custom_min_deposit),
        &None,
    );

    // Verify config updated
    let config = ohloss.get_config();
    assert_eq!(config.min_deposit_to_claim, custom_min_deposit);

    // Player has 3 USDC (below custom 5 USDC threshold)
    vault_client.set_user_balance(&player, &3_0000000);

    ohloss.select_faction(&player, &0);

    // Advance time and cycle epoch
    let epoch_duration = 345_600u64;
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + epoch_duration + 1);
    ohloss.cycle_epoch();

    // Player with 3 USDC cannot claim (below 5 USDC threshold)
    let claim_result = ohloss.try_claim_epoch_reward(&player, &0);
    assert_contract_error(&claim_result, Error::DepositRequiredToClaim);
}

// ============================================================================
// Free Play Game Participation Tests
// ============================================================================

#[test]
fn test_free_player_can_play_games() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let game_id = Address::generate(&env);

    // Create mock vault
    let vault_address = create_mock_vault(&env);
    let vault_client = MockVaultClient::new(&env, &vault_address);

    // Both players are free (no deposits)
    vault_client.set_user_balance(&player1, &0);
    vault_client.set_user_balance(&player2, &0);

    let soroswap_router = Address::generate(&env);
    let blnd_token = Address::generate(&env);
    let usdc_token = Address::generate(&env);

    let ohloss = create_ohloss_contract_with_free_play(
        &env,
        &admin,
        &vault_address,
        &soroswap_router,
        &blnd_token,
        &usdc_token,
        345_600,
        vec![&env, 1],
        DEFAULT_FREE_FP_PER_EPOCH, // 100 FP each
        DEFAULT_MIN_DEPOSIT_TO_CLAIM,
    );

    // Add game and select factions
    let developer = Address::generate(&env);
    ohloss.add_game(&game_id, &developer);
    ohloss.select_faction(&player1, &0);
    ohloss.select_faction(&player2, &1);

    // Start game with wager within free FP limits
    let session_id = 1u32;
    let wager = 50_0000000i128; // 50 FP (half of free allocation)

    // This should succeed - free players can play
    ohloss.start_game(&game_id, &session_id, &player1, &player2, &wager, &wager);

    // End game
    ohloss.end_game(&session_id, &true); // player1 wins

    // Verify FP was deducted and contributed
    let epoch = ohloss.get_current_epoch();
    let p1_data = ohloss.get_epoch_player(&epoch, &player1);

    // Player1 started with 100 FP, wagered 50, won so contributed 50
    // Available = 100 - 50 = 50 FP remaining
    assert_eq!(p1_data.available_fp, DEFAULT_FREE_FP_PER_EPOCH - wager);
    assert_eq!(p1_data.total_fp_contributed, wager);
}

#[test]
fn test_free_player_cannot_wager_more_than_free_fp() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let game_id = Address::generate(&env);

    // Create mock vault
    let vault_address = create_mock_vault(&env);
    let vault_client = MockVaultClient::new(&env, &vault_address);

    // Both players are free (no deposits)
    vault_client.set_user_balance(&player1, &0);
    vault_client.set_user_balance(&player2, &0);

    let soroswap_router = Address::generate(&env);
    let blnd_token = Address::generate(&env);
    let usdc_token = Address::generate(&env);

    let ohloss = create_ohloss_contract_with_free_play(
        &env,
        &admin,
        &vault_address,
        &soroswap_router,
        &blnd_token,
        &usdc_token,
        345_600,
        vec![&env, 1],
        DEFAULT_FREE_FP_PER_EPOCH, // 100 FP each
        DEFAULT_MIN_DEPOSIT_TO_CLAIM,
    );

    // Add game and select factions
    let developer = Address::generate(&env);
    ohloss.add_game(&game_id, &developer);
    ohloss.select_faction(&player1, &0);
    ohloss.select_faction(&player2, &1);

    // Try to wager more than free FP allocation
    let session_id = 1u32;
    let excessive_wager = 150_0000000i128; // 150 FP (more than 100 FP allocation)

    // This should fail - insufficient faction points
    let result = ohloss.try_start_game(
        &game_id,
        &session_id,
        &player1,
        &player2,
        &excessive_wager,
        &excessive_wager,
    );

    assert_contract_error(&result, Error::InsufficientFactionPoints);
}

#[test]
fn test_free_fp_contributes_to_faction_standings() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let game_id = Address::generate(&env);

    // Create mock vault
    let vault_address = create_mock_vault(&env);
    let vault_client = MockVaultClient::new(&env, &vault_address);

    // Player1 is free, Player2 has deposit
    vault_client.set_user_balance(&player1, &0);
    vault_client.set_user_balance(&player2, &100_0000000);

    let soroswap_router = Address::generate(&env);
    let blnd_token = Address::generate(&env);
    let usdc_token = Address::generate(&env);

    let ohloss = create_ohloss_contract_with_free_play(
        &env,
        &admin,
        &vault_address,
        &soroswap_router,
        &blnd_token,
        &usdc_token,
        345_600,
        vec![&env, 1],
        DEFAULT_FREE_FP_PER_EPOCH,
        DEFAULT_MIN_DEPOSIT_TO_CLAIM,
    );

    // Add game and select SAME faction
    let developer = Address::generate(&env);
    ohloss.add_game(&game_id, &developer);
    ohloss.select_faction(&player1, &0);
    ohloss.select_faction(&player2, &0);

    // Free player wins a game
    let session_id = 1u32;
    let wager = 50_0000000i128;
    ohloss.start_game(&game_id, &session_id, &player1, &player2, &wager, &wager);
    ohloss.end_game(&session_id, &true); // Free player (player1) wins

    // Check faction standings
    let epoch = ohloss.get_current_epoch();
    let epoch_info = ohloss.get_epoch(&epoch);

    // Faction 0 should have standings from free player's win
    let faction_0_standings = epoch_info.faction_standings.get(0).unwrap_or(0);
    assert_eq!(
        faction_0_standings, wager,
        "Free player's wager should contribute to faction standings"
    );
}
