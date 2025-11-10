use crate::{Blendizzard, BlendizzardClient};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{vec, Address, Env, Vec};

/// Register and initialize the Blendizzard contract
pub fn create_blendizzard_contract<'a>(
    env: &Env,
    admin: &Address,
    fee_vault: &Address,
    soroswap_router: &Address,
    blnd_token: &Address,
    usdc_token: &Address,
    epoch_duration: u64,
    reserve_token_ids: Vec<u32>,
) -> BlendizzardClient<'a> {
    let contract_address = env.register(
        Blendizzard,
        (
            admin.clone(),
            fee_vault.clone(),
            soroswap_router.clone(),
            blnd_token.clone(),
            usdc_token.clone(),
            epoch_duration,
            reserve_token_ids,
        ),
    );
    BlendizzardClient::new(env, &contract_address)
}

/// Create a simple Blendizzard contract with mock addresses for quick testing
///
/// Note: Assumes env already has mock_all_auths() called (via setup_test_env())
/// This creates mock addresses for external contracts, not real instances.
pub fn create_test_blendizzard<'a>(env: &Env, admin: &Address) -> BlendizzardClient<'a> {
    // Use mock addresses for external contracts
    // Smoke tests don't actually call these contracts, so mocks are sufficient
    let fee_vault = Address::generate(env);
    let soroswap_router = Address::generate(env);
    let blnd_token = Address::generate(env);
    let usdc_token = Address::generate(env);
    let epoch_duration = 345_600; // 4 days in seconds

    // Reserve token IDs for claiming BLND emissions
    // Using reserve 0, b-tokens (suppliers): reserve_index * 2 + 1 = 0 * 2 + 1 = 1
    let reserve_token_ids = vec![env, 1];

    create_blendizzard_contract(
        env,
        admin,
        &fee_vault,
        &soroswap_router,
        &blnd_token,
        &usdc_token,
        epoch_duration,
        reserve_token_ids,
    )
}

/// Create Blendizzard contract with real Soroswap for epoch cycling tests
///
/// This creates a complete test environment with:
/// - Real Soroswap factory, router, and liquidity pools
/// - BLND and USDC tokens with liquidity
/// - Mock vault for deposit/withdraw
/// - BLND minted to contract for swap testing
///
/// Use this for testing epoch cycling which requires actual swaps.
pub fn create_blendizzard_with_soroswap<'a>(
    env: &Env,
    admin: &Address,
) -> BlendizzardClient<'a> {
    use super::fee_vault_utils::create_mock_vault;
    use super::soroswap_utils::{add_liquidity, create_factory, create_router, create_token};

    // Create mock vault
    let fee_vault = create_mock_vault(env);

    // Create BLND and USDC tokens
    let blnd_token_client = create_token(env, admin);
    let usdc_token_client = create_token(env, admin);

    // Ensure token ordering (Soroswap requires token_0 < token_1)
    let (blnd_token, usdc_token) = if blnd_token_client.address < usdc_token_client.address {
        (
            blnd_token_client.address.clone(),
            usdc_token_client.address.clone(),
        )
    } else {
        (
            usdc_token_client.address.clone(),
            blnd_token_client.address.clone(),
        )
    };

    // Create Soroswap infrastructure
    let factory = create_factory(env, admin);
    let router = create_router(env);
    router.initialize(&factory.address);

    // Mint tokens to admin for liquidity provision
    let liquidity_amount = 10_000_000_0000000; // 10M tokens each
    blnd_token_client.mint(admin, &liquidity_amount);
    usdc_token_client.mint(admin, &liquidity_amount);

    // Add liquidity to BLND/USDC pair
    add_liquidity(
        env,
        &router,
        &blnd_token,
        &usdc_token,
        liquidity_amount,
        liquidity_amount,
        admin,
    );

    let epoch_duration = 345_600; // 4 days in seconds

    // Reserve token IDs for claiming BLND emissions
    // Using reserve 0, b-tokens (suppliers): reserve_index * 2 + 1 = 0 * 2 + 1 = 1
    let reserve_token_ids = vec![env, 1];

    let blendizzard_client = create_blendizzard_contract(
        env,
        admin,
        &fee_vault,
        &router.address,
        &blnd_token,
        &usdc_token,
        epoch_duration,
        reserve_token_ids,
    );

    // Mint BLND to the Blendizzard contract for epoch cycling swaps
    // Mock vault doesn't transfer BLND, so mint enough for multiple cycles
    // Each cycle can withdraw up to ~1000 BLND, so mint 5000 for safety
    blnd_token_client.mint(&blendizzard_client.address, &5000_0000000);

    blendizzard_client
}

/// Standard test environment setup
pub fn setup_test_env() -> Env {
    use soroban_sdk::testutils::LedgerInfo;

    let env = Env::default();

    // Set full ledger info (pattern from blend-together)
    env.ledger().set(LedgerInfo {
        timestamp: 1441065600, // Sept 1st, 2015 12:00:00 AM UTC
        protocol_version: 23,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: u32::MAX / 2,
        min_persistent_entry_ttl: u32::MAX / 2,
        max_entry_ttl: u32::MAX / 2,
    });

    env.mock_all_auths();

    // Reset budget for complex fee-vault operations
    env.cost_estimate().budget().reset_unlimited();

    env
}
