#[allow(dead_code)]
#[soroban_sdk::contractargs(name = "Args")]
#[soroban_sdk::contractclient(name = "Client")]
pub trait Contract {
    fn __constructor(
        env: soroban_sdk::Env,
        admin: soroban_sdk::Address,
        pool: soroban_sdk::Address,
        asset: soroban_sdk::Address,
        rate_type: u32,
        rate: u32,
        signer: Option<soroban_sdk::Address>,
    );
    fn get_shares(env: soroban_sdk::Env, user: soroban_sdk::Address) -> i128;
    fn get_b_tokens(env: soroban_sdk::Env, user: soroban_sdk::Address) -> i128;
    fn get_underlying_tokens(env: soroban_sdk::Env, user: soroban_sdk::Address) -> i128;
    fn get_rewards(
        env: soroban_sdk::Env,
        user: soroban_sdk::Address,
        token: soroban_sdk::Address,
    ) -> Option<UserRewards>;
    fn get_underlying_admin_balance(env: soroban_sdk::Env) -> i128;
    fn get_config(env: soroban_sdk::Env) -> (soroban_sdk::Address, soroban_sdk::Address);
    fn get_vault(env: soroban_sdk::Env) -> VaultData;
    fn get_fee(env: soroban_sdk::Env) -> Fee;
    fn get_admin(env: soroban_sdk::Env) -> soroban_sdk::Address;
    fn get_signer(env: soroban_sdk::Env) -> Option<soroban_sdk::Address>;
    fn get_reward_token(env: soroban_sdk::Env) -> Option<soroban_sdk::Address>;
    fn get_reward_data(env: soroban_sdk::Env, token: soroban_sdk::Address) -> Option<RewardData>;
    fn get_vault_summary(env: soroban_sdk::Env) -> VaultSummary;
    fn set_fee(env: soroban_sdk::Env, rate_type: u32, rate: u32);
    fn set_admin(env: soroban_sdk::Env, admin: soroban_sdk::Address);
    fn set_signer(env: soroban_sdk::Env, signer: Option<soroban_sdk::Address>);
    fn claim_emissions(
        env: soroban_sdk::Env,
        reserve_token_ids: soroban_sdk::Vec<u32>,
        to: soroban_sdk::Address,
    ) -> i128;
    fn admin_deposit(env: soroban_sdk::Env, amount: i128) -> i128;
    fn admin_withdraw(env: soroban_sdk::Env, amount: i128) -> i128;
    fn set_rewards(
        env: soroban_sdk::Env,
        token: soroban_sdk::Address,
        reward_amount: i128,
        expiration: u64,
    );
    fn deposit(env: soroban_sdk::Env, user: soroban_sdk::Address, amount: i128) -> i128;
    fn withdraw(env: soroban_sdk::Env, user: soroban_sdk::Address, amount: i128) -> i128;
    fn claim_rewards(
        env: soroban_sdk::Env,
        user: soroban_sdk::Address,
        reward_token: soroban_sdk::Address,
        to: soroban_sdk::Address,
    ) -> i128;
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct Fee {
    pub rate: u32,
    pub rate_type: u32,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct RewardData {
    pub eps: u64,
    pub expiration: u64,
    pub index: i128,
    pub last_time: u64,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct UserRewardKey {
    pub token: soroban_sdk::Address,
    pub user: soroban_sdk::Address,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct UserRewards {
    pub accrued: i128,
    pub index: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct VaultSummary {
    pub admin: soroban_sdk::Address,
    pub asset: soroban_sdk::Address,
    pub est_apr: i128,
    pub fee: Fee,
    pub pool: soroban_sdk::Address,
    pub reward_data: RewardData,
    pub reward_token: Option<soroban_sdk::Address>,
    pub signer: Option<soroban_sdk::Address>,
    pub vault: VaultData,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct VaultData {
    pub admin_balance: i128,
    pub b_rate: i128,
    pub last_update_timestamp: u64,
    pub total_b_tokens: i128,
    pub total_shares: i128,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub enum FeeVaultDataKey {
    Shares(soroban_sdk::Address),
    Rwd(soroban_sdk::Address),
    UserRwd(UserRewardKey),
}
#[soroban_sdk::contracterror(export = false)]
#[derive(Debug, Copy, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub enum FeeVaultError {
    BalanceError = 10,
    ReserveNotFound = 100,
    ReserveAlreadyExists = 101,
    InvalidAmount = 102,
    InsufficientAccruedFees = 103,
    InvalidFeeRate = 104,
    InsufficientReserves = 105,
    InvalidBTokensMinted = 106,
    InvalidBTokensBurnt = 107,
    InvalidSharesMinted = 108,
    InvalidFeeRateType = 109,
    NoRewardsConfigured = 110,
    InvalidRewardConfig = 111,
    InvalidSharesBurnt = 112,
}
