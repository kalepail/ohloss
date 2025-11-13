#![no_std]

//! # Number Guess Game
//!
//! A simple two-player guessing game where players guess a number between 1 and 10.
//! The player whose guess is closest to the randomly generated number wins.
//!
//! **Blendizzard Integration:**
//! This game is Blendizzard-aware and enforces all games to be played through the
//! Blendizzard contract. Games cannot be started or completed without FP involvement.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, Address, Bytes, BytesN,
    Env,
};

// Import Blendizzard contract interface
// This allows us to call into the Blendizzard contract
#[contractclient(name = "BlendizzardClient")]
pub trait Blendizzard {
    fn start_game(
        env: Env,
        game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_wager: i128,
        player2_wager: i128,
    );

    fn end_game(env: Env, proof: Bytes, outcome: GameOutcome);
}

// GameOutcome must match Blendizzard's definition
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GameOutcome {
    pub game_id: Address,
    pub session_id: u32,
    pub player1: Address,
    pub player2: Address,
    pub winner: bool,
}

// ============================================================================
// Errors
// ============================================================================

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    GameNotFound = 1,
    GameAlreadyStarted = 2,
    NotPlayer = 3,
    AlreadyGuessed = 4,
    BothPlayersNotGuessed = 5,
    GameAlreadyEnded = 6,
    NotInitialized = 7,
    AlreadyInitialized = 8,
    NotAdmin = 9,
}

// ============================================================================
// Events (REMOVED)
// ============================================================================
//
// All events have been removed to avoid duplication with Blendizzard events.
// Game lifecycle is tracked through Blendizzard's GameStarted and GameEnded events.
// Game-specific state (guesses, winning_number) can be queried via get_game().
//
// This keeps the event stream clean and makes Blendizzard the single source of
// truth for game lifecycle monitoring.

// ============================================================================
// Data Types
// ============================================================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GameStatus {
    Active,
    Ended,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_wager: i128,
    pub player2_wager: i128,
    pub player1_guess: Option<u32>,
    pub player2_guess: Option<u32>,
    pub winning_number: Option<u32>,
    pub status: GameStatus,
    pub winner: Option<Address>,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Game(u32),
    BlendizzardAddress,
    Admin,
}

// ============================================================================
// Storage TTL Management
// ============================================================================
// TTL (Time To Live) ensures game data doesn't expire unexpectedly
// Games are stored in temporary storage with a minimum 30-day retention

/// TTL for game storage (30 days in ledgers, ~5 seconds per ledger)
/// 30 days = 30 * 24 * 60 * 60 / 5 = 518,400 ledgers
const GAME_TTL_LEDGERS: u32 = 518_400;

// ============================================================================
// Contract Definition
// ============================================================================

#[contract]
pub struct NumberGuessContract;

