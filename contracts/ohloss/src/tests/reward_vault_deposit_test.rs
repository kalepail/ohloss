/// Test: Reward Claim with Fee-Vault Deposit
///
/// This test verifies that when players claim epoch rewards, the USDC is automatically
/// deposited into the fee-vault instead of being transferred directly to their wallet.
///
/// Key assertions:
/// 1. Player's USDC balance should NOT increase (USDC goes to vault)
/// 2. Contract calls vault.deposit() with player and reward amount
/// 3. Player receives vault shares (returned by deposit call)
///
/// Uses REAL FeeVault to verify actual deposit behavior.
use super::blend_utils::{create_blend_pool, EnvTestUtils};
use super::fee_vault_utils::{create_fee_vault, FeeVaultClient};
use super::soroswap_utils::{
    add_liquidity, create_factory, create_router, create_token, TokenClient,
};
use super::testutils::{create_ohloss_contract, setup_test_env};
use crate::OhlossClient;
use blend_contract_sdk::testutils::BlendFixture;
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{vec, Address, Env, Map};

// ============================================================================
// Test Setup Helpers
// ============================================================================

fn setup_reward_claim_env<'a>(
    env: &'a Env,
) -> (
    Address,            // game contract
    Address,            // fee vault address
    FeeVaultClient<'a>, // fee vault client
    OhlossClient<'a>,   // ohloss client
    TokenClient<'a>,    // USDC token client
    TokenClient<'a>,    // BLND token client
) {
    env.cost_estimate().budget().reset_unlimited();
    env.mock_all_auths();
    env.set_default_info();

    let admin = Address::generate(env);
    let game = Address::generate(env);

    // Create real tokens (used by both Blend and Soroswap)
    let blnd_token_client = create_token(env, &admin);
    let usdc_token_client = create_token(env, &admin);
    let blnd_token = blnd_token_client.address.clone();
    let usdc_token = usdc_token_client.address.clone();

    // Also create MockTokenClient for Blend pool creation
    let _blnd_client_mock = MockTokenClient::new(env, &blnd_token);
    let usdc_client_mock = MockTokenClient::new(env, &usdc_token);
    let xlm = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let xlm_client = MockTokenClient::new(env, &xlm);

    // Create Blend ecosystem
    let blend_fixture = BlendFixture::deploy(env, &admin, &blnd_token, &usdc_token);
    let pool = create_blend_pool(env, &blend_fixture, &admin, &usdc_client_mock, &xlm_client);

    // Create REAL FeeVault
    let fee_vault = create_fee_vault(env, &admin, &pool, &usdc_token, 0, 100_00000, None);

    // Setup Soroswap infrastructure
    let (token_a, token_b) = if blnd_token < usdc_token {
        (blnd_token.clone(), usdc_token.clone())
    } else {
        (usdc_token.clone(), blnd_token.clone())
    };

    let _factory = create_factory(env, &admin);
    let router_client = create_router(env);
    let router_address = router_client.address.clone();

    // Initialize router with factory (required!)
    router_client.initialize(&_factory.address);

    // Mint tokens to admin for liquidity
    blnd_token_client.mint(&admin, &20_000_000_0000000); // 20M tokens
    usdc_token_client.mint(&admin, &20_000_000_0000000);

    // Add liquidity to BLND/USDC pair
    add_liquidity(
        env,
        &router_client,
        &token_a,
        &token_b,
        10_000_000_0000000, // 10M tokens
        10_000_000_0000000,
        &admin,
    );

    let epoch_duration = 86400; // 1 day

    let ohloss = create_ohloss_contract(
        env,
        &admin,
        &fee_vault.address,
        &router_address,
        &blnd_token,
        &usdc_token,
        epoch_duration,
        vec![env, 1],
    );

    // Add game to whitelist (with developer address)
    let developer = Address::generate(env);
    ohloss.add_game(&game, &developer);

    (
        game,
        fee_vault.address.clone(),
        fee_vault,
        ohloss,
        usdc_token_client,
        blnd_token_client,
    )
}

// ============================================================================
// Reward Claim with Vault Deposit Tests
// ============================================================================

