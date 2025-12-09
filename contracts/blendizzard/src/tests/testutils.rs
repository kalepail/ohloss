use crate::{Blendizzard, BlendizzardClient};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{vec, Address, Env, Vec};

// Re-export Error for test usage
pub use crate::errors::Error;

// Re-export number_guess Error as NumberGuessError to avoid conflicts
pub use number_guess::Error as NumberGuessError;

/// Default free FP per epoch for tests (100 FP with 7 decimals)
pub const DEFAULT_FREE_FP_PER_EPOCH: i128 = 100_0000000;

/// Default minimum deposit to claim for tests (1 USDC with 7 decimals)
pub const DEFAULT_MIN_DEPOSIT_TO_CLAIM: i128 = 1_0000000;

/// Register and initialize the Blendizzard contract
#[allow(clippy::too_many_arguments)]
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
    create_blendizzard_contract_with_free_play(
        env,
        admin,
        fee_vault,
        soroswap_router,
        blnd_token,
        usdc_token,
        epoch_duration,
        reserve_token_ids,
        DEFAULT_FREE_FP_PER_EPOCH,
        DEFAULT_MIN_DEPOSIT_TO_CLAIM,
    )
}

/// Register and initialize the Blendizzard contract with custom free play settings
#[allow(clippy::too_many_arguments)]
pub fn create_blendizzard_contract_with_free_play<'a>(
    env: &Env,
    admin: &Address,
    fee_vault: &Address,
    soroswap_router: &Address,
    blnd_token: &Address,
    usdc_token: &Address,
    epoch_duration: u64,
    reserve_token_ids: Vec<u32>,
    free_fp_per_epoch: i128,
    min_deposit_to_claim: i128,
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
            free_fp_per_epoch,
            min_deposit_to_claim,
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
pub fn create_blendizzard_with_soroswap<'a>(env: &Env, admin: &Address) -> BlendizzardClient<'a> {
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

// ============================================================================
// Error Testing Utilities
// ============================================================================

/// Assert that a Result contains a specific contract error
///
/// This helper provides type-safe error assertions following Stellar/Soroban best practices.
/// Instead of using numeric error codes or #[should_panic], this pattern:
/// - Provides compile-time error checking
/// - Makes tests more readable with named errors
/// - Gives better failure messages
///
/// # Example
/// ```
/// let result = blendizzard.try_start_game(...);
/// assert_contract_error(&result, Error::InsufficientFactionPoints);
/// ```
///
/// # Type Signature
/// The try_ methods return: `Result<Result<T, T::Error>, Result<E, InvokeError>>`
/// - Ok(Ok(value)): Call succeeded, decode succeeded
/// - Ok(Err(conv_err)): Call succeeded, decode failed
/// - Err(Ok(error)): Contract reverted with custom error (THIS IS WHAT WE TEST)
/// - Err(Err(invoke_err)): Low-level invocation failure
///
/// # Pattern Reference
/// Based on error testing patterns from:
/// - soroswap/core: Uses Err(Ok(ErrorType::SpecificError))
/// - fee-vault-v2: Uses try_ methods with error code assertions
/// - blend-contracts-v2: Uses #[should_panic] with error codes
/// - stellar/soroban-examples: Uses try_ methods with error enums
pub fn assert_contract_error<T, E>(
    result: &Result<Result<T, E>, Result<Error, soroban_sdk::InvokeError>>,
    expected_error: Error,
) {
    match result {
        Err(Ok(actual_error)) => {
            assert_eq!(
                *actual_error, expected_error,
                "Expected error {:?} (code {}), but got {:?} (code {})",
                expected_error, expected_error as u32, actual_error, *actual_error as u32
            );
        }
        Err(Err(_invoke_error)) => {
            panic!(
                "Expected contract error {:?} (code {}), but got invocation error",
                expected_error, expected_error as u32
            );
        }
        Ok(Err(_conv_error)) => {
            panic!(
                "Expected contract error {:?} (code {}), but got conversion error",
                expected_error, expected_error as u32
            );
        }
        Ok(Ok(_)) => {
            panic!(
                "Expected error {:?} (code {}), but operation succeeded",
                expected_error, expected_error as u32
            );
        }
    }
}

/// Assert that a Result contains a specific number_guess contract error
///
/// This helper provides type-safe error assertions for the number_guess contract,
/// following the same pattern as assert_contract_error() for Blendizzard errors.
///
/// # Example
/// ```
/// let result = number_guess.try_guess(&player, &game_id, &42);
/// assert_number_guess_error(&result, NumberGuessError::AlreadyGuessed);
/// ```
pub fn assert_number_guess_error<T, E>(
    result: &Result<Result<T, E>, Result<NumberGuessError, soroban_sdk::InvokeError>>,
    expected_error: NumberGuessError,
) {
    match result {
        Err(Ok(actual_error)) => {
            assert_eq!(
                *actual_error, expected_error,
                "Expected number_guess error {:?} (code {}), but got {:?} (code {})",
                expected_error, expected_error as u32, actual_error, *actual_error as u32
            );
        }
        Err(Err(_invoke_error)) => {
            panic!(
                "Expected number_guess error {:?} (code {}), but got invocation error",
                expected_error, expected_error as u32
            );
        }
        Ok(Err(_conv_error)) => {
            panic!(
                "Expected number_guess error {:?} (code {}), but got conversion error",
                expected_error, expected_error as u32
            );
        }
        Ok(Ok(_)) => {
            panic!(
                "Expected number_guess error {:?} (code {}), but operation succeeded",
                expected_error, expected_error as u32
            );
        }
    }
}