#[contractimpl]
impl NumberGuessContract {
    /// Initialize the contract with Blendizzard address and admin
    ///
    /// # Arguments
    /// * `admin` - Admin address (can upgrade contract)
    /// * `blendizzard` - Address of the Blendizzard contract
    pub fn __constructor(env: Env, admin: Address, blendizzard: Address) {
        // Check not already initialized
        if env.storage().instance().has(&DataKey::BlendizzardAddress) {
            panic!("Already initialized");
        }

        // Store admin and Blendizzard address
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::BlendizzardAddress, &blendizzard);
    }

    /// Start a new game between two players with FP wagers.
    /// This creates a session in Blendizzard and locks FP before starting the game.
    ///
    /// **CRITICAL:** This method requires authorization from THIS contract (not players).
    /// Blendizzard will call `game_id.require_auth()` which checks this contract's address.
    ///
    /// # Arguments
    /// * `session_id` - Unique session identifier (u32)
    /// * `player1` - Address of first player
    /// * `player2` - Address of second player
    /// * `player1_wager` - FP amount player1 is wagering
    /// * `player2_wager` - FP amount player2 is wagering
    pub fn start_game(
        env: Env,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_wager: i128,
        player2_wager: i128,
    ) -> Result<(), Error> {
        // Require authentication from both players (they consent to wagering FP)
        player1.require_auth();
        player2.require_auth();

        // Get Blendizzard address
        let blendizzard_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::BlendizzardAddress)
            .ok_or(Error::NotInitialized)?;

        // Create Blendizzard client
        let blendizzard = BlendizzardClient::new(&env, &blendizzard_addr);

        // Call Blendizzard to start the session and lock FP
        // This requires THIS contract's authorization (env.current_contract_address())
        blendizzard.start_game(
            &env.current_contract_address(),
            &session_id,
            &player1,
            &player2,
            &player1_wager,
            &player2_wager,
        );

        // Create game (winning_number not set yet - will be generated in reveal_winner)
        let game = Game {
            player1: player1.clone(),
            player2: player2.clone(),
            player1_wager,
            player2_wager,
            player1_guess: None,
            player2_guess: None,
            winning_number: None,
            status: GameStatus::Active,
            winner: None,
        };

        // Store game in temporary storage with 30-day TTL
        let game_key = DataKey::Game(session_id);
        env.storage().temporary().set(&game_key, &game);

        // Set TTL to ensure game is retained for at least 30 days
        env.storage()
            .temporary()
            .extend_ttl(&game_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        // Event emitted by Blendizzard contract (GameStarted)

        Ok(())
    }

    /// Make a guess for the current game.
    /// Players can guess a number between 1 and 10.
    ///
    /// # Arguments
    /// * `session_id` - The session ID of the game
    /// * `player` - Address of the player making the guess
    /// * `guess` - The guessed number (1-10)
    pub fn make_guess(env: Env, session_id: u32, player: Address, guess: u32) -> Result<(), Error> {
        player.require_auth();

        // Validate guess is in range
        if guess < 1 || guess > 10 {
            panic!("Guess must be between 1 and 10");
        }

        // Get game from temporary storage
        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        // Check game is active
        if game.status == GameStatus::Ended {
            return Err(Error::GameAlreadyEnded);
        }

        // Update guess for the appropriate player
        if player == game.player1 {
            if game.player1_guess.is_some() {
                return Err(Error::AlreadyGuessed);
            }
            game.player1_guess = Some(guess);
        } else if player == game.player2 {
            if game.player2_guess.is_some() {
                return Err(Error::AlreadyGuessed);
            }
            game.player2_guess = Some(guess);
        } else {
            return Err(Error::NotPlayer);
        }

        // Store updated game in temporary storage
        env.storage().temporary().set(&key, &game);

        // No event emitted - game state can be queried via get_game()

        Ok(())
    }

    /// Reveal the winner of the game and submit outcome to Blendizzard.
    /// Can only be called after both players have made their guesses.
    /// This generates the winning number, determines the winner, and ends the session.
    ///
    /// # Arguments
    /// * `session_id` - The session ID of the game
    ///
    /// # Returns
    /// * `Address` - Address of the winning player
    pub fn reveal_winner(env: Env, session_id: u32) -> Result<Address, Error> {
        // Get game from temporary storage
        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        // Check game is active
        if game.status == GameStatus::Ended {
            return Ok(game.winner.unwrap());
        }

        // Check both players have guessed
        let guess1 = game.player1_guess.ok_or(Error::BothPlayersNotGuessed)?;
        let guess2 = game.player2_guess.ok_or(Error::BothPlayersNotGuessed)?;

        // Generate random winning number between 1 and 10 using PRNG
        // This is done AFTER both players have committed their guesses
        let winning_number = env.prng().gen_range::<u64>(1..=10) as u32;
        game.winning_number = Some(winning_number);

        // Calculate distances
        let distance1 = if guess1 > winning_number {
            guess1 - winning_number
        } else {
            winning_number - guess1
        };

        let distance2 = if guess2 > winning_number {
            guess2 - winning_number
        } else {
            winning_number - guess2
        };

        // Determine winner (if equal distance, player1 wins)
        let winner = if distance1 <= distance2 {
            game.player1.clone()
        } else {
            game.player2.clone()
        };

        // Update game status
        game.status = GameStatus::Ended;
        game.winner = Some(winner.clone());
        env.storage().temporary().set(&key, &game);

        // Get Blendizzard address
        let blendizzard_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::BlendizzardAddress)
            .ok_or(Error::NotInitialized)?;

        // Create Blendizzard client
        let blendizzard = BlendizzardClient::new(&env, &blendizzard_addr);

        // Create game outcome for Blendizzard
        let outcome = GameOutcome {
            game_id: env.current_contract_address(),
            session_id,
            player1: game.player1.clone(),
            player2: game.player2.clone(),
            winner: winner == game.player1, // true if player1 won
        };

        // Empty proof (MVP phase - verification handled client-side)
        let proof = Bytes::new(&env);

        // Call Blendizzard to end the session
        // This unlocks FP and updates faction standings
        // Event emitted by Blendizzard contract (GameEnded)
        blendizzard.end_game(&proof, &outcome);

        Ok(winner)
    }

    /// Get game information.
    ///
    /// # Arguments
    /// * `session_id` - The session ID of the game
    ///
    /// # Returns
    /// * `Game` - The game state (includes winning number after game ends)
    pub fn get_game(env: Env, session_id: u32) -> Result<Game, Error> {
        let key = DataKey::Game(session_id);
        env.storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)
    }

    // ========================================================================
    // Admin Functions
    // ========================================================================

    /// Get the current admin address
    ///
    /// # Returns
    /// * `Address` - The admin address
    pub fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    /// Set a new admin address
    ///
    /// # Arguments
    /// * `new_admin` - The new admin address
    ///
    /// # Errors
    /// * `NotAdmin` - If caller is not the current admin
    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &new_admin);

        Ok(())
    }

    /// Get the current Blendizzard contract address
    ///
    /// # Returns
    /// * `Address` - The Blendizzard contract address
    pub fn get_blendizzard(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::BlendizzardAddress)
            .ok_or(Error::NotInitialized)
    }

    /// Set a new Blendizzard contract address
    ///
    /// # Arguments
    /// * `new_blendizzard` - The new Blendizzard contract address
    ///
    /// # Errors
    /// * `NotAdmin` - If caller is not the admin
    pub fn set_blendizzard(env: Env, new_blendizzard: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::BlendizzardAddress, &new_blendizzard);

        Ok(())
    }

    /// Update the contract WASM hash (upgrade contract)
    ///
    /// # Arguments
    /// * `new_wasm_hash` - The hash of the new WASM binary
    ///
    /// # Errors
    /// * `NotAdmin` - If caller is not the admin
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.deployer().update_current_contract_wasm(new_wasm_hash);

        Ok(())
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod test;
