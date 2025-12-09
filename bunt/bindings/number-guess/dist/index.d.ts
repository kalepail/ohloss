import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from "@stellar/stellar-sdk/contract";
import type { u32, i128, Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export interface Game {
    player1: string;
    player1_guess: Option<u32>;
    player1_wager: i128;
    player2: string;
    player2_guess: Option<u32>;
    player2_wager: i128;
    winner: Option<string>;
    winning_number: Option<u32>;
}
export declare const Errors: {
    1: {
        message: string;
    };
    2: {
        message: string;
    };
    3: {
        message: string;
    };
    4: {
        message: string;
    };
    5: {
        message: string;
    };
};
export type DataKey = {
    tag: "Game";
    values: readonly [u32];
} | {
    tag: "BlendizzardAddress";
    values: void;
} | {
    tag: "Admin";
    values: void;
};
export interface Client {
    /**
     * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Update the contract WASM hash (upgrade contract)
     *
     * # Arguments
     * * `new_wasm_hash` - The hash of the new WASM binary
     */
    upgrade: ({ new_wasm_hash }: {
        new_wasm_hash: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a get_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Get game information.
     *
     * # Arguments
     * * `session_id` - The session ID of the game
     *
     * # Returns
     * * `Game` - The game state (includes winning number after game ends)
     */
    get_game: ({ session_id }: {
        session_id: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Game>>>;
    /**
     * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Get the current admin address
     *
     * # Returns
     * * `Address` - The admin address
     */
    get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Set a new admin address
     *
     * # Arguments
     * * `new_admin` - The new admin address
     */
    set_admin: ({ new_admin }: {
        new_admin: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a make_guess transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Make a guess for the current game.
     * Players can guess a number between 1 and 10.
     *
     * # Arguments
     * * `session_id` - The session ID of the game
     * * `player` - Address of the player making the guess
     * * `guess` - The guessed number (1-10)
     */
    make_guess: ({ session_id, player, guess }: {
        session_id: u32;
        player: string;
        guess: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a start_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Start a new game between two players with FP wagers.
     * This creates a session in Blendizzard and locks FP before starting the game.
     *
     * **CRITICAL:** This method requires authorization from THIS contract (not players).
     * Blendizzard will call `game_id.require_auth()` which checks this contract's address.
     *
     * # Arguments
     * * `session_id` - Unique session identifier (u32)
     * * `player1` - Address of first player
     * * `player2` - Address of second player
     * * `player1_wager` - FP amount player1 is wagering
     * * `player2_wager` - FP amount player2 is wagering
     */
    start_game: ({ session_id, player1, player2, player1_wager, player2_wager }: {
        session_id: u32;
        player1: string;
        player2: string;
        player1_wager: i128;
        player2_wager: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a reveal_winner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Reveal the winner of the game and submit outcome to Blendizzard.
     * Can only be called after both players have made their guesses.
     * This generates the winning number, determines the winner, and ends the session.
     *
     * # Arguments
     * * `session_id` - The session ID of the game
     *
     * # Returns
     * * `Address` - Address of the winning player
     */
    reveal_winner: ({ session_id }: {
        session_id: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>;
    /**
     * Construct and simulate a get_blendizzard transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Get the current Blendizzard contract address
     *
     * # Returns
     * * `Address` - The Blendizzard contract address
     */
    get_blendizzard: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a set_blendizzard transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Set a new Blendizzard contract address
     *
     * # Arguments
     * * `new_blendizzard` - The new Blendizzard contract address
     */
    set_blendizzard: ({ new_blendizzard }: {
        new_blendizzard: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, blendizzard }: {
        admin: string;
        blendizzard: string;
    }, 
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions & Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
    }): Promise<AssembledTransaction<T>>;
    constructor(options: ContractClientOptions);
    readonly fromJSON: {
        upgrade: (json: string) => AssembledTransaction<null>;
        get_game: (json: string) => AssembledTransaction<Result<Game, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_admin: (json: string) => AssembledTransaction<string>;
        set_admin: (json: string) => AssembledTransaction<null>;
        make_guess: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        start_game: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        reveal_winner: (json: string) => AssembledTransaction<Result<string, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_blendizzard: (json: string) => AssembledTransaction<string>;
        set_blendizzard: (json: string) => AssembledTransaction<null>;
    };
}
