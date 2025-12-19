/// Reward Distribution Edge Case Tests - HIGH PRIORITY
///
/// Reward formula: reward = reward_pool × (player_fp / total_fp)
/// Both operations use floor rounding (favors protocol).
///
/// Critical invariants:
/// - sum(claimed_rewards) <= reward_pool (no overpayment)
/// - Rewards proportional to FP contribution
/// - Edge cases: zero pool, single winner, many winners, small amounts
use super::fee_vault_utils::{create_mock_vault, MockVaultClient};
use super::testutils::{create_ohloss_contract, setup_test_env};
use crate::OhlossClient;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{vec, Address, Env, Vec};

// ============================================================================
// Test Setup Helpers
// ============================================================================

fn setup_reward_test_env<'a>(
    env: &'a Env,
) -> (
    Address,
    Address,
    MockVaultClient<'a>,
    OhlossClient<'a>,
    super::soroswap_utils::TokenClient<'a>, // BLND token client
) {
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

    (
        game_contract,
        mock_vault_addr,
        mock_vault,
        ohloss,
        blnd_token_client,
    )
}

// ============================================================================
// Reward Distribution Tests
// ============================================================================

/// Test multiple winners share rewards proportionally
///
/// Verifies that when multiple players on winning faction have contributed FP,
/// they each get proportional rewards based on their FP share.
#[test]
fn test_multiple_winners_share_rewards() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss, blnd_token) = setup_reward_test_env(&env);

    // Mint BLND to contract for reward pool (will be swapped to USDC during epoch cycle)
    blnd_token.mint(&ohloss.address, &5000_0000000);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let p3 = Address::generate(&env);
    let opponent = Address::generate(&env);

    // All on same faction
    ohloss.select_faction(&p1, &0); // WholeNoodle
    ohloss.select_faction(&p2, &0); // WholeNoodle
    ohloss.select_faction(&p3, &0); // WholeNoodle
    ohloss.select_faction(&opponent, &1); // PointyStick

    // Different deposits for different FP amounts
    mock_vault.set_user_balance(&p1, &1000_0000000);
    mock_vault.set_user_balance(&p2, &2000_0000000);
    mock_vault.set_user_balance(&p3, &3000_0000000);
    mock_vault.set_user_balance(&opponent, &1000_0000000);

    // Play games to establish FP
    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    // P1, P2, P3 all win their games (contribute FP)
    // Wager amounts proportional to balance: P1=100, P2=200, P3=300
    ohloss.start_game(
        &game_contract,
        &1,
        &p1,
        &opponent,
        &100_0000000,
        &100_0000000,
    );
    ohloss.end_game(&1, &true);

    ohloss.start_game(
        &game_contract,
        &2,
        &p2,
        &opponent,
        &200_0000000,
        &100_0000000,
    );
    ohloss.end_game(&2, &true);

    ohloss.start_game(
        &game_contract,
        &3,
        &p3,
        &opponent,
        &300_0000000,
        &100_0000000,
    );
    ohloss.end_game(&3, &true);

    // Get FP contributions
    let current_epoch = ohloss.get_current_epoch();
    let p1_epoch = ohloss.get_epoch_player(&current_epoch, &p1);
    let p2_epoch = ohloss.get_epoch_player(&current_epoch, &p2);
    let p3_epoch = ohloss.get_epoch_player(&current_epoch, &p3);

    let p1_fp = p1_epoch.total_fp_contributed;
    let p2_fp = p2_epoch.total_fp_contributed;
    let p3_fp = p3_epoch.total_fp_contributed;

    // P2 should have ~2x P1's FP (2x wager)
    // P3 should have ~3x P1's FP (3x wager)
    // (Note: wagers are in FP, already with multipliers applied)

    // Cycle epoch (requires waiting 4 days)
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    let epoch_info = ohloss.get_epoch(&0);
    let reward_pool = epoch_info.reward_pool;

    // Claim rewards
    let r1 = ohloss.claim_epoch_reward(&p1, &0);
    let r2 = ohloss.claim_epoch_reward(&p2, &0);
    let r3 = ohloss.claim_epoch_reward(&p3, &0);

    // Verify proportionality (within rounding error)
    // P2 should get ~2x P1's reward
    // P3 should get ~3x P1's reward
    assert!(
        r2 > r1,
        "P2 should get more than P1. r1={}, r2={}, r3={}, p1_fp={}, p2_fp={}, p3_fp={}, reward_pool={}",
        r1, r2, r3, p1_fp, p2_fp, p3_fp, reward_pool
    );
    assert!(r3 > r2, "P3 should get more than P2");

    // Total should not exceed pool
    assert!(r1 + r2 + r3 <= reward_pool);

    // Check approximate ratios (accounting for rounding)
    let ratio_2_1 = r2 as f64 / r1 as f64;
    let ratio_3_1 = r3 as f64 / r1 as f64;

    // Should be approximately 2:1 and 3:1 (within 10% due to rounding)
    assert!(ratio_2_1 > 1.8 && ratio_2_1 < 2.2);
    assert!(ratio_3_1 > 2.7 && ratio_3_1 < 3.3);
}

