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


export const networks = {
  unknown: {
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    contractId: "CBBY53VYJSMAWCBZZ7BHJZ5XSZNJUS4ZE6Q4RN7TKZGHPYHMEE467W7Y",
  }
} as const


export interface VaultData {
  /**
 * The admin's bTokens. Excluded from the `total_b_tokens` value.
 */
admin_balance: i128;
  /**
 * The reserve's last bRate
 */
b_rate: i128;
  /**
 * The timestamp of the last update
 */
last_update_timestamp: u64;
  /**
 * The total bToken deposits owned by the reserve vault depositors. Excludes admin balance.
 */
total_b_tokens: i128;
  /**
 * The total shares issued by the reserve vault
 */
total_shares: i128;
}

/**
 * The error codes for the contract.
 */
export const FeeVaultError = {
  10: {message:"BalanceError"},
  100: {message:"ReserveNotFound"},
  101: {message:"ReserveAlreadyExists"},
  102: {message:"InvalidAmount"},
  103: {message:"InsufficientAccruedFees"},
  104: {message:"InvalidFeeRate"},
  105: {message:"InsufficientReserves"},
  106: {message:"InvalidBTokensMinted"},
  107: {message:"InvalidBTokensBurnt"},
  108: {message:"InvalidSharesMinted"},
  109: {message:"InvalidFeeRateType"},
  110: {message:"NoRewardsConfigured"},
  111: {message:"InvalidRewardConfig"},
  112: {message:"InvalidSharesBurnt"}
}


export interface Fee {
  /**
 * The vault's fee rate, with 7 decimals (e.g. 1000000 = 10%)
 */
rate: u32;
  /**
 * The vault's fee mode
 * * 0 = take rate (admin earns a percentage of the vault's earnings)
 * * 1 = capped rate (vault earns at most the APR cap, with any additional returns going to the admin)
 * * 2 = fixed rate (vault always earns the fixed rate, with the admin either supplementing or earning the difference)
 */
rate_type: u32;
}


/**
 * The vault's reward data
 */
export interface RewardData {
  eps: u64;
  expiration: u64;
  index: i128;
  last_time: u64;
}


/**
 * The user's reward data
 */
export interface UserRewards {
  accrued: i128;
  index: i128;
}


export interface UserRewardKey {
  token: string;
  user: string;
}

export type FeeVaultDataKey = {tag: "Shares", values: readonly [string]} | {tag: "Rwd", values: readonly [string]} | {tag: "UserRwd", values: readonly [UserRewardKey]};


/**
 * * @dev
 *  *
 *  * Summary of the vault state. This is intended for offchain services like a dApp to easily display information
 *  * about the vault. It is not intended to be used for onchain logic.
 */
export interface VaultSummary {
  admin: string;
  asset: string;
  est_apr: i128;
  fee: Fee;
  pool: string;
  reward_data: RewardData;
  reward_token: Option<string>;
  signer: Option<string>;
  vault: VaultData;
}

