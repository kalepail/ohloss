/// Developer Reward Distribution Tests
///
/// Tests for the game developer reward system where developers earn a share
/// (configurable, default 10%) of epoch rewards based on total FP contributed
/// through their games.
///
/// Key flows tested:
/// - Basic dev reward claiming
/// - Multiple games sharing dev reward pool
/// - Proportional distribution based on game FP contributions
/// - Edge cases: removed games, developer changes, zero contributions
use super::fee_vault_utils::{create_mock_vault, MockVaultClient};
use super::testutils::{
    assert_contract_error, create_ohloss_contract_with_free_play, setup_test_env, Error,
};
use crate::OhlossClient;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{vec, Address, Env};

// ============================================================================
// Test Setup Helpers
// ============================================================================

/// Sets up a test environment with Soroswap for dev reward testing
fn setup_dev_reward_test_env<'a>(
    env: &'a Env,
) -> (
    Address,                                // admin
    MockVaultClient<'a>,                    // mock vault
    OhlossClient<'a>,                       // ohloss client
    super::soroswap_utils::TokenClient<'a>, // BLND token client
    super::soroswap_utils::TokenClient<'a>, // USDC token client
) {
    use super::soroswap_utils::{add_liquidity, create_factory, create_router, create_token};

    let admin = Address::generate(env);

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

    // Create with default dev_reward_share (10%)
    let ohloss = create_ohloss_contract_with_free_play(
        env,
        &admin,
        &mock_vault_addr,
        &router.address,
        &blnd_token,
        &usdc_token,
        epoch_duration,
        reserve_token_ids,
        100_0000000, // free_fp_per_epoch
        1_0000000,   // min_deposit_to_claim
    );

    (
        admin,
        mock_vault,
        ohloss,
        blnd_token_client,
        usdc_token_client,
    )
}

// ============================================================================
// Basic Dev Reward Tests
// ============================================================================

/// Test basic dev reward claiming flow
///
/// Verifies that:
/// 1. Developer can claim rewards after epoch is finalized
/// 2. Reward amount is calculated correctly based on FP contribution
/// 3. USDC is transferred to developer
#[test]
fn test_basic_dev_reward_claim() {
    let env = setup_test_env();
    let (_admin, mock_vault, ohloss, blnd_token, usdc_token) = setup_dev_reward_test_env(&env);

    // Register game with developer
    let game_contract = Address::generate(&env);
    let developer = Address::generate(&env);
    ohloss.add_game(&game_contract, &developer);

    // Setup players
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);

    ohloss.select_faction(&p1, &0);
    ohloss.select_faction(&p2, &1);

    mock_vault.set_user_balance(&p1, &1000_0000000);
    mock_vault.set_user_balance(&p2, &1000_0000000);

    // Mint BLND to contract for reward pool
    blnd_token.mint(&ohloss.address, &5000_0000000);

    // Play game
    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    ohloss.start_game(&game_contract, &1, &p1, &p2, &100_0000000, &100_0000000);
    ohloss.end_game(&1, &true);

    // Cycle epoch
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    // Check epoch has dev_reward_pool
    let epoch_info = ohloss.get_epoch(&0);
    assert!(
        epoch_info.dev_reward_pool > 0,
        "Dev reward pool should be positive after epoch cycle"
    );
    assert!(
        epoch_info.total_game_fp > 0,
        "Total game FP should be tracked"
    );

    // Track developer USDC balance before claim
    let usdc_client = super::soroswap_utils::TokenClient::new(&env, &usdc_token.address);
    let dev_balance_before = usdc_client.balance(&developer);

    // Developer claims reward (now using developer address, not game_contract)
    let reward = ohloss.claim_dev_reward(&developer, &0);

    // Verify reward
    assert!(reward > 0, "Developer should receive reward");

    // Developer's USDC balance should increase
    let dev_balance_after = usdc_client.balance(&developer);
    assert_eq!(
        dev_balance_after - dev_balance_before,
        reward,
        "Developer should receive USDC transfer"
    );
}

