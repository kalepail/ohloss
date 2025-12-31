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
export * as contract from '@stellar/stellar-sdk/contract'
export * as rpc from '@stellar/stellar-sdk/rpc'

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CC3PYMCYG7PXI37ZSZEQDYDX4MZ4HRCLVQLHCND57M7IF6OWYYCVLP7H",
  }
} as const


export interface Game {
  player1: string;
  player1_hand: Buffer;
  player1_stuck: boolean;
  player1_wager: i128;
  player2: string;
  player2_hand: Buffer;
  player2_stuck: boolean;
  player2_wager: i128;
  round: u32;
  winner: Option<string>;
}

export const Errors = {
  1: {message:"GameNotFound"},
  2: {message:"NotPlayer"},
  3: {message:"AlreadyStuck"},
  4: {message:"GameAlreadyEnded"},
  5: {message:"PlayerBusted"},
  6: {message:"BothPlayersNotStuck"},
  7: {message:"OpponentNotStuck"},
  8: {message:"Draw"},
  9: {message:"SelfPlay"},
  10: {message:"RoundOverflow"},
  11: {message:"InvalidHandData"}
}

export type DataKey = {tag: "Game", values: readonly [u32]} | {tag: "BlendizzardAddress", values: void} | {tag: "Admin", values: void};

