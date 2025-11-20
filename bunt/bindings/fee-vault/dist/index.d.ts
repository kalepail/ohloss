import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions } from '@stellar/stellar-sdk/contract';
import type { u32, u64, i128, Option } from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk';
export * as contract from '@stellar/stellar-sdk/contract';
export * as rpc from '@stellar/stellar-sdk/rpc';
export declare const networks: {
    readonly unknown: {
        readonly networkPassphrase: "Public Global Stellar Network ; September 2015";
        readonly contractId: "CBBY53VYJSMAWCBZZ7BHJZ5XSZNJUS4ZE6Q4RN7TKZGHPYHMEE467W7Y";
    };
};
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
export declare const FeeVaultError: {
    10: {
        message: string;
    };
    100: {
        message: string;
    };
    101: {
        message: string;
    };
    102: {
        message: string;
    };
    103: {
        message: string;
    };
    104: {
        message: string;
    };
    105: {
        message: string;
    };
    106: {
        message: string;
    };
    107: {
        message: string;
    };
    108: {
        message: string;
    };
    109: {
        message: string;
    };
    110: {
        message: string;
    };
    111: {
        message: string;
    };
    112: {
        message: string;
    };
};
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
export type FeeVaultDataKey = {
    tag: "Shares";
    values: readonly [string];
} | {
    tag: "Rwd";
    values: readonly [string];
} | {
    tag: "UserRwd";
    values: readonly [UserRewardKey];
};
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
    deposit: ({ user, amount }: {
        user: string;
        amount: i128;
    }, options?: {
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
    }) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a get_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Get the vault's fee configuration
     *
     * ### Returns
     * * `Fee` - The fee configuration for the vault
     */
    get_fee: (options?: {
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
    }) => Promise<AssembledTransaction<Fee>>;
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
    set_fee: ({ rate_type, rate }: {
        rate_type: u32;
        rate: u32;
    }, options?: {
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
    }) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Withdraws tokens from the fee vault for a specific reserve. If the input amount is greater
     * than the user's underlying balance, the user's full balance will be withdrawn.
     * Requires the signer to sign the transaction if the signer is set.
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
    withdraw: ({ user, amount }: {
        user: string;
        amount: i128;
    }, options?: {
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
    }) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Get the vault's admin
     *
     * ### Returns
     * * `Address` - The admin address for the vault
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
    }) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a get_vault transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Get the vault data
     *
     * ### Returns
     * * `VaultData` - The vault data
     */
    get_vault: (options?: {
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
    }) => Promise<AssembledTransaction<VaultData>>;
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
    set_admin: ({ admin }: {
        admin: string;
    }, options?: {
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
    }) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Get the vault's blend pool it deposits into and the asset it supports.
     *
     * ### Returns
     * * `(Address, Address)` - (The blend pool address, the asset address)
     */
    get_config: (options?: {
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
    }) => Promise<AssembledTransaction<readonly [string, string]>>;
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
    get_shares: ({ user }: {
        user: string;
    }, options?: {
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
    }) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a get_signer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Get the vault's signer
     *
     * ### Returns
     * * `Option<Address>` - The signer address for the vault, or None if no signer is set
     */
    get_signer: (options?: {
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
    }) => Promise<AssembledTransaction<Option<string>>>;
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
    set_signer: ({ signer }: {
        signer: Option<string>;
    }, options?: {
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
    }) => Promise<AssembledTransaction<null>>;
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
    get_rewards: ({ user, token }: {
        user: string;
        token: string;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Option<UserRewards>>>;
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
    set_rewards: ({ token, reward_amount, expiration }: {
        token: string;
        reward_amount: i128;
        expiration: u64;
    }, options?: {
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
    }) => Promise<AssembledTransaction<null>>;
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
    get_b_tokens: ({ user }: {
        user: string;
    }, options?: {
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
    }) => Promise<AssembledTransaction<i128>>;
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
    admin_deposit: ({ amount }: {
        amount: i128;
    }, options?: {
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
    }) => Promise<AssembledTransaction<i128>>;
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
    claim_rewards: ({ user, reward_token, to }: {
        user: string;
        reward_token: string;
        to: string;
    }, options?: {
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
    }) => Promise<AssembledTransaction<i128>>;
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
    admin_withdraw: ({ amount }: {
        amount: i128;
    }, options?: {
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
    }) => Promise<AssembledTransaction<i128>>;
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
    claim_emissions: ({ reserve_token_ids, to }: {
        reserve_token_ids: Array<u32>;
        to: string;
    }, options?: {
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
    }) => Promise<AssembledTransaction<i128>>;
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
    get_reward_data: ({ token }: {
        token: string;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Option<RewardData>>>;
    /**
     * Construct and simulate a get_reward_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Get the current reward token for the fee vault
     *
     * ### Returns
     * * `Option<Address>` - The address of the reward token, or None if no reward token is set
     */
    get_reward_token: (options?: {
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
    }) => Promise<AssembledTransaction<Option<string>>>;
    /**
     * Construct and simulate a upgrade_contract transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * ADMIN ONLY
     * Upgrades the contract to use new WASM bytecode. This allows the contract
     * to be updated with new functionality while preserving its state and address.
     *
     * ### Arguments
     * * `new_wasm_hash` - The hash of the new WASM bytecode to upgrade to
     *
     * ### Panics
     * * Only the admin can call this function
     */
    upgrade_contract: ({ new_wasm_hash }: {
        new_wasm_hash: Buffer;
    }, options?: {
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
    }) => Promise<AssembledTransaction<null>>;
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
    get_vault_summary: (options?: {
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
    }) => Promise<AssembledTransaction<VaultSummary>>;
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
    get_underlying_tokens: ({ user }: {
        user: string;
    }, options?: {
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
    }) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a get_underlying_admin_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Fetch the admin balance in underlying tokens
     *
     * ### Returns
     * * `i128` - The admin's accrued fees in underlying tokens, or 0 if the reserve does not exist
     */
    get_underlying_admin_balance: (options?: {
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
    }) => Promise<AssembledTransaction<i128>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, pool, asset, rate_type, rate, signer }: {
        admin: string;
        pool: string;
        asset: string;
        rate_type: u32;
        rate: u32;
        signer: Option<string>;
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
        deposit: (json: string) => AssembledTransaction<bigint>;
        get_fee: (json: string) => AssembledTransaction<Fee>;
        set_fee: (json: string) => AssembledTransaction<null>;
        withdraw: (json: string) => AssembledTransaction<bigint>;
        get_admin: (json: string) => AssembledTransaction<string>;
        get_vault: (json: string) => AssembledTransaction<VaultData>;
        set_admin: (json: string) => AssembledTransaction<null>;
        get_config: (json: string) => AssembledTransaction<readonly [string, string]>;
        get_shares: (json: string) => AssembledTransaction<bigint>;
        get_signer: (json: string) => AssembledTransaction<Option<string>>;
        set_signer: (json: string) => AssembledTransaction<null>;
        get_rewards: (json: string) => AssembledTransaction<Option<UserRewards>>;
        set_rewards: (json: string) => AssembledTransaction<null>;
        get_b_tokens: (json: string) => AssembledTransaction<bigint>;
        admin_deposit: (json: string) => AssembledTransaction<bigint>;
        claim_rewards: (json: string) => AssembledTransaction<bigint>;
        admin_withdraw: (json: string) => AssembledTransaction<bigint>;
        claim_emissions: (json: string) => AssembledTransaction<bigint>;
        get_reward_data: (json: string) => AssembledTransaction<Option<RewardData>>;
        get_reward_token: (json: string) => AssembledTransaction<Option<string>>;
        upgrade_contract: (json: string) => AssembledTransaction<null>;
        get_vault_summary: (json: string) => AssembledTransaction<VaultSummary>;
        get_underlying_tokens: (json: string) => AssembledTransaction<bigint>;
        get_underlying_admin_balance: (json: string) => AssembledTransaction<bigint>;
    };
}
