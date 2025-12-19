/// Simple Test: Verify Rewards are Deposited to Vault
///
/// This test focuses ONLY on verifying that when claim_epoch_reward is called,
/// the USDC is deposited into the fee-vault instead of transferred directly.
///
/// We bypass the complex Soroswap setup by directly creating a finalized epoch.
/// Uses REAL FeeVault to verify actual deposit behavior.
use super::blend_utils::{create_blend_pool, EnvTestUtils};
use super::fee_vault_utils::create_fee_vault;
use super::testutils::{create_ohloss_contract, setup_test_env};
use crate::types::{EpochInfo, EpochPlayer};
use blend_contract_sdk::testutils::BlendFixture;
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{vec, Address, Map};

#[test]
fn test_claim_reward_goes_to_vault_not_player_wallet() {
    let env = setup_test_env();
    env.cost_estimate().budget().reset_unlimited();
    env.mock_all_auths();
    env.set_default_info();

    let admin = Address::generate(&env);
    let player = Address::generate(&env);

    // Create tokens
    let blnd = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let usdc = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let xlm = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();

    let _blnd_client = MockTokenClient::new(&env, &blnd);
    let usdc_client = MockTokenClient::new(&env, &usdc);
    let xlm_client = MockTokenClient::new(&env, &xlm);

    // Create Blend ecosystem
    let blend_fixture = BlendFixture::deploy(&env, &admin, &blnd, &usdc);
    let pool = create_blend_pool(&env, &blend_fixture, &admin, &usdc_client, &xlm_client);

    // Create REAL FeeVault
    let fee_vault = create_fee_vault(&env, &admin, &pool, &usdc, 0, 100_00000, None);

    // Create minimal ohloss contract (Soroswap not needed for this test)
    let soroswap_router = Address::generate(&env);

    let ohloss = create_ohloss_contract(
        &env,
        &admin,
        &fee_vault.address,
        &soroswap_router,
        &blnd,
        &usdc,
        86400,
        vec![&env, 1],
    );

    // Manually create a finalized epoch with a reward pool
    // This bypasses the need for cycle_epoch and all the Soroswap complexity
    let reward_pool = 1000_0000000i128; // 1000 USDC
    let mut faction_standings = Map::new(&env);
    faction_standings.set(0, 500_0000000); // Faction 0 has 500 FP
    faction_standings.set(1, 300_0000000); // Faction 1 has 300 FP

    let epoch_info = EpochInfo {
        start_time: 0,
        end_time: 86400,
        faction_standings: faction_standings.clone(),
        reward_pool,
        winning_faction: Some(0), // Faction 0 wins
        is_finalized: true,
        total_game_fp: 0,
        dev_reward_pool: 0,
    };

    // Manually store the epoch
    env.as_contract(&ohloss.address, || {
        crate::storage::set_epoch(&env, 0, &epoch_info);
    });

    // Create player's epoch data (player is in winning faction)
    let player_fp = 250_0000000i128; // Player contributed 250 FP (half of faction 0's total)
    let epoch_player = EpochPlayer {
        epoch_faction: Some(0),
        epoch_balance_snapshot: 1000_0000000,
        available_fp: 0,
        total_fp_contributed: player_fp,
    };

    // Manually store player's epoch data
    env.as_contract(&ohloss.address, || {
        crate::storage::set_epoch_player(&env, 0, &player, &epoch_player);
    });

    // Give the ohloss contract USDC for rewards
    usdc_client.mint(&ohloss.address, &reward_pool);

    // Give player vault balance to pass deposit gate (required for claiming)
    let deposit_amount = 10_0000000i128; // 10 USDC
    usdc_client.mint(&player, &deposit_amount);
    fee_vault.deposit(&player, &deposit_amount);

    // Track player's USDC balance and vault shares BEFORE claim
    let usdc_before = usdc_client.balance(&player);
    let shares_before = fee_vault.get_shares(&player);

    // ACT: Claim reward
    let claimed_amount = ohloss.claim_epoch_reward(&player, &0);

    // ASSERT 1: Player should receive a reward (50% of pool since they have 50% of winning faction FP)
    let expected_reward = reward_pool / 2; // 500 USDC
    assert_eq!(
        claimed_amount, expected_reward,
        "Player should receive 50% of reward pool"
    );

    // ASSERT 2: KEY TEST - Player's USDC wallet balance should NOT increase
    // With REAL FeeVault, USDC goes: contract → player → vault
    let usdc_after = usdc_client.balance(&player);
    assert_eq!(
        usdc_after, usdc_before,
        "Player USDC balance should not change (deposited into vault)"
    );

    // ASSERT 3: Player should have vault shares (proof that deposit happened)
    let shares_after = fee_vault.get_shares(&player);
    assert!(
        shares_after > shares_before,
        "Player should have received vault shares"
    );

    // ASSERT 4: Contract balance should have decreased
    let contract_usdc_after = usdc_client.balance(&ohloss.address);
    assert_eq!(
        contract_usdc_after,
        reward_pool - claimed_amount,
        "Contract should have transferred USDC out"
    );

    // ASSERT 5: Player's underlying tokens in vault should equal claimed amount
    let underlying = fee_vault.get_underlying_tokens(&player);
    assert!(
        underlying >= claimed_amount,
        "Player's vault balance should be at least the claimed amount"
    );
}

