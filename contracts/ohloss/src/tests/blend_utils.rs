#![allow(dead_code)]

/// Blend Pool Test Utilities
///
/// This module provides helpers for testing with real Blend pools using BlendFixture.
/// Based on patterns from kalepail/fee-vault-v2.
use blend_contract_sdk::pool::{Client as PoolClient, ReserveConfig, ReserveEmissionMetadata};
use blend_contract_sdk::testutils::BlendFixture;
use sep_40_oracle::testutils::{Asset, MockPriceOracleClient, MockPriceOracleWASM};
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::{
    testutils::{Address as _, BytesN as _, Ledger as _, LedgerInfo},
    vec, Address, BytesN, Env, String, Symbol,
};

// ============================================================================
// Constants
// ============================================================================

pub const ONE_DAY_LEDGERS: u32 = 17280; // Assuming 5 seconds per ledger

// ============================================================================
// BlendFixture Helper
// ============================================================================

/// Create a BlendFixture with BLND and USDC tokens
///
/// # Returns
/// (BlendFixture, BLND address, USDC address, BLND client, USDC client)
pub fn create_blend_fixture_with_tokens<'a>(
    env: &Env,
    admin: &Address,
) -> (
    BlendFixture<'a>,
    Address,
    Address,
    MockTokenClient<'a>,
    MockTokenClient<'a>,
) {
    let blnd = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let usdc = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();

    let blnd_client = MockTokenClient::new(env, &blnd);
    let usdc_client = MockTokenClient::new(env, &usdc);

    let blend_fixture = BlendFixture::deploy(env, admin, &blnd, &usdc);

    (blend_fixture, blnd, usdc, blnd_client, usdc_client)
}

// ============================================================================
// Blend Pool Creation
// ============================================================================

/// Create a Blend pool with two reserves (USDC and XLM)
///
/// Based on kalepail/fee-vault-v2's create_blend_pool pattern.
///
/// # Arguments
/// * `env` - Test environment
/// * `blend_fixture` - BlendFixture with deployed backstop, emitter, etc.
/// * `admin` - Admin address
/// * `usdc` - USDC token client
/// * `xlm` - XLM token client
///
/// # Returns
/// Blend pool address
pub fn create_blend_pool(
    env: &Env,
    blend_fixture: &BlendFixture,
    admin: &Address,
    usdc: &MockTokenClient,
    xlm: &MockTokenClient,
) -> Address {
    // Mint tokens to admin for pool setup
    usdc.mint(admin, &200_000_0000000);
    xlm.mint(admin, &200_000_0000000);

    // Create and configure oracle
    let (oracle, oracle_client) = create_mock_oracle(env);
    oracle_client.set_data(
        admin,
        &Asset::Other(Symbol::new(env, "USD")),
        &vec![
            env,
            Asset::Stellar(usdc.address.clone()),
            Asset::Stellar(xlm.address.clone()),
        ],
        &7,
        &300,
    );
    oracle_client.set_price_stable(&vec![env, 1_000_0000, 100_0000]);

    // Deploy pool
    let salt = BytesN::<32>::random(env);
    let pool = blend_fixture.pool_factory.deploy(
        admin,
        &String::from_str(env, "TEST"),
        &salt,
        &oracle,
        &0,
        &4,
        &1_0000000,
    );
    let pool_client = PoolClient::new(env, &pool);

    // Deposit to backstop
    blend_fixture
        .backstop
        .deposit(admin, &pool, &20_0000_0000000);

    // Configure reserves
    let reserve_config = ReserveConfig {
        c_factor: 900_0000,
        decimals: 7,
        index: 0,
        l_factor: 900_0000,
        max_util: 900_0000,
        reactivity: 0,
        r_base: 100_0000,
        r_one: 0,
        r_two: 0,
        r_three: 0,
        util: 0,
        supply_cap: i64::MAX as i128,
        enabled: true,
    };

    // Set up USDC reserve (index 0)
    pool_client.queue_set_reserve(&usdc.address, &reserve_config);
    pool_client.set_reserve(&usdc.address);

    // Set up XLM reserve (index 1) - pool automatically assigns index
    pool_client.queue_set_reserve(&xlm.address, &reserve_config);
    pool_client.set_reserve(&xlm.address);

    // Configure emissions for all reserve tokens
    // res_type: 0 = debt token (borrowers), 1 = b-token (lenders/suppliers)
    let emission_config = vec![
        env,
        ReserveEmissionMetadata {
            res_index: 0,
            res_type: 0, // USDC debt token (ID = 0*2+0 = 0)
            share: 250_0000,
        },
        ReserveEmissionMetadata {
            res_index: 0,
            res_type: 1, // USDC b-token (ID = 0*2+1 = 1)
            share: 250_0000,
        },
        ReserveEmissionMetadata {
            res_index: 1,
            res_type: 0, // XLM debt token (ID = 1*2+0 = 2)
            share: 250_0000,
        },
        ReserveEmissionMetadata {
            res_index: 1,
            res_type: 1, // XLM b-token (ID = 1*2+1 = 3)
            share: 250_0000,
        },
    ];
    pool_client.set_emissions_config(&emission_config);
    pool_client.set_status(&0);

    // Add reward to backstop
    blend_fixture.backstop.add_reward(&pool, &None);
    blend_fixture.backstop.distribute();

    // Wait a week and start emissions (matching kalepail/fee-vault-v2 pattern)
    env.jump(ONE_DAY_LEDGERS * 7);
    blend_fixture.emitter.distribute();
    blend_fixture.backstop.distribute();

    // CRITICAL: gulp_emissions() forces pool to process emissions
    // Without this, emissions accumulate but aren't claimable yet
    pool_client.gulp_emissions();

    pool
}

