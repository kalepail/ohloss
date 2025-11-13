import { Buffer } from "buffer";
import { Address } from '@stellar/stellar-sdk';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Typepoint,
  Duration,
} from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk'
export * as contract from '@stellar/stellar-sdk/contract'
export * as rpc from '@stellar/stellar-sdk/rpc'

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





export interface Game {
  player1: string;
  player1_guess: Option<u32>;
  player1_wager: i128;
  player2: string;
  player2_guess: Option<u32>;
  player2_wager: i128;
  status: GameStatus;
  winner: Option<string>;
  winning_number: Option<u32>;
}

export const Errors = {
  1: {message:"GameNotFound"},
  2: {message:"GameAlreadyStarted"},
  3: {message:"NotPlayer"},
  4: {message:"AlreadyGuessed"},
  5: {message:"BothPlayersNotGuessed"},
  6: {message:"GameAlreadyEnded"},
  7: {message:"NotInitialized"},
  8: {message:"AlreadyInitialized"},
  9: {message:"NotAdmin"}
}

export type DataKey = {tag: "Game", values: readonly [u32]} | {tag: "BlendizzardAddress", values: void} | {tag: "Admin", values: void};

export type GameStatus = {tag: "Active", values: void} | {tag: "Ended", values: void};


export interface GameOutcome {
  game_id: string;
  player1: string;
  player2: string;
  session_id: u32;
  winner: boolean;
}