/// Test reward distribution sums to reward pool (or less due to rounding)
///
/// CRITICAL INVARIANT: sum(claimed) <= reward_pool
/// This prevents protocol insolvency from overpaying.
#[test]
fn test_reward_distribution_sums_to_pool() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss, blnd_token) = setup_reward_test_env(&env);

    // Mint BLND to contract for reward pool
    blnd_token.mint(&ohloss.address, &5000_0000000);

    let mut players = Vec::new(&env);
    let opponent = Address::generate(&env);

    // Create 10 players with various deposit amounts
    for i in 0..10 {
        let player = Address::generate(&env);
        ohloss.select_faction(&player, &0); // WholeNoodle

        let amount = ((i + 1) as i128) * 100_0000000; // 100, 200, ..., 1000 USDC
        mock_vault.set_user_balance(&player, &amount);

        players.push_back(player);
    }

    ohloss.select_faction(&opponent, &1); // PointyStick
    mock_vault.set_user_balance(&opponent, &10000_0000000);

    // All play games
    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    for i in 0..10 {
        let session_id = (i + 1) as u32;
        let player = players.get(i as u32).unwrap();

        ohloss.start_game(
            &game_contract,
            &session_id,
            &player,
            &opponent,
            &50_0000000,
            &50_0000000,
        );

        ohloss.end_game(&session_id, &true);
    }

    // Cycle epoch
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    let epoch_info = ohloss.get_epoch(&0);
    let reward_pool = epoch_info.reward_pool;

    // All claim rewards
    let mut total_claimed = 0i128;
    for i in 0..10 {
        let reward = ohloss.claim_epoch_reward(&players.get(i as u32).unwrap(), &0);
        total_claimed += reward;
    }

    // CRITICAL: Total claimed must not exceed pool
    assert!(
        total_claimed <= reward_pool,
        "Total claimed {} exceeds reward pool {}",
        total_claimed,
        reward_pool
    );

    // There should be some dust due to floor rounding
    let dust = reward_pool - total_claimed;
    assert!(dust >= 0);
    assert!(
        dust < reward_pool / 100,
        "Dust should be small (<1% of pool)"
    );
}

/// Test zero reward pool handling
///
/// If epoch ends with zero rewards (no yield generated), claiming should
/// either return 0 or fail gracefully.
#[test]
fn test_zero_reward_pool_handling() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss, _blnd_token) = setup_reward_test_env(&env);

    let player = Address::generate(&env);
    let opponent = Address::generate(&env);

    ohloss.select_faction(&player, &0); // WholeNoodle
    ohloss.select_faction(&opponent, &1); // PointyStick

    mock_vault.set_user_balance(&player, &1000_0000000);
    mock_vault.set_user_balance(&opponent, &1000_0000000);

    // Play game
    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    ohloss.start_game(
        &game_contract,
        &1,
        &player,
        &opponent,
        &100_0000000,
        &100_0000000,
    );

    ohloss.end_game(&1, &true);

    // DON'T add any reward pool (zero yield)

    // Cycle epoch
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    let epoch_info = ohloss.get_epoch(&0);
    assert_eq!(epoch_info.reward_pool, 0, "Reward pool should be zero");

    // Try to claim - should fail with NoRewardsAvailable
    let result = ohloss.try_claim_epoch_reward(&player, &0);
    assert!(
        result.is_err(),
        "Claiming zero rewards should fail with NoRewardsAvailable"
    );
}

