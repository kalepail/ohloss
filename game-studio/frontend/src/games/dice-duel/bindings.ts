import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
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
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





export interface Game {
  player1: string;
  player1_die1: Option<u32>;
  player1_die2: Option<u32>;
  player1_rolled: boolean;
  player1_wager: i128;
  player2: string;
  player2_die1: Option<u32>;
  player2_die2: Option<u32>;
  player2_rolled: boolean;
  player2_wager: i128;
  winner: Option<string>;
}

export const Errors = {
  1: {message:"GameNotFound"},
  2: {message:"NotPlayer"},
  3: {message:"AlreadyRolled"},
  4: {message:"BothPlayersNotRolled"},
  5: {message:"GameAlreadyEnded"}
}

export type DataKey = {tag: "Game", values: readonly [u32]} | {tag: "OhlossAddress", values: void} | {tag: "Admin", values: void};

export interface Client {
  /**
   * Construct and simulate a roll transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Commit a roll for the current game.
   * Both players must roll before the winner can be revealed.
   * 
   * # Arguments
   * * `session_id` - The session ID of the game
   * * `player` - Address of the player rolling the dice
   */
  roll: ({session_id, player}: {session_id: u32, player: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the contract WASM hash (upgrade contract)
   * 
   * # Arguments
   * * `new_wasm_hash` - The hash of the new WASM binary
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get game information.
   * 
   * # Arguments
   * * `session_id` - The session ID of the game
   * 
   * # Returns
   * * `Game` - The game state (includes dice after game ends)
   */
  get_game: ({session_id}: {session_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Game>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current admin address
   * 
   * # Returns
   * * `Address` - The admin address
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set a new admin address
   * 
   * # Arguments
   * * `new_admin` - The new admin address
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_ohloss transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current Ohloss contract address
   * 
   * # Returns
   * * `Address` - The Ohloss contract address
   */
  get_ohloss: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_ohloss transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set a new Ohloss contract address
   * 
   * # Arguments
   * * `new_ohloss` - The new Ohloss contract address
   */
  set_ohloss: ({new_ohloss}: {new_ohloss: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a start_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Start a new game between two players with FP wagers.
   * This creates a session in Ohloss and locks FP before starting the game.
   * 
   * **CRITICAL:** This method requires authorization from THIS contract (not players).
   * Ohloss will call `game_id.require_auth()` which checks this contract's address.
   * 
   * # Arguments
   * * `session_id` - Unique session identifier (u32)
   * * `player1` - Address of first player
   * * `player2` - Address of second player
   * * `player1_wager` - FP amount player1 is wagering
   * * `player2_wager` - FP amount player2 is wagering
   */
  start_game: ({session_id, player1, player2, player1_wager, player2_wager}: {session_id: u32, player1: string, player2: string, player1_wager: i128, player2_wager: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a reveal_winner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Reveal the winner of the game and submit outcome to Ohloss.
   * Can only be called after both players have rolled.
   * This generates dice rolls for both players, determines the winner, and ends the session.
   * 
   * # Arguments
   * * `session_id` - The session ID of the game
   * 
   * # Returns
   * * `Address` - Address of the winning player
   */
  reveal_winner: ({session_id}: {session_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, ohloss}: {admin: string, ohloss: string},
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
    return ContractClient.deploy({admin, ohloss}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAABEdhbWUAAAALAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAADHBsYXllcjFfZGllMQAAA+gAAAAEAAAAAAAAAAxwbGF5ZXIxX2RpZTIAAAPoAAAABAAAAAAAAAAOcGxheWVyMV9yb2xsZWQAAAAAAAEAAAAAAAAADXBsYXllcjFfd2FnZXIAAAAAAAALAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADHBsYXllcjJfZGllMQAAA+gAAAAEAAAAAAAAAAxwbGF5ZXIyX2RpZTIAAAPoAAAABAAAAAAAAAAOcGxheWVyMl9yb2xsZWQAAAAAAAEAAAAAAAAADXBsYXllcjJfd2FnZXIAAAAAAAALAAAAAAAAAAZ3aW5uZXIAAAAAA+gAAAAT",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABQAAAAAAAAAMR2FtZU5vdEZvdW5kAAAAAQAAAAAAAAAJTm90UGxheWVyAAAAAAAAAgAAAAAAAAANQWxyZWFkeVJvbGxlZAAAAAAAAAMAAAAAAAAAFEJvdGhQbGF5ZXJzTm90Um9sbGVkAAAABAAAAAAAAAAQR2FtZUFscmVhZHlFbmRlZAAAAAU=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAwAAAAEAAAAAAAAABEdhbWUAAAABAAAABAAAAAAAAAAAAAAADU9obG9zc0FkZHJlc3MAAAAAAAAAAAAAAAAAAAVBZG1pbgAAAA==",
        "AAAAAAAAAMpDb21taXQgYSByb2xsIGZvciB0aGUgY3VycmVudCBnYW1lLgpCb3RoIHBsYXllcnMgbXVzdCByb2xsIGJlZm9yZSB0aGUgd2lubmVyIGNhbiBiZSByZXZlYWxlZC4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVGhlIHNlc3Npb24gSUQgb2YgdGhlIGdhbWUKKiBgcGxheWVyYCAtIEFkZHJlc3Mgb2YgdGhlIHBsYXllciByb2xsaW5nIHRoZSBkaWNlAAAAAAAEcm9sbAAAAAIAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAHFVcGRhdGUgdGhlIGNvbnRyYWN0IFdBU00gaGFzaCAodXBncmFkZSBjb250cmFjdCkKCiMgQXJndW1lbnRzCiogYG5ld193YXNtX2hhc2hgIC0gVGhlIGhhc2ggb2YgdGhlIG5ldyBXQVNNIGJpbmFyeQAAAAAAAAd1cGdyYWRlAAAAAAEAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAJNHZXQgZ2FtZSBpbmZvcm1hdGlvbi4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVGhlIHNlc3Npb24gSUQgb2YgdGhlIGdhbWUKCiMgUmV0dXJucwoqIGBHYW1lYCAtIFRoZSBnYW1lIHN0YXRlIChpbmNsdWRlcyBkaWNlIGFmdGVyIGdhbWUgZW5kcykAAAAACGdldF9nYW1lAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAPpAAAH0AAAAARHYW1lAAAAAw==",
        "AAAAAAAAAEhHZXQgdGhlIGN1cnJlbnQgYWRtaW4gYWRkcmVzcwoKIyBSZXR1cm5zCiogYEFkZHJlc3NgIC0gVGhlIGFkbWluIGFkZHJlc3MAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAEpTZXQgYSBuZXcgYWRtaW4gYWRkcmVzcwoKIyBBcmd1bWVudHMKKiBgbmV3X2FkbWluYCAtIFRoZSBuZXcgYWRtaW4gYWRkcmVzcwAAAAAACXNldF9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAAFxHZXQgdGhlIGN1cnJlbnQgT2hsb3NzIGNvbnRyYWN0IGFkZHJlc3MKCiMgUmV0dXJucwoqIGBBZGRyZXNzYCAtIFRoZSBPaGxvc3MgY29udHJhY3QgYWRkcmVzcwAAAApnZXRfb2hsb3NzAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAF9TZXQgYSBuZXcgT2hsb3NzIGNvbnRyYWN0IGFkZHJlc3MKCiMgQXJndW1lbnRzCiogYG5ld19vaGxvc3NgIC0gVGhlIG5ldyBPaGxvc3MgY29udHJhY3QgYWRkcmVzcwAAAAAKc2V0X29obG9zcwAAAAAAAQAAAAAAAAAKbmV3X29obG9zcwAAAAAAEwAAAAA=",
        "AAAAAAAAAg9TdGFydCBhIG5ldyBnYW1lIGJldHdlZW4gdHdvIHBsYXllcnMgd2l0aCBGUCB3YWdlcnMuClRoaXMgY3JlYXRlcyBhIHNlc3Npb24gaW4gT2hsb3NzIGFuZCBsb2NrcyBGUCBiZWZvcmUgc3RhcnRpbmcgdGhlIGdhbWUuCgoqKkNSSVRJQ0FMOioqIFRoaXMgbWV0aG9kIHJlcXVpcmVzIGF1dGhvcml6YXRpb24gZnJvbSBUSElTIGNvbnRyYWN0IChub3QgcGxheWVycykuCk9obG9zcyB3aWxsIGNhbGwgYGdhbWVfaWQucmVxdWlyZV9hdXRoKClgIHdoaWNoIGNoZWNrcyB0aGlzIGNvbnRyYWN0J3MgYWRkcmVzcy4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVW5pcXVlIHNlc3Npb24gaWRlbnRpZmllciAodTMyKQoqIGBwbGF5ZXIxYCAtIEFkZHJlc3Mgb2YgZmlyc3QgcGxheWVyCiogYHBsYXllcjJgIC0gQWRkcmVzcyBvZiBzZWNvbmQgcGxheWVyCiogYHBsYXllcjFfd2FnZXJgIC0gRlAgYW1vdW50IHBsYXllcjEgaXMgd2FnZXJpbmcKKiBgcGxheWVyMl93YWdlcmAgLSBGUCBhbW91bnQgcGxheWVyMiBpcyB3YWdlcmluZwAAAAAKc3RhcnRfZ2FtZQAAAAAABQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADXBsYXllcjFfd2FnZXIAAAAAAAALAAAAAAAAAA1wbGF5ZXIyX3dhZ2VyAAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAJ9Jbml0aWFsaXplIHRoZSBjb250cmFjdCB3aXRoIE9obG9zcyBhZGRyZXNzIGFuZCBhZG1pbgoKIyBBcmd1bWVudHMKKiBgYWRtaW5gIC0gQWRtaW4gYWRkcmVzcyAoY2FuIHVwZ3JhZGUgY29udHJhY3QpCiogYG9obG9zc2AgLSBBZGRyZXNzIG9mIHRoZSBPaGxvc3MgY29udHJhY3QAAAAADV9fY29uc3RydWN0b3IAAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABm9obG9zcwAAAAAAEwAAAAA=",
        "AAAAAAAAATdSZXZlYWwgdGhlIHdpbm5lciBvZiB0aGUgZ2FtZSBhbmQgc3VibWl0IG91dGNvbWUgdG8gT2hsb3NzLgpDYW4gb25seSBiZSBjYWxsZWQgYWZ0ZXIgYm90aCBwbGF5ZXJzIGhhdmUgcm9sbGVkLgpUaGlzIGdlbmVyYXRlcyBkaWNlIHJvbGxzIGZvciBib3RoIHBsYXllcnMsIGRldGVybWluZXMgdGhlIHdpbm5lciwgYW5kIGVuZHMgdGhlIHNlc3Npb24uCgojIEFyZ3VtZW50cwoqIGBzZXNzaW9uX2lkYCAtIFRoZSBzZXNzaW9uIElEIG9mIHRoZSBnYW1lCgojIFJldHVybnMKKiBgQWRkcmVzc2AgLSBBZGRyZXNzIG9mIHRoZSB3aW5uaW5nIHBsYXllcgAAAAANcmV2ZWFsX3dpbm5lcgAAAAAAAAEAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAABAAAD6QAAABMAAAAD" ]),
      options
    )
  }
  public readonly fromJSON = {
    roll: this.txFromJSON<Result<void>>,
        upgrade: this.txFromJSON<null>,
        get_game: this.txFromJSON<Result<Game>>,
        get_admin: this.txFromJSON<string>,
        set_admin: this.txFromJSON<null>,
        get_ohloss: this.txFromJSON<string>,
        set_ohloss: this.txFromJSON<null>,
        start_game: this.txFromJSON<Result<void>>,
        reveal_winner: this.txFromJSON<Result<string>>
  }
}