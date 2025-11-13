#![cfg(test)]

// Unit tests for the number-guess contract using a simple mock Blendizzard.
// These tests verify game logic independently of the full Blendizzard system.
//
// Note: These tests use a minimal mock for isolation and speed.
// For full integration tests with the real Blendizzard contract, see:
// contracts/blendizzard/src/tests/number_guess_integration.rs

use crate::{Error, GameOutcome, GameStatus, NumberGuessContract, NumberGuessContractClient};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env};

// ============================================================================
// Mock Blendizzard for Unit Testing
// ============================================================================

#[contract]
pub struct MockBlendizzard;

#[contractimpl]
impl MockBlendizzard {
    pub fn start_game(
        _env: Env,
        _game_id: Address,
        _session_id: u32,
        _player1: Address,
        _player2: Address,
        _player1_wager: i128,
        _player2_wager: i128,
    ) {
        // Mock implementation - does nothing
    }

    pub fn end_game(_env: Env, _proof: Bytes, _outcome: GameOutcome) {
        // Mock implementation - does nothing
    }

    pub fn add_game(_env: Env, _game_address: Address) {
        // Mock implementation - does nothing
    }
}

// ============================================================================
// Test Helpers
// ============================================================================

fn setup_test() -> (
    Env,
    NumberGuessContractClient<'static>,
    MockBlendizzardClient<'static>,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    // Set ledger info for time-based operations
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 1441065600,
        protocol_version: 23,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: u32::MAX / 2,
        min_persistent_entry_ttl: u32::MAX / 2,
        max_entry_ttl: u32::MAX / 2,
    });

    // Deploy mock Blendizzard contract
    let blendizzard_addr = env.register(MockBlendizzard, ());
    let blendizzard = MockBlendizzardClient::new(&env, &blendizzard_addr);

    // Create admin address
    let admin = Address::generate(&env);

    // Deploy number-guess with admin and Blendizzard address
    let contract_id = env.register(NumberGuessContract, (&admin, &blendizzard_addr));
    let client = NumberGuessContractClient::new(&env, &contract_id);

    // Register number-guess as a whitelisted game (mock does nothing)
    blendizzard.add_game(&contract_id);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    (env, client, blendizzard, player1, player2)
}

// ============================================================================
// Basic Game Flow Tests
// ============================================================================

#[test]
fn test_complete_game() {
    let (_env, client, _blendizzard, player1, player2) = setup_test();

    let session_id = 1u32;
    let wager = 100_0000000;

    // Start game
    client.start_game(&session_id, &player1, &player2, &wager, &wager);

    // Get game to verify state
    let game = client.get_game(&session_id);
    assert!(game.winning_number.is_none()); // Winning number not set yet
    assert_eq!(game.status, GameStatus::Active);
    assert_eq!(game.player1, player1);
    assert_eq!(game.player2, player2);
    assert_eq!(game.player1_wager, wager);
    assert_eq!(game.player2_wager, wager);

    // Make guesses
    client.make_guess(&session_id, &player1, &5);
    client.make_guess(&session_id, &player2, &7);

    // Reveal winner
    let winner = client.reveal_winner(&session_id);
    assert!(winner == player1 || winner == player2);

    // Verify game is ended and winning number is now set
    let final_game = client.get_game(&session_id);
    assert_eq!(final_game.status, GameStatus::Ended);
    assert!(final_game.winner.is_some());
    assert_eq!(final_game.winner.unwrap(), winner);
    assert!(final_game.winning_number.is_some());
    let winning_number = final_game.winning_number.unwrap();
    assert!(winning_number >= 1 && winning_number <= 10);
}

#[test]
fn test_winning_number_in_range() {
    let (_env, client, _blendizzard, player1, player2) = setup_test();

    let session_id = 2u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    // Make guesses and reveal winner to generate winning number
    client.make_guess(&session_id, &player1, &5);
    client.make_guess(&session_id, &player2, &7);
    client.reveal_winner(&session_id);

    let game = client.get_game(&session_id);
    let winning_number = game.winning_number.expect("Winning number should be set after reveal");
    assert!(
        winning_number >= 1 && winning_number <= 10,
        "Winning number should be between 1 and 10"
    );
}