export interface Client {
  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deposits tokens into the fee vault for a specific reserve. Requires the signer to sign
   * the transaction if the signer is set.
   * 
   * ### Arguments
   * * `user` - The address of the user making the deposit
   * * `amount` - The amount of tokens to deposit
   * 
   * ### Returns
   * * `i128` - The number of shares minted for the user
   * 
   * ### Panics
   * * `InvalidAmount` - If the amount is less than or equal to 0
   * * `InvalidBTokensMinted` - If the amount of bTokens minted is less than or equal to 0
   * * `InvalidSharesMinted` - If the amount of shares minted is less than or equal to 0
   * * `BalanceError` - If the user does not have enough tokens
   */
  deposit: ({user, amount}: {user: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the vault's fee configuration
   * 
   * ### Returns
   * * `Fee` - The fee configuration for the vault
   */
  get_fee: (options?: MethodOptions) => Promise<AssembledTransaction<Fee>>

  /**
   * Construct and simulate a set_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * ADMIN ONLY
   * Sets the Fee mode for the fee vault
   * 
   * ### Arguments
   * * `e` - The environment object
   * * `rate_type` - The rate type the vault will use
   * * 0 = take rate (admin earns a percentage of the vault's earnings)
   * * 1 = capped rate (vault earns at most the APR cap, with any additional returns going to the admin)
   * * 2 = fixed rate (vault always earns the fixed rate, with the admin either supplementing or earning the difference)
   * * `rate` - The rate value, with 7 decimals (e.g. 1000000 for 10%)
   * 
   * ### Panics
   * * `InvalidFeeRate` - If the value is not within 0 and 1_000_0000
   * * `InvalidFeeRateType` - If the rate type is not 0, 1, or 2
   */
  set_fee: ({rate_type, rate}: {rate_type: u32, rate: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraws tokens from the fee vault for a specific reserve. If the input amount is greater
   * than the user's underlying balance, the user's full balance will be withdrawn.
   * 
   * ### Arguments
   * * `user` - The address of the user making the withdrawal
   * * `amount` - The amount of tokens to withdraw
   * 
   * ### Returns
   * * `i128` - The number of shares burnt
   * 
   * ### Panics
   * * `InvalidAmount` - If the amount is less than or equal to 0
   * * `InvalidBTokensBurnt` - If the amount of bTokens burnt is less than or equal to 0
   * * `InsufficientReserves` - If the pool doesn't have enough reserves to complete the withdrawal
   */
  withdraw: ({user, amount}: {user: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the vault's admin
   * 
   * ### Returns
   * * `Address` - The admin address for the vault
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_vault transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the vault data
   * 
   * ### Returns
   * * `VaultData` - The vault data
   */
  get_vault: (options?: MethodOptions) => Promise<AssembledTransaction<VaultData>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * ADMIN ONLY
   * Sets the admin address for the fee vault. Requires a signature from both the current admin
   * and the new admin address.
   * 
   * ### Arguments
   * * `e` - The environment object
   * * `admin` - The new admin address to set
   */
  set_admin: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the vault's blend pool it deposits into and the asset it supports.
   * 
   * ### Returns
   * * `(Address, Address)` - (The blend pool address, the asset address)
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<readonly [string, string]>>

  /**
   * Construct and simulate a get_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fetch a user's position in shares
   * 
   * ### Arguments
   * * `user` - The address of the user
   * 
   * ### Returns
   * * `i128` - The user's position in shares, or the user has no shares
   */
  get_shares: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_signer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the vault's signer
   * 
   * ### Returns
   * * `Option<Address>` - The signer address for the vault, or None if no signer is set
   */
  get_signer: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a set_signer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * ADMIN ONLY
   * Sets the signer for the fee vault. This address is required to sign
   * all user deposits into the fee vault. Requires a signature from both the current admin
   * and the new signer address.
   * 
   * Passing `None` as the signer will remove the signer requirement for deposits.
   * 
   * ### Arguments
   * * `signer` - The new signer address to set
   */
  set_signer: ({signer}: {signer: Option<string>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_rewards transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fetch a user's rewards for a specific token. Does not update the user's rewards.
   * 
   * If the current claimable rewards is needed, it is recommended to simulate a claim
   * call to get the current claimable rewards.
   * 
   * ### Arguments
   * * `user` - The address of the user
   * * `token` - The address of the reward token
   * 
   * ### Returns
   * * `Option<UserRewards>` - The user's rewards for the token, or None
   */
  get_rewards: ({user, token}: {user: string, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<UserRewards>>>

  /**
   * Construct and simulate a set_rewards transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * ADMIN ONLY
   * Sets rewards to be distributed to the fee vault depositors. The full `reward_amount` will be
   * transferred to the vault to be distributed to the users until the `expiration` timestamp.
   * 
   * ### Arguments
   * * `token` - The address of the reward token
   * * `reward_amount` - The amount of rewards to distribute
   * * `expiration` - The timestamp when the rewards expire
   * 
   * ### Panics
   * * `InvalidRewardConfig` - If the reward token cannot be changed, or if a valid reward period cannot be started
   * * `BalanceError` - If the admin does not have enough tokens to set the rewards
   */
  set_rewards: ({token, reward_amount, expiration}: {token: string, reward_amount: i128, expiration: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_b_tokens transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fetch a user's position in bTokens
   * 
   * ### Arguments
   * * `user` - The address of the user
   * 
   * ### Returns
   * * `i128` - The user's position in bTokens, or 0 if they have no bTokens
   */
  get_b_tokens: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a admin_deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * ADMIN ONLY
   * Deposit tokens into the vault's admin balance
   * 
   * ### Arguments
   * * `amount` - The amount of tokens to deposit
   * 
   * ### Returns
   * * `i128` - The number of b_tokens minted
   * 
   * ### Panics
   * * `InvalidAmount` - If the amount is less than or equal to 0
   * * `InvalidBTokensMinted` - If the amount of bTokens minted is less than or equal to 0
   * * `BalanceError` - If the user does not have enough tokens
   */
  admin_deposit: ({amount}: {amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a claim_rewards transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Claims rewards for the user from the fee vault.
   * 
   * ### Arguments
   * * `user` - The address of the user claiming rewards
   * * `reward_token` - The address of the reward token to claim
   * * `to` - The address to send the claimed rewards to
   * 
   * ### Returns
   * * `i128` - The amount of rewards claimed
   * 
   * ### Panics
   * * `NoRewardsConfigured` - If no rewards are configured for the token
   */
  claim_rewards: ({user, reward_token, to}: {user: string, reward_token: string, to: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a admin_withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * ADMIN ONLY
   * Withdraw tokens from the vault's admin balance
   * 
   * ### Arguments
   * * `amount` - The amount of underlying tokens to withdraw
   * 
   * ### Returns
   * * `i128` - The number of b_tokens burnt
   * 
   * ### Panics
   * * `InvalidAmount` - If the amount is less than or equal to 0
   * * `BalanceError` - If the user does not have enough shares to withdraw the amount
   * * `InvalidBTokensBurnt` - If the amount of bTokens burnt is less than or equal to 0
   */
  admin_withdraw: ({amount}: {amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a claim_emissions transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * ADMIN ONLY
   * Claims emissions for the given reserves from the pool. This is a passthrough function
   * that invokes the pool's "claim" function as the contract. More details can be found
   * here: https://github.com/blend-capital/blend-contracts/blob/v1.0.0/pool/src/contract.rs#L192
   * 
   * ### Arguments
   * * `reserve_token_ids` - The ids of the reserves to claiming emissions for
   * * `to` - The address to send the emissions to
   * 
   * ### Returns
   * * `i128` - The amount of blnd tokens claimed
   */
  claim_emissions: ({reserve_token_ids, to}: {reserve_token_ids: Array<u32>, to: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_reward_data transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the reward data for a specific token
   * 
   * ### Arguments
   * * `token` - The address of the reward token
   * 
   * ### Returns
   * * `Option<RewardData>` - The reward data for the token, or None if no data exists
   */
  get_reward_data: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<RewardData>>>

  /**
   * Construct and simulate a get_reward_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current reward token for the fee vault
   * 
   * ### Returns
   * * `Option<Address>` - The address of the reward token, or None if no reward token is set
   */
  get_reward_token: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a get_vault_summary transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * NOT INTENDED FOR CONTRACT USE
   * 
   * Get the vault summary, which includes the pool, asset, admin, signer, fee, vault data,
   * rewards, and estimated APR for vault suppliers. Intended for use by dApps looking
   * to fetch display data.
   * 
   * ### Returns
   * * `VaultSummary` - The summary of the vault
   */
  get_vault_summary: (options?: MethodOptions) => Promise<AssembledTransaction<VaultSummary>>

  /**
   * Construct and simulate a get_underlying_tokens transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fetch a user's position in underlying tokens
   * 
   * ### Arguments
   * * `user` - The address of the user
   * 
   * ### Returns
   * * `i128` - The user's position in underlying tokens, or 0 if they have no shares
   */
  get_underlying_tokens: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_underlying_admin_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fetch the admin balance in underlying tokens
   * 
   * ### Returns
   * * `i128` - The admin's accrued fees in underlying tokens, or 0 if the reserve does not exist
   */
  get_underlying_admin_balance: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, pool, asset, rate_type, rate, signer}: {admin: string, pool: string, asset: string, rate_type: u32, rate: u32, signer: Option<string>},
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
    return ContractClient.deploy({admin, pool, asset, rate_type, rate, signer}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAACVZhdWx0RGF0YQAAAAAAAAUAAAA+VGhlIGFkbWluJ3MgYlRva2Vucy4gRXhjbHVkZWQgZnJvbSB0aGUgYHRvdGFsX2JfdG9rZW5zYCB2YWx1ZS4AAAAAAA1hZG1pbl9iYWxhbmNlAAAAAAAACwAAABhUaGUgcmVzZXJ2ZSdzIGxhc3QgYlJhdGUAAAAGYl9yYXRlAAAAAAALAAAAIFRoZSB0aW1lc3RhbXAgb2YgdGhlIGxhc3QgdXBkYXRlAAAAFWxhc3RfdXBkYXRlX3RpbWVzdGFtcAAAAAAAAAYAAABYVGhlIHRvdGFsIGJUb2tlbiBkZXBvc2l0cyBvd25lZCBieSB0aGUgcmVzZXJ2ZSB2YXVsdCBkZXBvc2l0b3JzLiBFeGNsdWRlcyBhZG1pbiBiYWxhbmNlLgAAAA50b3RhbF9iX3Rva2VucwAAAAAACwAAACxUaGUgdG90YWwgc2hhcmVzIGlzc3VlZCBieSB0aGUgcmVzZXJ2ZSB2YXVsdAAAAAx0b3RhbF9zaGFyZXMAAAAL",
        "AAAABAAAACFUaGUgZXJyb3IgY29kZXMgZm9yIHRoZSBjb250cmFjdC4AAAAAAAAAAAAADUZlZVZhdWx0RXJyb3IAAAAAAAAOAAAAAAAAAAxCYWxhbmNlRXJyb3IAAAAKAAAAAAAAAA9SZXNlcnZlTm90Rm91bmQAAAAAZAAAAAAAAAAUUmVzZXJ2ZUFscmVhZHlFeGlzdHMAAABlAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAAZgAAAAAAAAAXSW5zdWZmaWNpZW50QWNjcnVlZEZlZXMAAAAAZwAAAAAAAAAOSW52YWxpZEZlZVJhdGUAAAAAAGgAAAAAAAAAFEluc3VmZmljaWVudFJlc2VydmVzAAAAaQAAAAAAAAAUSW52YWxpZEJUb2tlbnNNaW50ZWQAAABqAAAAAAAAABNJbnZhbGlkQlRva2Vuc0J1cm50AAAAAGsAAAAAAAAAE0ludmFsaWRTaGFyZXNNaW50ZWQAAAAAbAAAAAAAAAASSW52YWxpZEZlZVJhdGVUeXBlAAAAAABtAAAAAAAAABNOb1Jld2FyZHNDb25maWd1cmVkAAAAAG4AAAAAAAAAE0ludmFsaWRSZXdhcmRDb25maWcAAAAAbwAAAAAAAAASSW52YWxpZFNoYXJlc0J1cm50AAAAAABw",
        "AAAAAQAAAAAAAAAAAAAAA0ZlZQAAAAACAAAAOlRoZSB2YXVsdCdzIGZlZSByYXRlLCB3aXRoIDcgZGVjaW1hbHMgKGUuZy4gMTAwMDAwMCA9IDEwJSkAAAAAAARyYXRlAAAABAAAAS9UaGUgdmF1bHQncyBmZWUgbW9kZQoqIDAgPSB0YWtlIHJhdGUgKGFkbWluIGVhcm5zIGEgcGVyY2VudGFnZSBvZiB0aGUgdmF1bHQncyBlYXJuaW5ncykKKiAxID0gY2FwcGVkIHJhdGUgKHZhdWx0IGVhcm5zIGF0IG1vc3QgdGhlIEFQUiBjYXAsIHdpdGggYW55IGFkZGl0aW9uYWwgcmV0dXJucyBnb2luZyB0byB0aGUgYWRtaW4pCiogMiA9IGZpeGVkIHJhdGUgKHZhdWx0IGFsd2F5cyBlYXJucyB0aGUgZml4ZWQgcmF0ZSwgd2l0aCB0aGUgYWRtaW4gZWl0aGVyIHN1cHBsZW1lbnRpbmcgb3IgZWFybmluZyB0aGUgZGlmZmVyZW5jZSkAAAAACXJhdGVfdHlwZQAAAAAAAAQ=",
        "AAAAAQAAABdUaGUgdmF1bHQncyByZXdhcmQgZGF0YQAAAAAAAAAAClJld2FyZERhdGEAAAAAAAQAAAAAAAAAA2VwcwAAAAAGAAAAAAAAAApleHBpcmF0aW9uAAAAAAAGAAAAAAAAAAVpbmRleAAAAAAAAAsAAAAAAAAACWxhc3RfdGltZQAAAAAAAAY=",
        "AAAAAQAAABZUaGUgdXNlcidzIHJld2FyZCBkYXRhAAAAAAAAAAAAC1VzZXJSZXdhcmRzAAAAAAIAAAAAAAAAB2FjY3J1ZWQAAAAACwAAAAAAAAAFaW5kZXgAAAAAAAAL",
        "AAAAAQAAAAAAAAAAAAAADVVzZXJSZXdhcmRLZXkAAAAAAAACAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABHVzZXIAAAAT",
        "AAAAAgAAAAAAAAAAAAAAD0ZlZVZhdWx0RGF0YUtleQAAAAADAAAAAQAAAAAAAAAGU2hhcmVzAAAAAAABAAAAEwAAAAEAAAAAAAAAA1J3ZAAAAAABAAAAEwAAAAEAAAAAAAAAB1VzZXJSd2QAAAAAAQAAB9AAAAANVXNlclJld2FyZEtleQAAAA==",
        "AAAAAQAAAL4qIEBkZXYKICoKICogU3VtbWFyeSBvZiB0aGUgdmF1bHQgc3RhdGUuIFRoaXMgaXMgaW50ZW5kZWQgZm9yIG9mZmNoYWluIHNlcnZpY2VzIGxpa2UgYSBkQXBwIHRvIGVhc2lseSBkaXNwbGF5IGluZm9ybWF0aW9uCiAqIGFib3V0IHRoZSB2YXVsdC4gSXQgaXMgbm90IGludGVuZGVkIHRvIGJlIHVzZWQgZm9yIG9uY2hhaW4gbG9naWMuAAAAAAAAAAAADFZhdWx0U3VtbWFyeQAAAAkAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFYXNzZXQAAAAAAAATAAAAAAAAAAdlc3RfYXByAAAAAAsAAAAAAAAAA2ZlZQAAAAfQAAAAA0ZlZQAAAAAAAAAABHBvb2wAAAATAAAAAAAAAAtyZXdhcmRfZGF0YQAAAAfQAAAAClJld2FyZERhdGEAAAAAAAAAAAAMcmV3YXJkX3Rva2VuAAAD6AAAABMAAAAAAAAABnNpZ25lcgAAAAAD6AAAABMAAAAAAAAABXZhdWx0AAAAAAAH0AAAAAlWYXVsdERhdGEAAAA=",
        "AAAAAAAAAl1EZXBvc2l0cyB0b2tlbnMgaW50byB0aGUgZmVlIHZhdWx0IGZvciBhIHNwZWNpZmljIHJlc2VydmUuIFJlcXVpcmVzIHRoZSBzaWduZXIgdG8gc2lnbgp0aGUgdHJhbnNhY3Rpb24gaWYgdGhlIHNpZ25lciBpcyBzZXQuCgojIyMgQXJndW1lbnRzCiogYHVzZXJgIC0gVGhlIGFkZHJlc3Mgb2YgdGhlIHVzZXIgbWFraW5nIHRoZSBkZXBvc2l0CiogYGFtb3VudGAgLSBUaGUgYW1vdW50IG9mIHRva2VucyB0byBkZXBvc2l0CgojIyMgUmV0dXJucwoqIGBpMTI4YCAtIFRoZSBudW1iZXIgb2Ygc2hhcmVzIG1pbnRlZCBmb3IgdGhlIHVzZXIKCiMjIyBQYW5pY3MKKiBgSW52YWxpZEFtb3VudGAgLSBJZiB0aGUgYW1vdW50IGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byAwCiogYEludmFsaWRCVG9rZW5zTWludGVkYCAtIElmIHRoZSBhbW91bnQgb2YgYlRva2VucyBtaW50ZWQgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIDAKKiBgSW52YWxpZFNoYXJlc01pbnRlZGAgLSBJZiB0aGUgYW1vdW50IG9mIHNoYXJlcyBtaW50ZWQgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIDAKKiBgQmFsYW5jZUVycm9yYCAtIElmIHRoZSB1c2VyIGRvZXMgbm90IGhhdmUgZW5vdWdoIHRva2VucwAAAAAAAAdkZXBvc2l0AAAAAAIAAAAAAAAABHVzZXIAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAACw==",
        "AAAAAAAAAFxHZXQgdGhlIHZhdWx0J3MgZmVlIGNvbmZpZ3VyYXRpb24KCiMjIyBSZXR1cm5zCiogYEZlZWAgLSBUaGUgZmVlIGNvbmZpZ3VyYXRpb24gZm9yIHRoZSB2YXVsdAAAAAdnZXRfZmVlAAAAAAAAAAABAAAH0AAAAANGZWUA",
        "AAAAAAAAAnNBRE1JTiBPTkxZClNldHMgdGhlIEZlZSBtb2RlIGZvciB0aGUgZmVlIHZhdWx0CgojIyMgQXJndW1lbnRzCiogYGVgIC0gVGhlIGVudmlyb25tZW50IG9iamVjdAoqIGByYXRlX3R5cGVgIC0gVGhlIHJhdGUgdHlwZSB0aGUgdmF1bHQgd2lsbCB1c2UKKiAwID0gdGFrZSByYXRlIChhZG1pbiBlYXJucyBhIHBlcmNlbnRhZ2Ugb2YgdGhlIHZhdWx0J3MgZWFybmluZ3MpCiogMSA9IGNhcHBlZCByYXRlICh2YXVsdCBlYXJucyBhdCBtb3N0IHRoZSBBUFIgY2FwLCB3aXRoIGFueSBhZGRpdGlvbmFsIHJldHVybnMgZ29pbmcgdG8gdGhlIGFkbWluKQoqIDIgPSBmaXhlZCByYXRlICh2YXVsdCBhbHdheXMgZWFybnMgdGhlIGZpeGVkIHJhdGUsIHdpdGggdGhlIGFkbWluIGVpdGhlciBzdXBwbGVtZW50aW5nIG9yIGVhcm5pbmcgdGhlIGRpZmZlcmVuY2UpCiogYHJhdGVgIC0gVGhlIHJhdGUgdmFsdWUsIHdpdGggNyBkZWNpbWFscyAoZS5nLiAxMDAwMDAwIGZvciAxMCUpCgojIyMgUGFuaWNzCiogYEludmFsaWRGZWVSYXRlYCAtIElmIHRoZSB2YWx1ZSBpcyBub3Qgd2l0aGluIDAgYW5kIDFfMDAwXzAwMDAKKiBgSW52YWxpZEZlZVJhdGVUeXBlYCAtIElmIHRoZSByYXRlIHR5cGUgaXMgbm90IDAsIDEsIG9yIDIAAAAAB3NldF9mZWUAAAAAAgAAAAAAAAAJcmF0ZV90eXBlAAAAAAAABAAAAAAAAAAEcmF0ZQAAAAQAAAAA",
        "AAAAAAAAAk5XaXRoZHJhd3MgdG9rZW5zIGZyb20gdGhlIGZlZSB2YXVsdCBmb3IgYSBzcGVjaWZpYyByZXNlcnZlLiBJZiB0aGUgaW5wdXQgYW1vdW50IGlzIGdyZWF0ZXIKdGhhbiB0aGUgdXNlcidzIHVuZGVybHlpbmcgYmFsYW5jZSwgdGhlIHVzZXIncyBmdWxsIGJhbGFuY2Ugd2lsbCBiZSB3aXRoZHJhd24uCgojIyMgQXJndW1lbnRzCiogYHVzZXJgIC0gVGhlIGFkZHJlc3Mgb2YgdGhlIHVzZXIgbWFraW5nIHRoZSB3aXRoZHJhd2FsCiogYGFtb3VudGAgLSBUaGUgYW1vdW50IG9mIHRva2VucyB0byB3aXRoZHJhdwoKIyMjIFJldHVybnMKKiBgaTEyOGAgLSBUaGUgbnVtYmVyIG9mIHNoYXJlcyBidXJudAoKIyMjIFBhbmljcwoqIGBJbnZhbGlkQW1vdW50YCAtIElmIHRoZSBhbW91bnQgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIDAKKiBgSW52YWxpZEJUb2tlbnNCdXJudGAgLSBJZiB0aGUgYW1vdW50IG9mIGJUb2tlbnMgYnVybnQgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIDAKKiBgSW5zdWZmaWNpZW50UmVzZXJ2ZXNgIC0gSWYgdGhlIHBvb2wgZG9lc24ndCBoYXZlIGVub3VnaCByZXNlcnZlcyB0byBjb21wbGV0ZSB0aGUgd2l0aGRyYXdhbAAAAAAACHdpdGhkcmF3AAAAAgAAAAAAAAAEdXNlcgAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAAL",
        "AAAAAAAAAFBHZXQgdGhlIHZhdWx0J3MgYWRtaW4KCiMjIyBSZXR1cm5zCiogYEFkZHJlc3NgIC0gVGhlIGFkbWluIGFkZHJlc3MgZm9yIHRoZSB2YXVsdAAAAAlnZXRfYWRtaW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAD5HZXQgdGhlIHZhdWx0IGRhdGEKCiMjIyBSZXR1cm5zCiogYFZhdWx0RGF0YWAgLSBUaGUgdmF1bHQgZGF0YQAAAAAACWdldF92YXVsdAAAAAAAAAAAAAABAAAH0AAAAAlWYXVsdERhdGEAAAA=",
        "AAAAAAAAANdBRE1JTiBPTkxZClNldHMgdGhlIGFkbWluIGFkZHJlc3MgZm9yIHRoZSBmZWUgdmF1bHQuIFJlcXVpcmVzIGEgc2lnbmF0dXJlIGZyb20gYm90aCB0aGUgY3VycmVudCBhZG1pbgphbmQgdGhlIG5ldyBhZG1pbiBhZGRyZXNzLgoKIyMjIEFyZ3VtZW50cwoqIGBlYCAtIFRoZSBlbnZpcm9ubWVudCBvYmplY3QKKiBgYWRtaW5gIC0gVGhlIG5ldyBhZG1pbiBhZGRyZXNzIHRvIHNldAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAA==",
        "AAAAAAAAAJhHZXQgdGhlIHZhdWx0J3MgYmxlbmQgcG9vbCBpdCBkZXBvc2l0cyBpbnRvIGFuZCB0aGUgYXNzZXQgaXQgc3VwcG9ydHMuCgojIyMgUmV0dXJucwoqIGAoQWRkcmVzcywgQWRkcmVzcylgIC0gKFRoZSBibGVuZCBwb29sIGFkZHJlc3MsIHRoZSBhc3NldCBhZGRyZXNzKQAAAApnZXRfY29uZmlnAAAAAAAAAAAAAQAAA+0AAAACAAAAEwAAABM=",
        "AAAAAAAAAKRGZXRjaCBhIHVzZXIncyBwb3NpdGlvbiBpbiBzaGFyZXMKCiMjIyBBcmd1bWVudHMKKiBgdXNlcmAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgdXNlcgoKIyMjIFJldHVybnMKKiBgaTEyOGAgLSBUaGUgdXNlcidzIHBvc2l0aW9uIGluIHNoYXJlcywgb3IgdGhlIHVzZXIgaGFzIG5vIHNoYXJlcwAAAApnZXRfc2hhcmVzAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAL",
        "AAAAAAAAAHdHZXQgdGhlIHZhdWx0J3Mgc2lnbmVyCgojIyMgUmV0dXJucwoqIGBPcHRpb248QWRkcmVzcz5gIC0gVGhlIHNpZ25lciBhZGRyZXNzIGZvciB0aGUgdmF1bHQsIG9yIE5vbmUgaWYgbm8gc2lnbmVyIGlzIHNldAAAAAAKZ2V0X3NpZ25lcgAAAAAAAAAAAAEAAAPoAAAAEw==",
        "AAAAAAAAAUpBRE1JTiBPTkxZClNldHMgdGhlIHNpZ25lciBmb3IgdGhlIGZlZSB2YXVsdC4gVGhpcyBhZGRyZXNzIGlzIHJlcXVpcmVkIHRvIHNpZ24KYWxsIHVzZXIgZGVwb3NpdHMgaW50byB0aGUgZmVlIHZhdWx0LiBSZXF1aXJlcyBhIHNpZ25hdHVyZSBmcm9tIGJvdGggdGhlIGN1cnJlbnQgYWRtaW4KYW5kIHRoZSBuZXcgc2lnbmVyIGFkZHJlc3MuCgpQYXNzaW5nIGBOb25lYCBhcyB0aGUgc2lnbmVyIHdpbGwgcmVtb3ZlIHRoZSBzaWduZXIgcmVxdWlyZW1lbnQgZm9yIGRlcG9zaXRzLgoKIyMjIEFyZ3VtZW50cwoqIGBzaWduZXJgIC0gVGhlIG5ldyBzaWduZXIgYWRkcmVzcyB0byBzZXQAAAAAAApzZXRfc2lnbmVyAAAAAAABAAAAAAAAAAZzaWduZXIAAAAAA+gAAAATAAAAAA==",
        "AAAAAAAAAX1GZXRjaCBhIHVzZXIncyByZXdhcmRzIGZvciBhIHNwZWNpZmljIHRva2VuLiBEb2VzIG5vdCB1cGRhdGUgdGhlIHVzZXIncyByZXdhcmRzLgoKSWYgdGhlIGN1cnJlbnQgY2xhaW1hYmxlIHJld2FyZHMgaXMgbmVlZGVkLCBpdCBpcyByZWNvbW1lbmRlZCB0byBzaW11bGF0ZSBhIGNsYWltCmNhbGwgdG8gZ2V0IHRoZSBjdXJyZW50IGNsYWltYWJsZSByZXdhcmRzLgoKIyMjIEFyZ3VtZW50cwoqIGB1c2VyYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSB1c2VyCiogYHRva2VuYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSByZXdhcmQgdG9rZW4KCiMjIyBSZXR1cm5zCiogYE9wdGlvbjxVc2VyUmV3YXJkcz5gIC0gVGhlIHVzZXIncyByZXdhcmRzIGZvciB0aGUgdG9rZW4sIG9yIE5vbmUAAAAAAAALZ2V0X3Jld2FyZHMAAAAAAgAAAAAAAAAEdXNlcgAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAPoAAAH0AAAAAtVc2VyUmV3YXJkcwA=",
        "AAAAAAAAAjVBRE1JTiBPTkxZClNldHMgcmV3YXJkcyB0byBiZSBkaXN0cmlidXRlZCB0byB0aGUgZmVlIHZhdWx0IGRlcG9zaXRvcnMuIFRoZSBmdWxsIGByZXdhcmRfYW1vdW50YCB3aWxsIGJlCnRyYW5zZmVycmVkIHRvIHRoZSB2YXVsdCB0byBiZSBkaXN0cmlidXRlZCB0byB0aGUgdXNlcnMgdW50aWwgdGhlIGBleHBpcmF0aW9uYCB0aW1lc3RhbXAuCgojIyMgQXJndW1lbnRzCiogYHRva2VuYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSByZXdhcmQgdG9rZW4KKiBgcmV3YXJkX2Ftb3VudGAgLSBUaGUgYW1vdW50IG9mIHJld2FyZHMgdG8gZGlzdHJpYnV0ZQoqIGBleHBpcmF0aW9uYCAtIFRoZSB0aW1lc3RhbXAgd2hlbiB0aGUgcmV3YXJkcyBleHBpcmUKCiMjIyBQYW5pY3MKKiBgSW52YWxpZFJld2FyZENvbmZpZ2AgLSBJZiB0aGUgcmV3YXJkIHRva2VuIGNhbm5vdCBiZSBjaGFuZ2VkLCBvciBpZiBhIHZhbGlkIHJld2FyZCBwZXJpb2QgY2Fubm90IGJlIHN0YXJ0ZWQKKiBgQmFsYW5jZUVycm9yYCAtIElmIHRoZSBhZG1pbiBkb2VzIG5vdCBoYXZlIGVub3VnaCB0b2tlbnMgdG8gc2V0IHRoZSByZXdhcmRzAAAAAAAAC3NldF9yZXdhcmRzAAAAAAMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAANcmV3YXJkX2Ftb3VudAAAAAAAAAsAAAAAAAAACmV4cGlyYXRpb24AAAAAAAYAAAAA",
        "AAAAAAAAAKlGZXRjaCBhIHVzZXIncyBwb3NpdGlvbiBpbiBiVG9rZW5zCgojIyMgQXJndW1lbnRzCiogYHVzZXJgIC0gVGhlIGFkZHJlc3Mgb2YgdGhlIHVzZXIKCiMjIyBSZXR1cm5zCiogYGkxMjhgIC0gVGhlIHVzZXIncyBwb3NpdGlvbiBpbiBiVG9rZW5zLCBvciAwIGlmIHRoZXkgaGF2ZSBubyBiVG9rZW5zAAAAAAAADGdldF9iX3Rva2VucwAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAs=",
        "AAAAAAAAAylJbml0aWFsaXplIHRoZSBjb250cmFjdAoKIyMjIEFyZ3VtZW50cwoqIGBhZG1pbmAgLSBUaGUgYWRtaW4gYWRkcmVzcwoqIGBwb29sYCAtIFRoZSBibGVuZCBwb29sIGFkZHJlc3MgdGhlIHZhdWx0IHdpbGwgZGVwb3NpdCBpbnRvCiogYGFzc2V0YCAtIFRoZSBhc3NldCBhZGRyZXNzIG9mIHRoZSByZXNlcnZlIHRoZSB2YXVsdCB3aWxsIHN1cHBvcnQKKiBgcmF0ZV90eXBlYCAtIFRoZSByYXRlIHR5cGUgdGhlIHZhdWx0IHdpbGwgdXNlCiogMCA9IHRha2UgcmF0ZSAoYWRtaW4gZWFybnMgYSBwZXJjZW50YWdlIG9mIHRoZSB2YXVsdCdzIGVhcm5pbmdzKQoqIDEgPSBjYXBwZWQgcmF0ZSAodmF1bHQgZWFybnMgYXQgbW9zdCB0aGUgQVBSIGNhcCwgd2l0aCBhbnkgYWRkaXRpb25hbCByZXR1cm5zIGdvaW5nIHRvIHRoZSBhZG1pbikKKiAyID0gZml4ZWQgcmF0ZSAodmF1bHQgYWx3YXlzIGVhcm5zIHRoZSBmaXhlZCByYXRlLCB3aXRoIHRoZSBhZG1pbiBlaXRoZXIgc3VwcGxlbWVudGluZyBvciBlYXJuaW5nIHRoZSBkaWZmZXJlbmNlKQoqIGByYXRlYCAtIFRoZSByYXRlIHZhbHVlLCB3aXRoIDcgZGVjaW1hbHMgKGUuZy4gMTAwMDAwMCBmb3IgMTAlKQoqIGBzaWduZXJgLSBUaGUgc2lnbmVyIGFkZHJlc3MgaWYgdGhlIHZhdWx0IGlzIHBlcm1pc3Npb25lZCwgTm9uZSBvdGhlcndpc2UKCiMjIyBQYW5pY3MKKiBgSW52YWxpZEZlZVJhdGVgIC0gSWYgdGhlIHZhbHVlIGlzIG5vdCB3aXRoaW4gMCBhbmQgMV8wMDBfMDAwMAoqIGBJbnZhbGlkRmVlUmF0ZVR5cGVgIC0gSWYgdGhlIHJhdGUgdHlwZSBpcyBub3QgMCwgMSwgb3IgMgAAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAABgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAARwb29sAAAAEwAAAAAAAAAFYXNzZXQAAAAAAAATAAAAAAAAAAlyYXRlX3R5cGUAAAAAAAAEAAAAAAAAAARyYXRlAAAABAAAAAAAAAAGc2lnbmVyAAAAAAPoAAAAEwAAAAA=",
        "AAAAAAAAAYRBRE1JTiBPTkxZCkRlcG9zaXQgdG9rZW5zIGludG8gdGhlIHZhdWx0J3MgYWRtaW4gYmFsYW5jZQoKIyMjIEFyZ3VtZW50cwoqIGBhbW91bnRgIC0gVGhlIGFtb3VudCBvZiB0b2tlbnMgdG8gZGVwb3NpdAoKIyMjIFJldHVybnMKKiBgaTEyOGAgLSBUaGUgbnVtYmVyIG9mIGJfdG9rZW5zIG1pbnRlZAoKIyMjIFBhbmljcwoqIGBJbnZhbGlkQW1vdW50YCAtIElmIHRoZSBhbW91bnQgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIDAKKiBgSW52YWxpZEJUb2tlbnNNaW50ZWRgIC0gSWYgdGhlIGFtb3VudCBvZiBiVG9rZW5zIG1pbnRlZCBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gMAoqIGBCYWxhbmNlRXJyb3JgIC0gSWYgdGhlIHVzZXIgZG9lcyBub3QgaGF2ZSBlbm91Z2ggdG9rZW5zAAAADWFkbWluX2RlcG9zaXQAAAAAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAACw==",
        "AAAAAAAAAWlDbGFpbXMgcmV3YXJkcyBmb3IgdGhlIHVzZXIgZnJvbSB0aGUgZmVlIHZhdWx0LgoKIyMjIEFyZ3VtZW50cwoqIGB1c2VyYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSB1c2VyIGNsYWltaW5nIHJld2FyZHMKKiBgcmV3YXJkX3Rva2VuYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSByZXdhcmQgdG9rZW4gdG8gY2xhaW0KKiBgdG9gIC0gVGhlIGFkZHJlc3MgdG8gc2VuZCB0aGUgY2xhaW1lZCByZXdhcmRzIHRvCgojIyMgUmV0dXJucwoqIGBpMTI4YCAtIFRoZSBhbW91bnQgb2YgcmV3YXJkcyBjbGFpbWVkCgojIyMgUGFuaWNzCiogYE5vUmV3YXJkc0NvbmZpZ3VyZWRgIC0gSWYgbm8gcmV3YXJkcyBhcmUgY29uZmlndXJlZCBmb3IgdGhlIHRva2VuAAAAAAAADWNsYWltX3Jld2FyZHMAAAAAAAADAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAMcmV3YXJkX3Rva2VuAAAAEwAAAAAAAAACdG8AAAAAABMAAAABAAAACw==",
        "AAAAAAAAAaVBRE1JTiBPTkxZCldpdGhkcmF3IHRva2VucyBmcm9tIHRoZSB2YXVsdCdzIGFkbWluIGJhbGFuY2UKCiMjIyBBcmd1bWVudHMKKiBgYW1vdW50YCAtIFRoZSBhbW91bnQgb2YgdW5kZXJseWluZyB0b2tlbnMgdG8gd2l0aGRyYXcKCiMjIyBSZXR1cm5zCiogYGkxMjhgIC0gVGhlIG51bWJlciBvZiBiX3Rva2VucyBidXJudAoKIyMjIFBhbmljcwoqIGBJbnZhbGlkQW1vdW50YCAtIElmIHRoZSBhbW91bnQgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIDAKKiBgQmFsYW5jZUVycm9yYCAtIElmIHRoZSB1c2VyIGRvZXMgbm90IGhhdmUgZW5vdWdoIHNoYXJlcyB0byB3aXRoZHJhdyB0aGUgYW1vdW50CiogYEludmFsaWRCVG9rZW5zQnVybnRgIC0gSWYgdGhlIGFtb3VudCBvZiBiVG9rZW5zIGJ1cm50IGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byAwAAAAAAAADmFkbWluX3dpdGhkcmF3AAAAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAACw==",
        "AAAAAAAAAdJBRE1JTiBPTkxZCkNsYWltcyBlbWlzc2lvbnMgZm9yIHRoZSBnaXZlbiByZXNlcnZlcyBmcm9tIHRoZSBwb29sLiBUaGlzIGlzIGEgcGFzc3Rocm91Z2ggZnVuY3Rpb24KdGhhdCBpbnZva2VzIHRoZSBwb29sJ3MgImNsYWltIiBmdW5jdGlvbiBhcyB0aGUgY29udHJhY3QuIE1vcmUgZGV0YWlscyBjYW4gYmUgZm91bmQKaGVyZTogaHR0cHM6Ly9naXRodWIuY29tL2JsZW5kLWNhcGl0YWwvYmxlbmQtY29udHJhY3RzL2Jsb2IvdjEuMC4wL3Bvb2wvc3JjL2NvbnRyYWN0LnJzI0wxOTIKCiMjIyBBcmd1bWVudHMKKiBgcmVzZXJ2ZV90b2tlbl9pZHNgIC0gVGhlIGlkcyBvZiB0aGUgcmVzZXJ2ZXMgdG8gY2xhaW1pbmcgZW1pc3Npb25zIGZvcgoqIGB0b2AgLSBUaGUgYWRkcmVzcyB0byBzZW5kIHRoZSBlbWlzc2lvbnMgdG8KCiMjIyBSZXR1cm5zCiogYGkxMjhgIC0gVGhlIGFtb3VudCBvZiBibG5kIHRva2VucyBjbGFpbWVkAAAAAAAPY2xhaW1fZW1pc3Npb25zAAAAAAIAAAAAAAAAEXJlc2VydmVfdG9rZW5faWRzAAAAAAAD6gAAAAQAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAMJHZXQgdGhlIHJld2FyZCBkYXRhIGZvciBhIHNwZWNpZmljIHRva2VuCgojIyMgQXJndW1lbnRzCiogYHRva2VuYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSByZXdhcmQgdG9rZW4KCiMjIyBSZXR1cm5zCiogYE9wdGlvbjxSZXdhcmREYXRhPmAgLSBUaGUgcmV3YXJkIGRhdGEgZm9yIHRoZSB0b2tlbiwgb3IgTm9uZSBpZiBubyBkYXRhIGV4aXN0cwAAAAAAD2dldF9yZXdhcmRfZGF0YQAAAAABAAAAAAAAAAV0b2tlbgAAAAAAABMAAAABAAAD6AAAB9AAAAAKUmV3YXJkRGF0YQAA",
        "AAAAAAAAAJRHZXQgdGhlIGN1cnJlbnQgcmV3YXJkIHRva2VuIGZvciB0aGUgZmVlIHZhdWx0CgojIyMgUmV0dXJucwoqIGBPcHRpb248QWRkcmVzcz5gIC0gVGhlIGFkZHJlc3Mgb2YgdGhlIHJld2FyZCB0b2tlbiwgb3IgTm9uZSBpZiBubyByZXdhcmQgdG9rZW4gaXMgc2V0AAAAEGdldF9yZXdhcmRfdG9rZW4AAAAAAAAAAQAAA+gAAAAT",
        "AAAAAAAAARdOT1QgSU5URU5ERUQgRk9SIENPTlRSQUNUIFVTRQoKR2V0IHRoZSB2YXVsdCBzdW1tYXJ5LCB3aGljaCBpbmNsdWRlcyB0aGUgcG9vbCwgYXNzZXQsIGFkbWluLCBzaWduZXIsIGZlZSwgdmF1bHQgZGF0YSwKcmV3YXJkcywgYW5kIGVzdGltYXRlZCBBUFIgZm9yIHZhdWx0IHN1cHBsaWVycy4gSW50ZW5kZWQgZm9yIHVzZSBieSBkQXBwcyBsb29raW5nCnRvIGZldGNoIGRpc3BsYXkgZGF0YS4KCiMjIyBSZXR1cm5zCiogYFZhdWx0U3VtbWFyeWAgLSBUaGUgc3VtbWFyeSBvZiB0aGUgdmF1bHQAAAAAEWdldF92YXVsdF9zdW1tYXJ5AAAAAAAAAAAAAAEAAAfQAAAADFZhdWx0U3VtbWFyeQ==",
        "AAAAAAAAALxGZXRjaCBhIHVzZXIncyBwb3NpdGlvbiBpbiB1bmRlcmx5aW5nIHRva2VucwoKIyMjIEFyZ3VtZW50cwoqIGB1c2VyYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSB1c2VyCgojIyMgUmV0dXJucwoqIGBpMTI4YCAtIFRoZSB1c2VyJ3MgcG9zaXRpb24gaW4gdW5kZXJseWluZyB0b2tlbnMsIG9yIDAgaWYgdGhleSBoYXZlIG5vIHNoYXJlcwAAABVnZXRfdW5kZXJseWluZ190b2tlbnMAAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAL",
        "AAAAAAAAAJZGZXRjaCB0aGUgYWRtaW4gYmFsYW5jZSBpbiB1bmRlcmx5aW5nIHRva2VucwoKIyMjIFJldHVybnMKKiBgaTEyOGAgLSBUaGUgYWRtaW4ncyBhY2NydWVkIGZlZXMgaW4gdW5kZXJseWluZyB0b2tlbnMsIG9yIDAgaWYgdGhlIHJlc2VydmUgZG9lcyBub3QgZXhpc3QAAAAAABxnZXRfdW5kZXJseWluZ19hZG1pbl9iYWxhbmNlAAAAAAAAAAEAAAAL" ]),
      options
    )
  }
  public readonly fromJSON = {
    deposit: this.txFromJSON<i128>,
        get_fee: this.txFromJSON<Fee>,
        set_fee: this.txFromJSON<null>,
        withdraw: this.txFromJSON<i128>,
        get_admin: this.txFromJSON<string>,
        get_vault: this.txFromJSON<VaultData>,
        set_admin: this.txFromJSON<null>,
        get_config: this.txFromJSON<readonly [string, string]>,
        get_shares: this.txFromJSON<i128>,
        get_signer: this.txFromJSON<Option<string>>,
        set_signer: this.txFromJSON<null>,
        get_rewards: this.txFromJSON<Option<UserRewards>>,
        set_rewards: this.txFromJSON<null>,
        get_b_tokens: this.txFromJSON<i128>,
        admin_deposit: this.txFromJSON<i128>,
        claim_rewards: this.txFromJSON<i128>,
        admin_withdraw: this.txFromJSON<i128>,
        claim_emissions: this.txFromJSON<i128>,
        get_reward_data: this.txFromJSON<Option<RewardData>>,
        get_reward_token: this.txFromJSON<Option<string>>,
        get_vault_summary: this.txFromJSON<VaultSummary>,
        get_underlying_tokens: this.txFromJSON<i128>,
        get_underlying_admin_balance: this.txFromJSON<i128>
  }
}