// ============================================================================
// Oracle Helper
// ============================================================================

/// Create a mock price oracle for testing
pub fn create_mock_oracle<'a>(env: &Env) -> (Address, MockPriceOracleClient<'a>) {
    let contract_id = Address::generate(env);
    env.register_at(&contract_id, MockPriceOracleWASM, ());
    (
        contract_id.clone(),
        MockPriceOracleClient::new(env, &contract_id),
    )
}

// ============================================================================
// EnvTestUtils Trait
// ============================================================================

/// Trait for test environment utilities (time manipulation)
pub trait EnvTestUtils {
    /// Jump the env by the given amount of ledgers. Assumes 5 seconds per ledger.
    fn jump(&self, ledgers: u32);

    /// Jump the env by the given amount of seconds. Increments the sequence by 1.
    fn jump_time(&self, seconds: u64);

    /// Set the ledger to the default LedgerInfo
    ///
    /// Time -> 1441065600 (Sept 1st, 2015 12:00:00 AM UTC)
    /// Sequence -> 100
    fn set_default_info(&self);
}

impl EnvTestUtils for Env {
    fn jump(&self, ledgers: u32) {
        self.ledger().set(LedgerInfo {
            timestamp: self.ledger().timestamp().saturating_add(ledgers as u64 * 5),
            protocol_version: 23,
            sequence_number: self.ledger().sequence().saturating_add(ledgers),
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 30 * ONE_DAY_LEDGERS,
            min_persistent_entry_ttl: 30 * ONE_DAY_LEDGERS,
            max_entry_ttl: 365 * ONE_DAY_LEDGERS,
        });
    }

    fn jump_time(&self, seconds: u64) {
        self.ledger().set(LedgerInfo {
            timestamp: self.ledger().timestamp().saturating_add(seconds),
            protocol_version: 23,
            sequence_number: self.ledger().sequence().saturating_add(1),
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 30 * ONE_DAY_LEDGERS,
            min_persistent_entry_ttl: 30 * ONE_DAY_LEDGERS,
            max_entry_ttl: 365 * ONE_DAY_LEDGERS,
        });
    }

    fn set_default_info(&self) {
        self.ledger().set(LedgerInfo {
            timestamp: 1441065600, // Sept 1st, 2015 12:00:00 AM UTC
            protocol_version: 23,
            sequence_number: 100,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 30 * ONE_DAY_LEDGERS,
            min_persistent_entry_ttl: 30 * ONE_DAY_LEDGERS,
            max_entry_ttl: 365 * ONE_DAY_LEDGERS,
        });
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::testutils::setup_test_env;

    #[test]
    fn test_create_blend_fixture() {
        let env = setup_test_env();
        let admin = Address::generate(&env);

        let (blend_fixture, _blnd, _usdc, blnd_client, usdc_client) =
            create_blend_fixture_with_tokens(&env, &admin);

        // Verify tokens were created
        assert!(blnd_client.balance(&admin) >= 0);
        assert!(usdc_client.balance(&admin) >= 0);

        // Verify BlendFixture components exist
        assert!(blend_fixture.backstop.address.to_string().len() > 0);
        assert!(blend_fixture.emitter.address.to_string().len() > 0);
        assert!(blend_fixture.pool_factory.address.to_string().len() > 0);
    }

    #[test]
    fn test_create_blend_pool() {
        let env = setup_test_env();
        env.set_default_info();
        let admin = Address::generate(&env);

        let (blend_fixture, _blnd, _usdc, usdc_client, _xlm_client) =
            create_blend_fixture_with_tokens(&env, &admin);

        // Create XLM token
        let xlm = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let xlm_client = MockTokenClient::new(&env, &xlm);

        let pool = create_blend_pool(&env, &blend_fixture, &admin, &usdc_client, &xlm_client);

        // Verify pool was created
        assert!(pool.to_string().len() > 0);

        // Verify pool client can be instantiated
        let pool_client = PoolClient::new(&env, &pool);
        let positions = pool_client.get_positions(&admin);
        assert_eq!(positions.collateral.len(), 0); // No positions yet
    }

    #[test]
    fn test_env_jump() {
        let env = setup_test_env();
        env.set_default_info();

        let initial_time = env.ledger().timestamp();
        let initial_sequence = env.ledger().sequence();

        // Jump 100 ledgers (500 seconds)
        env.jump(100);

        assert_eq!(env.ledger().timestamp(), initial_time + 500);
        assert_eq!(env.ledger().sequence(), initial_sequence + 100);
    }

    #[test]
    fn test_env_jump_time() {
        let env = setup_test_env();
        env.set_default_info();

        let initial_time = env.ledger().timestamp();
        let initial_sequence = env.ledger().sequence();

        // Jump 3600 seconds (1 hour)
        env.jump_time(3600);

        assert_eq!(env.ledger().timestamp(), initial_time + 3600);
        assert_eq!(env.ledger().sequence(), initial_sequence + 1);
    }
}