/// Test that dev reward is proportional to game's FP contribution
#[test]
fn test_dev_reward_proportional_to_game_fp() {
    let env = setup_test_env();
    let (_admin, mock_vault, ohloss, blnd_token, _usdc_token) = setup_dev_reward_test_env(&env);

    // Register two games with different developers
    let game1 = Address::generate(&env);
    let game2 = Address::generate(&env);
    let dev1 = Address::generate(&env);
    let dev2 = Address::generate(&env);
    ohloss.add_game(&game1, &dev1);
    ohloss.add_game(&game2, &dev2);

    // Setup players
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let p3 = Address::generate(&env);
    let p4 = Address::generate(&env);

    ohloss.select_faction(&p1, &0);
    ohloss.select_faction(&p2, &1);
    ohloss.select_faction(&p3, &0);
    ohloss.select_faction(&p4, &1);

    mock_vault.set_user_balance(&p1, &1000_0000000);
    mock_vault.set_user_balance(&p2, &1000_0000000);
    mock_vault.set_user_balance(&p3, &1000_0000000);
    mock_vault.set_user_balance(&p4, &1000_0000000);

    // Mint BLND to contract for reward pool
    blnd_token.mint(&ohloss.address, &5000_0000000);

    // Play games
    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    // Game1: One game with 100 FP wagers (total 200 FP = 100 + 100)
    ohloss.start_game(&game1, &1, &p1, &p2, &100_0000000, &100_0000000);
    ohloss.end_game(&1, &true);

    // Game2: Two games with 100 FP wagers each (total 400 FP)
    ohloss.start_game(&game2, &2, &p3, &p4, &100_0000000, &100_0000000);
    ohloss.end_game(&2, &true);

    ohloss.start_game(&game2, &3, &p3, &p4, &100_0000000, &100_0000000);
    ohloss.end_game(&3, &true);

    // Cycle epoch
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    // Claim dev rewards (using developer addresses)
    let reward1 = ohloss.claim_dev_reward(&dev1, &0);
    let reward2 = ohloss.claim_dev_reward(&dev2, &0);

    // Game2 had 2x the FP contribution, should get ~2x the reward
    let ratio = reward2 as f64 / reward1 as f64;
    assert!(
        ratio > 1.9 && ratio < 2.1,
        "Game2 should get ~2x the reward of Game1. ratio={}",
        ratio
    );

    // Total should not exceed dev_reward_pool
    let epoch_info = ohloss.get_epoch(&0);
    assert!(
        reward1 + reward2 <= epoch_info.dev_reward_pool,
        "Total dev rewards should not exceed pool"
    );
}

// ============================================================================
// Edge Case Tests
// ============================================================================

/// Test that dev cannot claim twice for the same epoch
#[test]
fn test_dev_cannot_claim_twice() {
    let env = setup_test_env();
    let (_admin, mock_vault, ohloss, blnd_token, _usdc_token) = setup_dev_reward_test_env(&env);

    let game_contract = Address::generate(&env);
    let developer = Address::generate(&env);
    ohloss.add_game(&game_contract, &developer);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    ohloss.select_faction(&p1, &0);
    ohloss.select_faction(&p2, &1);
    mock_vault.set_user_balance(&p1, &1000_0000000);
    mock_vault.set_user_balance(&p2, &1000_0000000);

    blnd_token.mint(&ohloss.address, &5000_0000000);

    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    ohloss.start_game(&game_contract, &1, &p1, &p2, &100_0000000, &100_0000000);
    ohloss.end_game(&1, &true);

    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    // First claim succeeds (using developer address)
    let reward = ohloss.claim_dev_reward(&developer, &0);
    assert!(reward > 0);

    // Second claim should fail
    let result = ohloss.try_claim_dev_reward(&developer, &0);
    assert_contract_error(&result, Error::DevRewardAlreadyClaimed);
}