#[test]
fn test_claim_reward_deposits_to_vault() {
    let env = setup_test_env();
    let (game, _vault_addr, _fee_vault, ohloss, usdc_client, blnd_client) =
        setup_reward_claim_env(&env);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    // For this test, we manually create the epoch rather than playing games
    // This simplifies the setup and focuses on testing the claim reward flow

    // Manually create finalized epoch
    let reward_pool = 1000_0000000i128; // 1000 USDC
    let mut faction_standings = Map::new(&env);
    faction_standings.set(0, 500_0000000); // Faction 0 has 500 FP
    faction_standings.set(1, 300_0000000); // Faction 1 has 300 FP

    let epoch_info = crate::types::EpochInfo {
        start_time: 0,
        end_time: 86400,
        faction_standings: faction_standings.clone(),
        reward_pool,
        winning_faction: Some(0), // Faction 0 wins
        is_finalized: true,
        total_game_fp: 0,
        dev_reward_pool: 0,
    };

    env.as_contract(&ohloss.address, || {
        crate::storage::set_epoch(&env, 0, &epoch_info);
    });

    // Create player's epoch data (player is in winning faction)
    let player_fp = 250_0000000i128; // Player contributed 250 FP (half of faction 0's total)
    let epoch_player = crate::types::EpochPlayer {
        epoch_faction: Some(0),
        epoch_balance_snapshot: 1000_0000000,
        available_fp: 0,
        total_fp_contributed: player_fp,
    };

    env.as_contract(&ohloss.address, || {
        crate::storage::set_epoch_player(&env, 0, &player1, &epoch_player);
    });

    // Give the ohloss contract USDC for rewards
    usdc_client.mint(&ohloss.address, &reward_pool);

    // Give player vault balance to pass deposit gate (required for claiming)
    let deposit_amount = 10_0000000i128; // 10 USDC
    usdc_client.mint(&player1, &deposit_amount);
    _fee_vault.deposit(&player1, &deposit_amount);

    // Track balances BEFORE claim
    let usdc_before = usdc_client.balance(&player1);
    let shares_before = _fee_vault.get_shares(&player1);

    // ACT: Claim reward
    let claimed_amount = ohloss.claim_epoch_reward(&player1, &0);

    // ASSERT 1: Player should receive a reward (50% of pool)
    let expected_reward = reward_pool / 2; // 500 USDC
    assert_eq!(
        claimed_amount, expected_reward,
        "Player should receive 50% of reward pool"
    );

    // ASSERT 2: KEY TEST - Player's USDC wallet balance should NOT increase
    // With REAL FeeVault, USDC goes: contract → player → vault
    let usdc_after = usdc_client.balance(&player1);
    assert_eq!(
        usdc_after, usdc_before,
        "Player USDC balance should not change (deposited into vault)"
    );

    // ASSERT 3: Player should have vault shares (proof that deposit happened)
    let shares_after = _fee_vault.get_shares(&player1);
    assert!(
        shares_after > shares_before,
        "Player should have received vault shares"
    );

    // ASSERT 4: Player's underlying tokens in vault should equal claimed amount
    let underlying = _fee_vault.get_underlying_tokens(&player1);
    assert!(
        underlying >= claimed_amount,
        "Player's vault balance should be at least the claimed amount"
    );
}

#[test]
fn test_claim_reward_cannot_claim_twice() {
    let env = setup_test_env();
    let (_game, _vault_addr, _fee_vault, ohloss, usdc_client, _blnd_client) =
        setup_reward_claim_env(&env);

    let player1 = Address::generate(&env);

    // Manually finalize epoch (simpler than cycle_epoch with Soroswap)
    let reward_pool = 500_0000000i128;
    usdc_client.mint(&ohloss.address, &reward_pool);

    env.ledger().with_mut(|li| {
        li.timestamp += 86400 + 1;
    });

    // Manually create finalized epoch with faction standings
    let current_epoch_num = 0u32;
    let mut faction_standings = Map::new(&env);
    faction_standings.set(0, 500_0000000); // Faction 0 has 500 FP

    let epoch_info = crate::types::EpochInfo {
        start_time: 0,
        end_time: 86400,
        faction_standings,
        reward_pool,
        winning_faction: Some(0), // Faction 0 wins
        is_finalized: true,
        total_game_fp: 0,
        dev_reward_pool: 0,
    };

    env.as_contract(&ohloss.address, || {
        crate::storage::set_epoch(&env, current_epoch_num, &epoch_info);
    });

    // Create player's epoch data (player is in winning faction)
    let player_fp = 250_0000000i128; // Player contributed 250 FP
    let epoch_player = crate::types::EpochPlayer {
        epoch_faction: Some(0),
        epoch_balance_snapshot: 1000_0000000,
        available_fp: 0,
        total_fp_contributed: player_fp,
    };

    env.as_contract(&ohloss.address, || {
        crate::storage::set_epoch_player(&env, current_epoch_num, &player1, &epoch_player);
    });

    // Give player vault balance to pass deposit gate (required for claiming)
    let deposit_amount = 10_0000000i128; // 10 USDC
    usdc_client.mint(&player1, &deposit_amount);
    _fee_vault.deposit(&player1, &deposit_amount);

    // First claim should succeed
    let first_claim = ohloss.claim_epoch_reward(&player1, &0);
    assert!(first_claim > 0, "First claim should succeed");

    // Second claim should fail
    let second_claim_result = ohloss.try_claim_epoch_reward(&player1, &0);
    assert!(
        second_claim_result.is_err(),
        "Should not be able to claim twice"
    );
}

