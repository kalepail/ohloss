#[allow(dead_code)]
#[soroban_sdk::contractargs(name = "Args")]
#[soroban_sdk::contractclient(name = "Client")]
pub trait Contract {
    fn initialize(
        env: soroban_sdk::Env,
        factory: soroban_sdk::Address,
    ) -> Result<(), CombinedRouterError>;
    fn add_liquidity(
        env: soroban_sdk::Env,
        token_a: soroban_sdk::Address,
        token_b: soroban_sdk::Address,
        amount_a_desired: i128,
        amount_b_desired: i128,
        amount_a_min: i128,
        amount_b_min: i128,
        to: soroban_sdk::Address,
        deadline: u64,
    ) -> Result<(i128, i128, i128), CombinedRouterError>;
    fn remove_liquidity(
        env: soroban_sdk::Env,
        token_a: soroban_sdk::Address,
        token_b: soroban_sdk::Address,
        liquidity: i128,
        amount_a_min: i128,
        amount_b_min: i128,
        to: soroban_sdk::Address,
        deadline: u64,
    ) -> Result<(i128, i128), CombinedRouterError>;
    fn swap_exact_tokens_for_tokens(
        env: soroban_sdk::Env,
        amount_in: i128,
        amount_out_min: i128,
        path: soroban_sdk::Vec<soroban_sdk::Address>,
        to: soroban_sdk::Address,
        deadline: u64,
    ) -> Result<soroban_sdk::Vec<i128>, CombinedRouterError>;
    fn swap_tokens_for_exact_tokens(
        env: soroban_sdk::Env,
        amount_out: i128,
        amount_in_max: i128,
        path: soroban_sdk::Vec<soroban_sdk::Address>,
        to: soroban_sdk::Address,
        deadline: u64,
    ) -> Result<soroban_sdk::Vec<i128>, CombinedRouterError>;
    fn get_factory(env: soroban_sdk::Env) -> Result<soroban_sdk::Address, CombinedRouterError>;
    fn router_pair_for(
        env: soroban_sdk::Env,
        token_a: soroban_sdk::Address,
        token_b: soroban_sdk::Address,
    ) -> Result<soroban_sdk::Address, CombinedRouterError>;
    fn router_quote(
        env: soroban_sdk::Env,
        amount_a: i128,
        reserve_a: i128,
        reserve_b: i128,
    ) -> Result<i128, CombinedRouterError>;
    fn router_get_amount_out(
        env: soroban_sdk::Env,
        amount_in: i128,
        reserve_in: i128,
        reserve_out: i128,
    ) -> Result<i128, CombinedRouterError>;
    fn router_get_amount_in(
        env: soroban_sdk::Env,
        amount_out: i128,
        reserve_in: i128,
        reserve_out: i128,
    ) -> Result<i128, CombinedRouterError>;
    fn router_get_amounts_out(
        env: soroban_sdk::Env,
        amount_in: i128,
        path: soroban_sdk::Vec<soroban_sdk::Address>,
    ) -> Result<soroban_sdk::Vec<i128>, CombinedRouterError>;
    fn router_get_amounts_in(
        env: soroban_sdk::Env,
        amount_out: i128,
        path: soroban_sdk::Vec<soroban_sdk::Address>,
    ) -> Result<soroban_sdk::Vec<i128>, CombinedRouterError>;
    fn sort_tokens(
        env: soroban_sdk::Env,
        token_a: soroban_sdk::Address,
        token_b: soroban_sdk::Address,
    ) -> Result<(soroban_sdk::Address, soroban_sdk::Address), SoroswapLibraryError>;
    fn pair_for(
        env: soroban_sdk::Env,
        factory: soroban_sdk::Address,
        token_a: soroban_sdk::Address,
        token_b: soroban_sdk::Address,
    ) -> Result<soroban_sdk::Address, SoroswapLibraryError>;
    fn get_reserves(
        env: soroban_sdk::Env,
        factory: soroban_sdk::Address,
        token_a: soroban_sdk::Address,
        token_b: soroban_sdk::Address,
    ) -> Result<(i128, i128), SoroswapLibraryError>;
    fn quote(
        env: soroban_sdk::Env,
        amount_a: i128,
        reserve_a: i128,
        reserve_b: i128,
    ) -> Result<i128, SoroswapLibraryError>;
    fn get_amount_out(
        env: soroban_sdk::Env,
        amount_in: i128,
        reserve_in: i128,
        reserve_out: i128,
    ) -> Result<i128, SoroswapLibraryError>;
    fn get_amount_in(
        env: soroban_sdk::Env,
        amount_out: i128,
        reserve_in: i128,
        reserve_out: i128,
    ) -> Result<i128, SoroswapLibraryError>;
    fn get_amounts_out(
        env: soroban_sdk::Env,
        factory: soroban_sdk::Address,
        amount_in: i128,
        path: soroban_sdk::Vec<soroban_sdk::Address>,
    ) -> Result<soroban_sdk::Vec<i128>, SoroswapLibraryError>;
    fn get_amounts_in(
        env: soroban_sdk::Env,
        factory: soroban_sdk::Address,
        amount_out: i128,
        path: soroban_sdk::Vec<soroban_sdk::Address>,
    ) -> Result<soroban_sdk::Vec<i128>, SoroswapLibraryError>;
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct InitializedEvent {
    pub factory: soroban_sdk::Address,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct AddLiquidityEvent {
    pub amount_a: i128,
    pub amount_b: i128,
    pub liquidity: i128,
    pub pair: soroban_sdk::Address,
    pub to: soroban_sdk::Address,
    pub token_a: soroban_sdk::Address,
    pub token_b: soroban_sdk::Address,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct RemoveLiquidityEvent {
    pub amount_a: i128,
    pub amount_b: i128,
    pub liquidity: i128,
    pub pair: soroban_sdk::Address,
    pub to: soroban_sdk::Address,
    pub token_a: soroban_sdk::Address,
    pub token_b: soroban_sdk::Address,
}
#[soroban_sdk::contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct SwapEvent {
    pub amounts: soroban_sdk::Vec<i128>,
    pub path: soroban_sdk::Vec<soroban_sdk::Address>,
    pub to: soroban_sdk::Address,
}
#[soroban_sdk::contracterror(export = false)]
#[derive(Debug, Copy, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub enum SoroswapRouterError {
    NotInitialized = 401,
    NegativeNotAllowed = 402,
    DeadlineExpired = 403,
    InitializeAlreadyInitialized = 404,
    InsufficientAAmount = 405,
    InsufficientBAmount = 406,
    InsufficientOutputAmount = 407,
    ExcessiveInputAmount = 408,
    PairDoesNotExist = 409,
}
#[soroban_sdk::contracterror(export = false)]
#[derive(Debug, Copy, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub enum CombinedRouterError {
    RouterNotInitialized = 501,
    RouterNegativeNotAllowed = 502,
    RouterDeadlineExpired = 503,
    RouterInitializeAlreadyInitialized = 504,
    RouterInsufficientAAmount = 505,
    RouterInsufficientBAmount = 506,
    RouterInsufficientOutputAmount = 507,
    RouterExcessiveInputAmount = 508,
    RouterPairDoesNotExist = 509,
    LibraryInsufficientAmount = 510,
    LibraryInsufficientLiquidity = 511,
    LibraryInsufficientInputAmount = 512,
    LibraryInsufficientOutputAmount = 513,
    LibraryInvalidPath = 514,
    LibrarySortIdenticalTokens = 515,
}
#[soroban_sdk::contracterror(export = false)]
#[derive(Debug, Copy, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub enum SoroswapLibraryError {
    InsufficientAmount = 301,
    InsufficientLiquidity = 302,
    InsufficientInputAmount = 303,
    InsufficientOutputAmount = 304,
    InvalidPath = 305,
    SortIdenticalTokens = 306,
}