/// Test that cannot claim dev reward before epoch is finalized
#[test]
fn test_dev_cannot_claim_before_epoch_finalized() {
    let env = setup_test_env();
    let (_admin, mock_vault, ohloss, blnd_token, _usdc_token) = setup_dev_reward_test_env(&env);

    let game_contract = Address::generate(&env);
    let developer = Address::generate(&env);
    ohloss.add_game(&game_contract, &developer);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    ohloss.select_faction(&p1, &0);
    ohloss.select_faction(&p2, &1);
    mock_vault.set_user_balance(&p1, &1000_0000000);
    mock_vault.set_user_balance(&p2, &1000_0000000);

    blnd_token.mint(&ohloss.address, &5000_0000000);

    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    ohloss.start_game(&game_contract, &1, &p1, &p2, &100_0000000, &100_0000000);
    ohloss.end_game(&1, &true);

    // Try to claim BEFORE epoch cycle - should fail (using developer address)
    let result = ohloss.try_claim_dev_reward(&developer, &0);
    assert_contract_error(&result, Error::EpochNotFinalized);
}

/// Test that developer with no contributions cannot claim
#[test]
fn test_game_no_contributions_cannot_claim() {
    let env = setup_test_env();
    let (_admin, mock_vault, ohloss, blnd_token, _usdc_token) = setup_dev_reward_test_env(&env);

    // Register two games with different developers
    let game1 = Address::generate(&env);
    let game2 = Address::generate(&env); // This one won't have any games played
    let dev1 = Address::generate(&env);
    let dev2 = Address::generate(&env);
    ohloss.add_game(&game1, &dev1);
    ohloss.add_game(&game2, &dev2);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    ohloss.select_faction(&p1, &0);
    ohloss.select_faction(&p2, &1);
    mock_vault.set_user_balance(&p1, &1000_0000000);
    mock_vault.set_user_balance(&p2, &1000_0000000);

    blnd_token.mint(&ohloss.address, &5000_0000000);

    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    // Only play on game1
    ohloss.start_game(&game1, &1, &p1, &p2, &100_0000000, &100_0000000);
    ohloss.end_game(&1, &true);

    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    // Dev1 can claim (using developer address)
    let reward = ohloss.claim_dev_reward(&dev1, &0);
    assert!(reward > 0);

    // Dev2 cannot claim (no contributions from their game)
    let result = ohloss.try_claim_dev_reward(&dev2, &0);
    assert_contract_error(&result, Error::GameNoContributions);
}

/// Test that developer CAN claim after game is removed
///
/// With per-developer tracking, FP contributions are recorded to the developer
/// address, not the game address. So even if a game is removed mid-epoch,
/// the developer who owned it keeps their earned FP and can claim rewards.
#[test]
fn test_removed_game_developer_can_still_claim() {
    let env = setup_test_env();
    let (_admin, mock_vault, ohloss, blnd_token, usdc_token) = setup_dev_reward_test_env(&env);

    let game_contract = Address::generate(&env);
    let developer = Address::generate(&env);
    ohloss.add_game(&game_contract, &developer);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    ohloss.select_faction(&p1, &0);
    ohloss.select_faction(&p2, &1);
    mock_vault.set_user_balance(&p1, &1000_0000000);
    mock_vault.set_user_balance(&p2, &1000_0000000);

    blnd_token.mint(&ohloss.address, &5000_0000000);

    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    ohloss.start_game(&game_contract, &1, &p1, &p2, &100_0000000, &100_0000000);
    ohloss.end_game(&1, &true);

    // Remove game BEFORE epoch cycle - this no longer affects dev claims
    ohloss.remove_game(&game_contract);

    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    // Track developer USDC balance before claim
    let usdc_client = super::soroswap_utils::TokenClient::new(&env, &usdc_token.address);
    let dev_balance_before = usdc_client.balance(&developer);

    // Developer CAN still claim - FP was recorded to their address
    let reward = ohloss.claim_dev_reward(&developer, &0);
    assert!(
        reward > 0,
        "Developer should still receive reward after game removal"
    );

    // Verify USDC was transferred
    let dev_balance_after = usdc_client.balance(&developer);
    assert_eq!(
        dev_balance_after - dev_balance_before,
        reward,
        "Developer should receive USDC transfer"
    );
}