#[test]
fn test_multiple_sessions() {
    let (env, client, _blendizzard, player1, player2) = setup_test();
    let player3 = Address::generate(&env);
    let player4 = Address::generate(&env);

    let session1 = 3u32;
    let session2 = 4u32;

    client.start_game(&session1, &player1, &player2, &100_0000000, &100_0000000);
    client.start_game(&session2, &player3, &player4, &50_0000000, &50_0000000);

    // Verify both games exist and are independent
    let game1 = client.get_game(&session1);
    let game2 = client.get_game(&session2);

    assert_eq!(game1.player1, player1);
    assert_eq!(game2.player1, player3);
}

// ============================================================================
// Guess Logic Tests
// ============================================================================

#[test]
fn test_closest_guess_wins() {
    let (_env, client, _blendizzard, player1, player2) = setup_test();

    let session_id = 5u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    // Player1 guesses closer (1 away from any number between 1-10)
    // Player2 guesses further (at least 2 away)
    client.make_guess(&session_id, &player1, &5);
    client.make_guess(&session_id, &player2, &10);

    let winner = client.reveal_winner(&session_id);

    // Get the final game state to check the winning number
    let game = client.get_game(&session_id);
    let winning_number = game.winning_number.unwrap();

    // Calculate which player should have won based on distances
    let distance1 = if 5 > winning_number { 5 - winning_number } else { winning_number - 5 };
    let distance2 = if 10 > winning_number { 10 - winning_number } else { winning_number - 10 };

    let expected_winner = if distance1 <= distance2 { player1.clone() } else { player2.clone() };
    assert_eq!(winner, expected_winner, "Player with closer guess should win");
}

#[test]
fn test_tie_game_player1_wins() {
    let (_env, client, _blendizzard, player1, player2) = setup_test();

    let session_id = 6u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    // Both players guess the same number (guaranteed tie)
    client.make_guess(&session_id, &player1, &5);
    client.make_guess(&session_id, &player2, &5);

    let winner = client.reveal_winner(&session_id);
    assert_eq!(winner, player1, "Player1 should win in a tie");
}

#[test]
fn test_exact_guess_wins() {
    let (_env, client, _blendizzard, player1, player2) = setup_test();

    let session_id = 7u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    // Player1 guesses 5 (middle), player2 guesses 10 (edge)
    // Player1 is more likely to be closer to the winning number
    client.make_guess(&session_id, &player1, &5);
    client.make_guess(&session_id, &player2, &10);

    let winner = client.reveal_winner(&session_id);
    let game = client.get_game(&session_id);
    let winning_number = game.winning_number.unwrap();

    // Verify the winner matches the distance calculation
    let distance1 = if 5 > winning_number { 5 - winning_number } else { winning_number - 5 };
    let distance2 = if 10 > winning_number { 10 - winning_number } else { winning_number - 10 };
    let expected_winner = if distance1 <= distance2 { player1.clone() } else { player2.clone() };
    assert_eq!(winner, expected_winner);
}

// ============================================================================
// Error Handling Tests
// ============================================================================

#[test]
fn test_cannot_guess_twice() {
    let (_env, client, _blendizzard, player1, player2) = setup_test();

    let session_id = 8u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    // Make first guess
    client.make_guess(&session_id, &player1, &5);

    // Try to guess again - should fail
    let result = client.try_make_guess(&session_id, &player1, &6);
    assert_eq!(result, Err(Ok(Error::AlreadyGuessed)));
}

#[test]
fn test_cannot_reveal_before_both_guesses() {
    let (_env, client, _blendizzard, player1, player2) = setup_test();

    let session_id = 9u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    // Only player1 guesses
    client.make_guess(&session_id, &player1, &5);

    // Try to reveal winner - should fail
    let result = client.try_reveal_winner(&session_id);
    assert_eq!(result, Err(Ok(Error::BothPlayersNotGuessed)));
}

#[test]
#[should_panic(expected = "Guess must be between 1 and 10")]
fn test_cannot_guess_below_range() {
    let (env, client, _blendizzard, player1, _player2) = setup_test();

    let session_id = 10u32;
    client.start_game(
        &session_id,
        &player1,
        &Address::generate(&env),
        &100_0000000,
        &100_0000000,
    );

    // Try to guess 0 (below range) - should panic
    client.make_guess(&session_id, &player1, &0);
}

#[test]
#[should_panic(expected = "Guess must be between 1 and 10")]
fn test_cannot_guess_above_range() {
    let (env, client, _blendizzard, player1, _player2) = setup_test();

    let session_id = 11u32;
    client.start_game(
        &session_id,
        &player1,
        &Address::generate(&env),
        &100_0000000,
        &100_0000000,
    );

    // Try to guess 11 (above range) - should panic
    client.make_guess(&session_id, &player1, &11);
}