#[test]
fn test_claim_reward_proportional_distribution() {
    let env = setup_test_env();
    let (_game, _vault_addr, _fee_vault, ohloss, usdc_client, _blnd_client) =
        setup_reward_claim_env(&env);

    // Three players with different FP contributions
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let player3 = Address::generate(&env);

    // Manually finalize epoch (simpler than cycle_epoch with Soroswap)
    let total_rewards = 600_0000000i128; // 600 USDC
    usdc_client.mint(&ohloss.address, &total_rewards);

    env.ledger().with_mut(|li| {
        li.timestamp += 86400 + 1;
    });

    // Manually create finalized epoch
    let current_epoch_num = 0u32;
    let mut faction_standings = Map::new(&env);
    faction_standings.set(0, 300_0000000); // Total FP for faction 0

    let epoch_info = crate::types::EpochInfo {
        start_time: 0,
        end_time: 86400,
        faction_standings,
        reward_pool: total_rewards,
        winning_faction: Some(0), // Faction 0 wins
        is_finalized: true,
        total_game_fp: 0,
        dev_reward_pool: 0,
    };

    env.as_contract(&ohloss.address, || {
        crate::storage::set_epoch(&env, current_epoch_num, &epoch_info);
    });

    // Create epoch player data: player1 has 100 FP, player2 has 200 FP (2x player1)
    let player1_fp = 100_0000000i128;
    let player2_fp = 200_0000000i128;

    let epoch_player1 = crate::types::EpochPlayer {
        epoch_faction: Some(0),
        epoch_balance_snapshot: 1000_0000000,
        available_fp: 0,
        total_fp_contributed: player1_fp,
    };

    let epoch_player2 = crate::types::EpochPlayer {
        epoch_faction: Some(0),
        epoch_balance_snapshot: 2000_0000000,
        available_fp: 0,
        total_fp_contributed: player2_fp,
    };

    env.as_contract(&ohloss.address, || {
        crate::storage::set_epoch_player(&env, current_epoch_num, &player1, &epoch_player1);
        crate::storage::set_epoch_player(&env, current_epoch_num, &player2, &epoch_player2);
    });

    // Give players vault balance to pass deposit gate (required for claiming)
    let deposit_amount = 10_0000000i128; // 10 USDC
    usdc_client.mint(&player1, &deposit_amount);
    usdc_client.mint(&player2, &deposit_amount);
    _fee_vault.deposit(&player1, &deposit_amount);
    _fee_vault.deposit(&player2, &deposit_amount);

    // Claim rewards
    let reward1 = ohloss.claim_epoch_reward(&player1, &0);
    let reward2 = ohloss.claim_epoch_reward(&player2, &0);

    // player3 should fail to claim (no FP contributed)
    let reward3_result = ohloss.try_claim_epoch_reward(&player3, &0);
    assert!(
        reward3_result.is_err(),
        "Player with 0 FP should not be able to claim"
    );

    // Verify proportional distribution
    // player2 contributed 2x the FP of player1, so should get ~2x the rewards
    // (with rounding, might not be exact)
    assert!(
        reward2 > reward1,
        "Player2 should get more rewards than player1"
    );

    // Rough check: reward2 should be approximately 2x reward1
    let ratio = reward2 / reward1;
    assert!(
        ratio >= 1 && ratio <= 3,
        "Reward ratio should be roughly 2:1"
    );

    // Total claimed should be <= total rewards (accounting for rounding)
    let total_claimed = reward1 + reward2;
    assert!(
        total_claimed <= total_rewards,
        "Total claimed should not exceed reward pool"
    );
}