/// Test that mid-epoch developer change gives fair split of rewards
///
/// With per-developer tracking, FP earned BEFORE developer change goes to
/// original developer, FP earned AFTER change goes to new developer.
/// This is fairer than the old system where the new developer got everything.
#[test]
fn test_developer_change_gives_fair_split() {
    let env = setup_test_env();
    let (_admin, mock_vault, ohloss, blnd_token, usdc_token) = setup_dev_reward_test_env(&env);

    let game_contract = Address::generate(&env);
    let original_dev = Address::generate(&env);
    let new_dev = Address::generate(&env);

    ohloss.add_game(&game_contract, &original_dev);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    ohloss.select_faction(&p1, &0);
    ohloss.select_faction(&p2, &1);
    mock_vault.set_user_balance(&p1, &1000_0000000);
    mock_vault.set_user_balance(&p2, &1000_0000000);

    blnd_token.mint(&ohloss.address, &5000_0000000);

    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    // First game - FP goes to original_dev
    ohloss.start_game(&game_contract, &1, &p1, &p2, &100_0000000, &100_0000000);
    ohloss.end_game(&1, &true);

    // Change developer by re-adding game with new developer
    ohloss.add_game(&game_contract, &new_dev);

    // Second game - FP goes to new_dev
    ohloss.start_game(&game_contract, &2, &p1, &p2, &100_0000000, &100_0000000);
    ohloss.end_game(&2, &true);

    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    // Track balances
    let usdc_client = super::soroswap_utils::TokenClient::new(&env, &usdc_token.address);
    let original_dev_balance_before = usdc_client.balance(&original_dev);
    let new_dev_balance_before = usdc_client.balance(&new_dev);

    // Original developer claims their portion (from game 1)
    let original_reward = ohloss.claim_dev_reward(&original_dev, &0);
    assert!(
        original_reward > 0,
        "Original dev should have reward from game 1"
    );

    // New developer claims their portion (from game 2)
    let new_reward = ohloss.claim_dev_reward(&new_dev, &0);
    assert!(new_reward > 0, "New dev should have reward from game 2");

    // Both should have received roughly equal rewards (since both games had same wagers)
    let original_dev_balance_after = usdc_client.balance(&original_dev);
    let new_dev_balance_after = usdc_client.balance(&new_dev);

    assert_eq!(
        original_dev_balance_after - original_dev_balance_before,
        original_reward,
        "Original dev should receive their USDC"
    );

    assert_eq!(
        new_dev_balance_after - new_dev_balance_before,
        new_reward,
        "New dev should receive their USDC"
    );

    // Rewards should be roughly equal since both games had same FP
    let ratio = original_reward as f64 / new_reward as f64;
    assert!(
        ratio > 0.9 && ratio < 1.1,
        "Both devs should get roughly equal rewards. Ratio={}",
        ratio
    );
}

/// Test that address with no contributions cannot claim
///
/// Any random address trying to claim will get GameNoContributions
/// since they have no FP recorded in any epoch.
#[test]
fn test_address_with_no_contributions_cannot_claim() {
    let env = setup_test_env();
    let (_admin, mock_vault, ohloss, blnd_token, _usdc_token) = setup_dev_reward_test_env(&env);

    // Register a game with a real developer
    let game_contract = Address::generate(&env);
    let real_developer = Address::generate(&env);
    ohloss.add_game(&game_contract, &real_developer);

    // Setup players
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    ohloss.select_faction(&p1, &0);
    ohloss.select_faction(&p2, &1);
    mock_vault.set_user_balance(&p1, &1000_0000000);
    mock_vault.set_user_balance(&p2, &1000_0000000);

    blnd_token.mint(&ohloss.address, &5000_0000000);

    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    // Play a game so there's activity in the epoch
    ohloss.start_game(&game_contract, &1, &p1, &p2, &100_0000000, &100_0000000);
    ohloss.end_game(&1, &true);

    // Cycle the epoch so it's finalized
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    // Random address that was never a developer for any game
    let random_address = Address::generate(&env);

    let result = ohloss.try_claim_dev_reward(&random_address, &0);
    assert_contract_error(&result, Error::GameNoContributions);
}