export interface Client {
  /**
   * Construct and simulate a hit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Player draws another card ("hit").
   * If the player's hand value exceeds 21, they bust and lose immediately.
   * 
   * # Arguments
   * * `session_id` - The session ID of the game
   * * `player` - Address of the player drawing a card
   */
  hit: ({session_id, player}: {session_id: u32, player: string}, options?: {
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
   * Construct and simulate a stick transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Player chooses to stick (end their turn with current hand).
   * If both players have stuck, the game can be revealed.
   * 
   * # Arguments
   * * `session_id` - The session ID of the game
   * * `player` - Address of the player sticking
   */
  stick: ({session_id, player}: {session_id: u32, player: string}, options?: {
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
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the contract WASM hash (upgrade contract)
   * 
   * # Arguments
   * * `new_wasm_hash` - The hash of the new WASM binary
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
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get game information.
   * 
   * # Arguments
   * * `session_id` - The session ID of the game
   * 
   * # Returns
   * * `Game` - The game state (includes hands and winner after game ends)
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
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set a new admin address
   * 
   * # Arguments
   * * `new_admin` - The new admin address
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
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a start_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Start a new game between two players with FP wagers.
   * This creates a session in Blendizzard and locks FP before starting the game.
   * Each player is dealt 2 cards to start.
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
   * Can only be called after both players have stuck.
   * This calculates hand values, determines the winner (closest to 21),
   * and handles draws by dealing new hands.
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
   * Construct and simulate a get_hand_value transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current hand value for a player.
   * 
   * # Arguments
   * * `session_id` - The session ID of the game
   * * `player` - Address of the player
   * 
   * # Returns
   * * `u32` - The total value of the player's hand
   */
  get_hand_value: ({session_id, player}: {session_id: u32, player: string}, options?: {
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
  }) => Promise<AssembledTransaction<Result<u32>>>

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
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_blendizzard transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set a new Blendizzard contract address
   * 
   * # Arguments
   * * `new_blendizzard` - The new Blendizzard contract address
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
  }) => Promise<AssembledTransaction<null>>

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
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAABEdhbWUAAAAKAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAADHBsYXllcjFfaGFuZAAAAA4AAAAAAAAADXBsYXllcjFfc3R1Y2sAAAAAAAABAAAAAAAAAA1wbGF5ZXIxX3dhZ2VyAAAAAAAACwAAAAAAAAAHcGxheWVyMgAAAAATAAAAAAAAAAxwbGF5ZXIyX2hhbmQAAAAOAAAAAAAAAA1wbGF5ZXIyX3N0dWNrAAAAAAAAAQAAAAAAAAANcGxheWVyMl93YWdlcgAAAAAAAAsAAAAAAAAABXJvdW5kAAAAAAAABAAAAAAAAAAGd2lubmVyAAAAAAPoAAAAEw==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACwAAAAAAAAAMR2FtZU5vdEZvdW5kAAAAAQAAAAAAAAAJTm90UGxheWVyAAAAAAAAAgAAAAAAAAAMQWxyZWFkeVN0dWNrAAAAAwAAAAAAAAAQR2FtZUFscmVhZHlFbmRlZAAAAAQAAAAAAAAADFBsYXllckJ1c3RlZAAAAAUAAAAAAAAAE0JvdGhQbGF5ZXJzTm90U3R1Y2sAAAAABgAAAAAAAAAQT3Bwb25lbnROb3RTdHVjawAAAAcAAAAAAAAABERyYXcAAAAIAAAAAAAAAAhTZWxmUGxheQAAAAkAAAAAAAAADVJvdW5kT3ZlcmZsb3cAAAAAAAAKAAAAAAAAAA9JbnZhbGlkSGFuZERhdGEAAAAACw==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAwAAAAEAAAAAAAAABEdhbWUAAAABAAAABAAAAAAAAAAAAAAAEkJsZW5kaXp6YXJkQWRkcmVzcwAAAAAAAAAAAAAAAAAFQWRtaW4AAAA=",
        "AAAAAAAAANRQbGF5ZXIgZHJhd3MgYW5vdGhlciBjYXJkICgiaGl0IikuCklmIHRoZSBwbGF5ZXIncyBoYW5kIHZhbHVlIGV4Y2VlZHMgMjEsIHRoZXkgYnVzdCBhbmQgbG9zZSBpbW1lZGlhdGVseS4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVGhlIHNlc3Npb24gSUQgb2YgdGhlIGdhbWUKKiBgcGxheWVyYCAtIEFkZHJlc3Mgb2YgdGhlIHBsYXllciBkcmF3aW5nIGEgY2FyZAAAAANoaXQAAAAAAgAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAANZQbGF5ZXIgY2hvb3NlcyB0byBzdGljayAoZW5kIHRoZWlyIHR1cm4gd2l0aCBjdXJyZW50IGhhbmQpLgpJZiBib3RoIHBsYXllcnMgaGF2ZSBzdHVjaywgdGhlIGdhbWUgY2FuIGJlIHJldmVhbGVkLgoKIyBBcmd1bWVudHMKKiBgc2Vzc2lvbl9pZGAgLSBUaGUgc2Vzc2lvbiBJRCBvZiB0aGUgZ2FtZQoqIGBwbGF5ZXJgIC0gQWRkcmVzcyBvZiB0aGUgcGxheWVyIHN0aWNraW5nAAAAAAAFc3RpY2sAAAAAAAACAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAHFVcGRhdGUgdGhlIGNvbnRyYWN0IFdBU00gaGFzaCAodXBncmFkZSBjb250cmFjdCkKCiMgQXJndW1lbnRzCiogYG5ld193YXNtX2hhc2hgIC0gVGhlIGhhc2ggb2YgdGhlIG5ldyBXQVNNIGJpbmFyeQAAAAAAAAd1cGdyYWRlAAAAAAEAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAJ9HZXQgZ2FtZSBpbmZvcm1hdGlvbi4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVGhlIHNlc3Npb24gSUQgb2YgdGhlIGdhbWUKCiMgUmV0dXJucwoqIGBHYW1lYCAtIFRoZSBnYW1lIHN0YXRlIChpbmNsdWRlcyBoYW5kcyBhbmQgd2lubmVyIGFmdGVyIGdhbWUgZW5kcykAAAAACGdldF9nYW1lAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAPpAAAH0AAAAARHYW1lAAAAAw==",
        "AAAAAAAAAEhHZXQgdGhlIGN1cnJlbnQgYWRtaW4gYWRkcmVzcwoKIyBSZXR1cm5zCiogYEFkZHJlc3NgIC0gVGhlIGFkbWluIGFkZHJlc3MAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAEpTZXQgYSBuZXcgYWRtaW4gYWRkcmVzcwoKIyBBcmd1bWVudHMKKiBgbmV3X2FkbWluYCAtIFRoZSBuZXcgYWRtaW4gYWRkcmVzcwAAAAAACXNldF9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAAkBTdGFydCBhIG5ldyBnYW1lIGJldHdlZW4gdHdvIHBsYXllcnMgd2l0aCBGUCB3YWdlcnMuClRoaXMgY3JlYXRlcyBhIHNlc3Npb24gaW4gQmxlbmRpenphcmQgYW5kIGxvY2tzIEZQIGJlZm9yZSBzdGFydGluZyB0aGUgZ2FtZS4KRWFjaCBwbGF5ZXIgaXMgZGVhbHQgMiBjYXJkcyB0byBzdGFydC4KCioqQ1JJVElDQUw6KiogVGhpcyBtZXRob2QgcmVxdWlyZXMgYXV0aG9yaXphdGlvbiBmcm9tIFRISVMgY29udHJhY3QgKG5vdCBwbGF5ZXJzKS4KQmxlbmRpenphcmQgd2lsbCBjYWxsIGBnYW1lX2lkLnJlcXVpcmVfYXV0aCgpYCB3aGljaCBjaGVja3MgdGhpcyBjb250cmFjdCdzIGFkZHJlc3MuCgojIEFyZ3VtZW50cwoqIGBzZXNzaW9uX2lkYCAtIFVuaXF1ZSBzZXNzaW9uIGlkZW50aWZpZXIgKHUzMikKKiBgcGxheWVyMWAgLSBBZGRyZXNzIG9mIGZpcnN0IHBsYXllcgoqIGBwbGF5ZXIyYCAtIEFkZHJlc3Mgb2Ygc2Vjb25kIHBsYXllcgoqIGBwbGF5ZXIxX3dhZ2VyYCAtIEZQIGFtb3VudCBwbGF5ZXIxIGlzIHdhZ2VyaW5nCiogYHBsYXllcjJfd2FnZXJgIC0gRlAgYW1vdW50IHBsYXllcjIgaXMgd2FnZXJpbmcAAAAKc3RhcnRfZ2FtZQAAAAAABQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADXBsYXllcjFfd2FnZXIAAAAAAAALAAAAAAAAAA1wbGF5ZXIyX3dhZ2VyAAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAK5Jbml0aWFsaXplIHRoZSBjb250cmFjdCB3aXRoIEJsZW5kaXp6YXJkIGFkZHJlc3MgYW5kIGFkbWluCgojIEFyZ3VtZW50cwoqIGBhZG1pbmAgLSBBZG1pbiBhZGRyZXNzIChjYW4gdXBncmFkZSBjb250cmFjdCkKKiBgYmxlbmRpenphcmRgIC0gQWRkcmVzcyBvZiB0aGUgQmxlbmRpenphcmQgY29udHJhY3QAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAtibGVuZGl6emFyZAAAAAATAAAAAA==",
        "AAAAAAAAAU5SZXZlYWwgdGhlIHdpbm5lciBvZiB0aGUgZ2FtZSBhbmQgc3VibWl0IG91dGNvbWUgdG8gQmxlbmRpenphcmQuCkNhbiBvbmx5IGJlIGNhbGxlZCBhZnRlciBib3RoIHBsYXllcnMgaGF2ZSBzdHVjay4KVGhpcyBjYWxjdWxhdGVzIGhhbmQgdmFsdWVzLCBkZXRlcm1pbmVzIHRoZSB3aW5uZXIgKGNsb3Nlc3QgdG8gMjEpLAphbmQgaGFuZGxlcyBkcmF3cyBieSBkZWFsaW5nIG5ldyBoYW5kcy4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVGhlIHNlc3Npb24gSUQgb2YgdGhlIGdhbWUKCiMgUmV0dXJucwoqIGBBZGRyZXNzYCAtIEFkZHJlc3Mgb2YgdGhlIHdpbm5pbmcgcGxheWVyAAAAAAANcmV2ZWFsX3dpbm5lcgAAAAAAAAEAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAABAAAD6QAAABMAAAAD",
        "AAAAAAAAAL5HZXQgdGhlIGN1cnJlbnQgaGFuZCB2YWx1ZSBmb3IgYSBwbGF5ZXIuCgojIEFyZ3VtZW50cwoqIGBzZXNzaW9uX2lkYCAtIFRoZSBzZXNzaW9uIElEIG9mIHRoZSBnYW1lCiogYHBsYXllcmAgLSBBZGRyZXNzIG9mIHRoZSBwbGF5ZXIKCiMgUmV0dXJucwoqIGB1MzJgIC0gVGhlIHRvdGFsIHZhbHVlIG9mIHRoZSBwbGF5ZXIncyBoYW5kAAAAAAAOZ2V0X2hhbmRfdmFsdWUAAAAAAAIAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAPpAAAABAAAAAM=",
        "AAAAAAAAAGZHZXQgdGhlIGN1cnJlbnQgQmxlbmRpenphcmQgY29udHJhY3QgYWRkcmVzcwoKIyBSZXR1cm5zCiogYEFkZHJlc3NgIC0gVGhlIEJsZW5kaXp6YXJkIGNvbnRyYWN0IGFkZHJlc3MAAAAAAA9nZXRfYmxlbmRpenphcmQAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAG5TZXQgYSBuZXcgQmxlbmRpenphcmQgY29udHJhY3QgYWRkcmVzcwoKIyBBcmd1bWVudHMKKiBgbmV3X2JsZW5kaXp6YXJkYCAtIFRoZSBuZXcgQmxlbmRpenphcmQgY29udHJhY3QgYWRkcmVzcwAAAAAAD3NldF9ibGVuZGl6emFyZAAAAAABAAAAAAAAAA9uZXdfYmxlbmRpenphcmQAAAAAEwAAAAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    hit: this.txFromJSON<Result<void>>,
        stick: this.txFromJSON<Result<void>>,
        upgrade: this.txFromJSON<null>,
        get_game: this.txFromJSON<Result<Game>>,
        get_admin: this.txFromJSON<string>,
        set_admin: this.txFromJSON<null>,
        start_game: this.txFromJSON<Result<void>>,
        reveal_winner: this.txFromJSON<Result<string>>,
        get_hand_value: this.txFromJSON<Result<u32>>,
        get_blendizzard: this.txFromJSON<string>,
        set_blendizzard: this.txFromJSON<null>
  }
}