/// Test single player gets all rewards
///
/// If only one player on winning faction, they should get ~100% of rewards
/// (minus any dust from rounding).
#[test]
fn test_single_player_gets_all_rewards() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss, blnd_token) = setup_reward_test_env(&env);

    // Mint BLND to contract for reward pool
    blnd_token.mint(&ohloss.address, &5000_0000000);

    let winner = Address::generate(&env);
    let loser = Address::generate(&env);

    ohloss.select_faction(&winner, &0); // WholeNoodle
    ohloss.select_faction(&loser, &1); // PointyStick

    mock_vault.set_user_balance(&winner, &1000_0000000);
    mock_vault.set_user_balance(&loser, &1000_0000000);

    // Play games
    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    // Winner wins their game
    ohloss.start_game(
        &game_contract,
        &1,
        &winner,
        &loser,
        &100_0000000,
        &100_0000000,
    );

    ohloss.end_game(&1, &true);

    // Loser loses their game (different session)
    ohloss.start_game(
        &game_contract,
        &2,
        &loser,
        &winner,
        &100_0000000,
        &100_0000000,
    );

    ohloss.end_game(&2, &false);

    // Cycle epoch
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    let epoch_info = ohloss.get_epoch(&0);
    let reward_pool = epoch_info.reward_pool;
    let winning_faction = epoch_info.winning_faction;

    // Claim rewards
    let winner_reward = if winning_faction == Some(0) {
        ohloss.claim_epoch_reward(&winner, &0)
    } else {
        ohloss.claim_epoch_reward(&loser, &0)
    };

    // Winner should get ~100% of pool (allowing for small dust)
    let efficiency = (winner_reward as f64) / (reward_pool as f64);

    assert!(
        reward_pool > 0,
        "Reward pool should be positive. Got: {}, winner_reward: {}",
        reward_pool,
        winner_reward
    );
    assert!(
        efficiency > 0.999,
        "Single winner should get >99.9% of pool. Got efficiency: {:.6}, reward_pool: {}, winner_reward: {}",
        efficiency,
        reward_pool,
        winner_reward
    );
    assert!(winner_reward <= reward_pool);
}

/// Test reward precision with small amounts
///
/// When reward pool or FP contributions are very small, rounding should
/// still work correctly and not cause panics or incorrect distributions.
#[test]
fn test_reward_precision_with_small_amounts() {
    let env = setup_test_env();
    let (game_contract, _vault_addr, mock_vault, ohloss, blnd_token) = setup_reward_test_env(&env);

    // Mint BLND to contract for reward pool
    blnd_token.mint(&ohloss.address, &5000_0000000);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let opponent = Address::generate(&env);

    ohloss.select_faction(&p1, &0); // WholeNoodle
    ohloss.select_faction(&p2, &0); // WholeNoodle
    ohloss.select_faction(&opponent, &1); // PointyStick

    // Very small deposits (just above minimum)
    mock_vault.set_user_balance(&p1, &10_0000000); // 10 USDC
    mock_vault.set_user_balance(&p2, &10_0000000);
    mock_vault.set_user_balance(&opponent, &100_0000000);

    // Play games
    let epoch0 = ohloss.get_epoch(&0);
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 1000);

    ohloss.start_game(&game_contract, &1, &p1, &opponent, &1_0000000, &1_0000000);
    ohloss.end_game(&1, &true);

    ohloss.start_game(&game_contract, &2, &p2, &opponent, &1_0000000, &1_0000000);
    ohloss.end_game(&2, &true);

    // Cycle epoch
    env.ledger()
        .with_mut(|li| li.timestamp = epoch0.start_time + 345_600);
    ohloss.cycle_epoch();

    // Claim rewards
    let r1 = ohloss.claim_epoch_reward(&p1, &0);
    let r2 = ohloss.claim_epoch_reward(&p2, &0);

    // Both should get some reward (roughly equal)
    assert!(r1 > 0 || r2 > 0, "At least one player should get rewards");

    // Total should not exceed pool
    let epoch_info = ohloss.get_epoch(&0);
    assert!(r1 + r2 <= epoch_info.reward_pool);

    // With equal FP, rewards should be close (within 1 unit due to rounding)
    let diff = if r1 > r2 { r1 - r2 } else { r2 - r1 };
    assert!(
        diff <= 1_0000000,
        "Equal FP should produce nearly equal rewards"
    );
}