// ============================================================================
// Pool Distribution Tests
// ============================================================================

/// Test that dev_reward_pool is correctly calculated from reward_pool
#[test]
fn test_dev_reward_pool_calculation() {
    let env = setup_test_env();
    let (_admin, mock_vault, ohloss, blnd_token, _usdc_token) = setup_dev_reward_test_env(&env);

    let game_contract = Address::generate(&env);
    let developer = Address::generate(&env);
    ohloss.add_game(&game_contract, &developer);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    ohloss.select_faction(&p1, &0);
    ohloss.select_faction(&p2, &1);
    mock_vault.set_user_balance(&p1, &1000_0000000);
    mock_vault.set_user_balance(&p2, &1000_0000000);

    blnd_token.mint(&ohloss.address, &5000_0000000);

    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    ohloss.start_game(&game_contract, &1, &p1, &p2, &100_0000000, &100_0000000);
    ohloss.end_game(&1, &true);

    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    let epoch_info = ohloss.get_epoch(&0);

    // With default 10% dev_reward_share:
    // dev_reward_pool should be ~10% of total rewards before split
    // reward_pool (player pool) should be ~90% of total rewards
    let total_rewards = epoch_info.reward_pool + epoch_info.dev_reward_pool;

    if total_rewards > 0 {
        let dev_share_pct = (epoch_info.dev_reward_pool as f64 / total_rewards as f64) * 100.0;
        assert!(
            dev_share_pct > 9.0 && dev_share_pct < 11.0,
            "Dev pool should be ~10% of total. Got {}%",
            dev_share_pct
        );
    }
}

/// Test total dev claims do not exceed dev_reward_pool
#[test]
fn test_total_dev_claims_not_exceed_pool() {
    let env = setup_test_env();
    let (_admin, mock_vault, ohloss, blnd_token, _usdc_token) = setup_dev_reward_test_env(&env);

    // Create multiple games
    let mut games = soroban_sdk::Vec::new(&env);
    let mut devs = soroban_sdk::Vec::new(&env);
    for _ in 0..5 {
        let game = Address::generate(&env);
        let dev = Address::generate(&env);
        ohloss.add_game(&game, &dev);
        games.push_back(game);
        devs.push_back(dev);
    }

    // Setup players
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    ohloss.select_faction(&p1, &0);
    ohloss.select_faction(&p2, &1);
    mock_vault.set_user_balance(&p1, &5000_0000000);
    mock_vault.set_user_balance(&p2, &5000_0000000);

    blnd_token.mint(&ohloss.address, &10000_0000000);

    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    // Play games on each game contract
    for i in 0..5 {
        let game = games.get(i).unwrap();
        let session_id = (i + 1) as u32;
        ohloss.start_game(&game, &session_id, &p1, &p2, &100_0000000, &100_0000000);
        ohloss.end_game(&session_id, &true);
    }

    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    let epoch_info = ohloss.get_epoch(&0);
    let dev_reward_pool = epoch_info.dev_reward_pool;

    // All devs claim (using developer addresses)
    let mut total_claimed = 0i128;
    for i in 0..5 {
        let dev = devs.get(i).unwrap();
        let reward = ohloss.claim_dev_reward(&dev, &0);
        total_claimed += reward;
    }

    assert!(
        total_claimed <= dev_reward_pool,
        "Total dev claims {} should not exceed pool {}",
        total_claimed,
        dev_reward_pool
    );

    // There should be minimal dust due to rounding
    let dust = dev_reward_pool - total_claimed;
    assert!(
        dust < dev_reward_pool / 100,
        "Dust should be small (<1% of pool)"
    );
}