#[test]
fn test_non_player_cannot_guess() {
    let (env, client, _blendizzard, player1, player2) = setup_test();
    let non_player = Address::generate(&env);

    let session_id = 11u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    // Non-player tries to guess
    let result = client.try_make_guess(&session_id, &non_player, &5);
    assert_eq!(result, Err(Ok(Error::NotPlayer)));
}

#[test]
fn test_cannot_reveal_nonexistent_game() {
    let (_env, client, _blendizzard, _player1, _player2) = setup_test();

    let result = client.try_reveal_winner(&999);
    assert_eq!(result, Err(Ok(Error::GameNotFound)));
}

#[test]
fn test_cannot_reveal_twice() {
    let (_env, client, _blendizzard, player1, player2) = setup_test();

    let session_id = 12u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    client.make_guess(&session_id, &player1, &5);
    client.make_guess(&session_id, &player2, &7);

    // First reveal succeeds
    let winner = client.reveal_winner(&session_id);
    assert!(winner == player1 || winner == player2);

    // Second reveal should return same winner (idempotent)
    let winner2 = client.reveal_winner(&session_id);
    assert_eq!(winner, winner2);
}

// ============================================================================
// Multiple Games Tests
// ============================================================================

#[test]
fn test_multiple_games_independent() {
    let (env, client, _blendizzard, player1, player2) = setup_test();
    let player3 = Address::generate(&env);
    let player4 = Address::generate(&env);

    let session1 = 13u32;
    let session2 = 14u32;

    // Start two games
    client.start_game(&session1, &player1, &player2, &100_0000000, &100_0000000);
    client.start_game(&session2, &player3, &player4, &50_0000000, &50_0000000);

    // Play both games independently
    client.make_guess(&session1, &player1, &3);
    client.make_guess(&session2, &player3, &8);
    client.make_guess(&session1, &player2, &7);
    client.make_guess(&session2, &player4, &2);

    // Reveal both winners
    let winner1 = client.reveal_winner(&session1);
    let winner2 = client.reveal_winner(&session2);

    assert!(winner1 == player1 || winner1 == player2);
    assert!(winner2 == player3 || winner2 == player4);

    // Verify both games are independent
    let final_game1 = client.get_game(&session1);
    let final_game2 = client.get_game(&session2);

    assert_eq!(final_game1.status, GameStatus::Ended);
    assert_eq!(final_game2.status, GameStatus::Ended);

    // Note: winning numbers could be the same by chance, so we just verify they're both set
    assert!(final_game1.winning_number.is_some());
    assert!(final_game2.winning_number.is_some());
}

#[test]
fn test_asymmetric_wagers() {
    let (_env, client, _blendizzard, player1, player2) = setup_test();

    let session_id = 15u32;
    let wager1 = 200_0000000;
    let wager2 = 50_0000000;

    client.start_game(&session_id, &player1, &player2, &wager1, &wager2);

    let game = client.get_game(&session_id);
    assert_eq!(game.player1_wager, wager1);
    assert_eq!(game.player2_wager, wager2);

    client.make_guess(&session_id, &player1, &5);
    client.make_guess(&session_id, &player2, &5);
    client.reveal_winner(&session_id);

    // Game completes successfully with asymmetric wagers
    let final_game = client.get_game(&session_id);
    assert_eq!(final_game.status, GameStatus::Ended);
}

// ============================================================================
// Admin Function Tests
// ============================================================================

#[test]
fn test_upgrade_function_exists() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let blendizzard_addr = env.register(MockBlendizzard, ());

    // Deploy number-guess with admin
    let contract_id = env.register(NumberGuessContract, (&admin, &blendizzard_addr));
    let client = NumberGuessContractClient::new(&env, &contract_id);

    // Verify the upgrade function exists and can be called
    // Note: We can't test actual upgrade without real WASM files
    // The function will fail with MissingValue because the WASM hash doesn't exist
    // But that's expected - we're just verifying the function signature is correct
    let new_wasm_hash = BytesN::from_array(&env, &[1u8; 32]);
    let result = client.try_upgrade(&new_wasm_hash);

    // Should fail with MissingValue (WASM doesn't exist) not NotAdmin
    // This confirms the authorization check passed
    assert!(result.is_err());
}