#[test]
fn test_cannot_claim_twice() {
    let env = setup_test_env();
    env.cost_estimate().budget().reset_unlimited();
    env.mock_all_auths();
    env.set_default_info();

    let admin = Address::generate(&env);
    let player = Address::generate(&env);

    // Create tokens
    let blnd = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let usdc = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let xlm = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();

    let usdc_client = MockTokenClient::new(&env, &usdc);
    let xlm_client = MockTokenClient::new(&env, &xlm);

    // Create Blend ecosystem
    let blend_fixture = BlendFixture::deploy(&env, &admin, &blnd, &usdc);
    let pool = create_blend_pool(&env, &blend_fixture, &admin, &usdc_client, &xlm_client);

    // Create REAL FeeVault
    let fee_vault = create_fee_vault(&env, &admin, &pool, &usdc, 0, 100_00000, None);
    let soroswap_router = Address::generate(&env);

    let ohloss = create_ohloss_contract(
        &env,
        &admin,
        &fee_vault.address,
        &soroswap_router,
        &blnd,
        &usdc,
        86400,
        vec![&env, 1],
    );

    // Setup finalized epoch
    let reward_pool = 1000_0000000i128;
    let mut faction_standings = Map::new(&env);
    faction_standings.set(0, 500_0000000);

    let epoch_info = EpochInfo {
        start_time: 0,
        end_time: 86400,
        faction_standings,
        reward_pool,
        winning_faction: Some(0),
        is_finalized: true,
        total_game_fp: 0,
        dev_reward_pool: 0,
    };

    env.as_contract(&ohloss.address, || {
        crate::storage::set_epoch(&env, 0, &epoch_info);
    });

    let epoch_player = EpochPlayer {
        epoch_faction: Some(0),
        epoch_balance_snapshot: 1000_0000000,
        available_fp: 0,
        total_fp_contributed: 250_0000000,
    };

    env.as_contract(&ohloss.address, || {
        crate::storage::set_epoch_player(&env, 0, &player, &epoch_player);
    });

    usdc_client.mint(&ohloss.address, &reward_pool);

    // Give player vault balance to pass deposit gate (required for claiming)
    let deposit_amount = 10_0000000i128; // 10 USDC
    usdc_client.mint(&player, &deposit_amount);
    fee_vault.deposit(&player, &deposit_amount);

    // First claim should succeed
    let first_claim = ohloss.claim_epoch_reward(&player, &0);
    assert!(first_claim > 0, "First claim should succeed");

    // Second claim should fail
    let second_claim_result = ohloss.try_claim_epoch_reward(&player, &0);
    assert!(
        second_claim_result.is_err(),
        "Should not be able to claim twice"
    );
}