export interface Client {
  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the contract WASM hash (upgrade contract)
   * 
   * # Arguments
   * * `new_wasm_hash` - The hash of the new WASM binary
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the admin
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

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
  get_game: ({session_id}: {session_id: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<Game>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current admin address
   * 
   * # Returns
   * * `Address` - The admin address
   */
  get_admin: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set a new admin address
   * 
   * # Arguments
   * * `new_admin` - The new admin address
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the current admin
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

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
  make_guess: ({session_id, player, guess}: {session_id: u32, player: string, guess: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

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
  start_game: ({session_id, player1, player2, player1_wager, player2_wager}: {session_id: u32, player1: string, player2: string, player1_wager: i128, player2_wager: i128}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

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
  reveal_winner: ({session_id}: {session_id: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a get_blendizzard transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current Blendizzard contract address
   * 
   * # Returns
   * * `Address` - The Blendizzard contract address
   */
  get_blendizzard: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a set_blendizzard transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set a new Blendizzard contract address
   * 
   * # Arguments
   * * `new_blendizzard` - The new Blendizzard contract address
   * 
   * # Errors
   * * `NotAdmin` - If caller is not the admin
   */
  set_blendizzard: ({new_blendizzard}: {new_blendizzard: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, blendizzard}: {admin: string, blendizzard: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, blendizzard}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAABEdhbWUAAAAJAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAADXBsYXllcjFfZ3Vlc3MAAAAAAAPoAAAABAAAAAAAAAANcGxheWVyMV93YWdlcgAAAAAAAAsAAAAAAAAAB3BsYXllcjIAAAAAEwAAAAAAAAANcGxheWVyMl9ndWVzcwAAAAAAA+gAAAAEAAAAAAAAAA1wbGF5ZXIyX3dhZ2VyAAAAAAAACwAAAAAAAAAGc3RhdHVzAAAAAAfQAAAACkdhbWVTdGF0dXMAAAAAAAAAAAAGd2lubmVyAAAAAAPoAAAAEwAAAAAAAAAOd2lubmluZ19udW1iZXIAAAAAA+gAAAAE",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACQAAAAAAAAAMR2FtZU5vdEZvdW5kAAAAAQAAAAAAAAASR2FtZUFscmVhZHlTdGFydGVkAAAAAAACAAAAAAAAAAlOb3RQbGF5ZXIAAAAAAAADAAAAAAAAAA5BbHJlYWR5R3Vlc3NlZAAAAAAABAAAAAAAAAAVQm90aFBsYXllcnNOb3RHdWVzc2VkAAAAAAAABQAAAAAAAAAQR2FtZUFscmVhZHlFbmRlZAAAAAYAAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAAHAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAgAAAAAAAAACE5vdEFkbWluAAAACQ==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAwAAAAEAAAAAAAAABEdhbWUAAAABAAAABAAAAAAAAAAAAAAAEkJsZW5kaXp6YXJkQWRkcmVzcwAAAAAAAAAAAAAAAAAFQWRtaW4AAAA=",
        "AAAAAgAAAAAAAAAAAAAACkdhbWVTdGF0dXMAAAAAAAIAAAAAAAAAAAAAAAZBY3RpdmUAAAAAAAAAAAAAAAAABUVuZGVkAAAA",
        "AAAAAQAAAAAAAAAAAAAAC0dhbWVPdXRjb21lAAAAAAUAAAAAAAAAB2dhbWVfaWQAAAAAEwAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABndpbm5lcgAAAAAAAQ==",
        "AAAAAAAAAKVVcGRhdGUgdGhlIGNvbnRyYWN0IFdBU00gaGFzaCAodXBncmFkZSBjb250cmFjdCkKCiMgQXJndW1lbnRzCiogYG5ld193YXNtX2hhc2hgIC0gVGhlIGhhc2ggb2YgdGhlIG5ldyBXQVNNIGJpbmFyeQoKIyBFcnJvcnMKKiBgTm90QWRtaW5gIC0gSWYgY2FsbGVyIGlzIG5vdCB0aGUgYWRtaW4AAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAJ1HZXQgZ2FtZSBpbmZvcm1hdGlvbi4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVGhlIHNlc3Npb24gSUQgb2YgdGhlIGdhbWUKCiMgUmV0dXJucwoqIGBHYW1lYCAtIFRoZSBnYW1lIHN0YXRlIChpbmNsdWRlcyB3aW5uaW5nIG51bWJlciBhZnRlciBnYW1lIGVuZHMpAAAAAAAACGdldF9nYW1lAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAPpAAAH0AAAAARHYW1lAAAAAw==",
        "AAAAAAAAAEhHZXQgdGhlIGN1cnJlbnQgYWRtaW4gYWRkcmVzcwoKIyBSZXR1cm5zCiogYEFkZHJlc3NgIC0gVGhlIGFkbWluIGFkZHJlc3MAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAIZTZXQgYSBuZXcgYWRtaW4gYWRkcmVzcwoKIyBBcmd1bWVudHMKKiBgbmV3X2FkbWluYCAtIFRoZSBuZXcgYWRtaW4gYWRkcmVzcwoKIyBFcnJvcnMKKiBgTm90QWRtaW5gIC0gSWYgY2FsbGVyIGlzIG5vdCB0aGUgY3VycmVudCBhZG1pbgAAAAAACXNldF9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAOJNYWtlIGEgZ3Vlc3MgZm9yIHRoZSBjdXJyZW50IGdhbWUuClBsYXllcnMgY2FuIGd1ZXNzIGEgbnVtYmVyIGJldHdlZW4gMSBhbmQgMTAuCgojIEFyZ3VtZW50cwoqIGBzZXNzaW9uX2lkYCAtIFRoZSBzZXNzaW9uIElEIG9mIHRoZSBnYW1lCiogYHBsYXllcmAgLSBBZGRyZXNzIG9mIHRoZSBwbGF5ZXIgbWFraW5nIHRoZSBndWVzcwoqIGBndWVzc2AgLSBUaGUgZ3Vlc3NlZCBudW1iZXIgKDEtMTApAAAAAAAKbWFrZV9ndWVzcwAAAAAAAwAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAVndWVzcwAAAAAAAAQAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAhlTdGFydCBhIG5ldyBnYW1lIGJldHdlZW4gdHdvIHBsYXllcnMgd2l0aCBGUCB3YWdlcnMuClRoaXMgY3JlYXRlcyBhIHNlc3Npb24gaW4gQmxlbmRpenphcmQgYW5kIGxvY2tzIEZQIGJlZm9yZSBzdGFydGluZyB0aGUgZ2FtZS4KCioqQ1JJVElDQUw6KiogVGhpcyBtZXRob2QgcmVxdWlyZXMgYXV0aG9yaXphdGlvbiBmcm9tIFRISVMgY29udHJhY3QgKG5vdCBwbGF5ZXJzKS4KQmxlbmRpenphcmQgd2lsbCBjYWxsIGBnYW1lX2lkLnJlcXVpcmVfYXV0aCgpYCB3aGljaCBjaGVja3MgdGhpcyBjb250cmFjdCdzIGFkZHJlc3MuCgojIEFyZ3VtZW50cwoqIGBzZXNzaW9uX2lkYCAtIFVuaXF1ZSBzZXNzaW9uIGlkZW50aWZpZXIgKHUzMikKKiBgcGxheWVyMWAgLSBBZGRyZXNzIG9mIGZpcnN0IHBsYXllcgoqIGBwbGF5ZXIyYCAtIEFkZHJlc3Mgb2Ygc2Vjb25kIHBsYXllcgoqIGBwbGF5ZXIxX3dhZ2VyYCAtIEZQIGFtb3VudCBwbGF5ZXIxIGlzIHdhZ2VyaW5nCiogYHBsYXllcjJfd2FnZXJgIC0gRlAgYW1vdW50IHBsYXllcjIgaXMgd2FnZXJpbmcAAAAAAAAKc3RhcnRfZ2FtZQAAAAAABQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADXBsYXllcjFfd2FnZXIAAAAAAAALAAAAAAAAAA1wbGF5ZXIyX3dhZ2VyAAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAK5Jbml0aWFsaXplIHRoZSBjb250cmFjdCB3aXRoIEJsZW5kaXp6YXJkIGFkZHJlc3MgYW5kIGFkbWluCgojIEFyZ3VtZW50cwoqIGBhZG1pbmAgLSBBZG1pbiBhZGRyZXNzIChjYW4gdXBncmFkZSBjb250cmFjdCkKKiBgYmxlbmRpenphcmRgIC0gQWRkcmVzcyBvZiB0aGUgQmxlbmRpenphcmQgY29udHJhY3QAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAtibGVuZGl6emFyZAAAAAATAAAAAA==",
        "AAAAAAAAAT9SZXZlYWwgdGhlIHdpbm5lciBvZiB0aGUgZ2FtZSBhbmQgc3VibWl0IG91dGNvbWUgdG8gQmxlbmRpenphcmQuCkNhbiBvbmx5IGJlIGNhbGxlZCBhZnRlciBib3RoIHBsYXllcnMgaGF2ZSBtYWRlIHRoZWlyIGd1ZXNzZXMuClRoaXMgZ2VuZXJhdGVzIHRoZSB3aW5uaW5nIG51bWJlciwgZGV0ZXJtaW5lcyB0aGUgd2lubmVyLCBhbmQgZW5kcyB0aGUgc2Vzc2lvbi4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVGhlIHNlc3Npb24gSUQgb2YgdGhlIGdhbWUKCiMgUmV0dXJucwoqIGBBZGRyZXNzYCAtIEFkZHJlc3Mgb2YgdGhlIHdpbm5pbmcgcGxheWVyAAAAAA1yZXZlYWxfd2lubmVyAAAAAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAGZHZXQgdGhlIGN1cnJlbnQgQmxlbmRpenphcmQgY29udHJhY3QgYWRkcmVzcwoKIyBSZXR1cm5zCiogYEFkZHJlc3NgIC0gVGhlIEJsZW5kaXp6YXJkIGNvbnRyYWN0IGFkZHJlc3MAAAAAAA9nZXRfYmxlbmRpenphcmQAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAKJTZXQgYSBuZXcgQmxlbmRpenphcmQgY29udHJhY3QgYWRkcmVzcwoKIyBBcmd1bWVudHMKKiBgbmV3X2JsZW5kaXp6YXJkYCAtIFRoZSBuZXcgQmxlbmRpenphcmQgY29udHJhY3QgYWRkcmVzcwoKIyBFcnJvcnMKKiBgTm90QWRtaW5gIC0gSWYgY2FsbGVyIGlzIG5vdCB0aGUgYWRtaW4AAAAAAA9zZXRfYmxlbmRpenphcmQAAAAAAQAAAAAAAAAPbmV3X2JsZW5kaXp6YXJkAAAAABMAAAABAAAD6QAAA+0AAAAAAAAAAw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    upgrade: this.txFromJSON<Result<void>>,
        get_game: this.txFromJSON<Result<Game>>,
        get_admin: this.txFromJSON<Result<string>>,
        set_admin: this.txFromJSON<Result<void>>,
        make_guess: this.txFromJSON<Result<void>>,
        start_game: this.txFromJSON<Result<void>>,
        reveal_winner: this.txFromJSON<Result<string>>,
        get_blendizzard: this.txFromJSON<Result<string>>,
        set_blendizzard: this.txFromJSON<Result<void>>
  }
}