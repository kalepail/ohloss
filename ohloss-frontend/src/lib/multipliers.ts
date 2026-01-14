/**
 * Multiplier calculations matching the Ohloss contract (faction_points.rs)
 *
 * Both amount and time multipliers use smooth piecewise curves (cubic Hermite splines):
 * - Rise smoothly from 1.0x to peak at target
 * - Fall smoothly from peak back to 1.0x at maximum
 * - Peak combined multiplier: 6.0x (each component: ~2.449x)
 */

// Constants matching contract (types.rs)
const TARGET_AMOUNT_USD = 1000_0000000n // $1,000 with 7 decimals
const MAX_AMOUNT_USD = 10_000_0000000n // $10,000 with 7 decimals
const TARGET_TIME_SECONDS = 35n * 24n * 60n * 60n // 35 days
const MAX_TIME_SECONDS = 245n * 24n * 60n * 60n // 245 days
const COMPONENT_PEAK = 2.4494897 // sqrt(6) - peak multiplier for each component

/**
 * Hermite basis function: h(t) = 3t² - 2t³
 *
 * Provides smooth acceleration/deceleration with zero derivatives at endpoints.
 * This is the key difference from linear interpolation.
 *
 * Properties:
 * - h(0) = 0
 * - h(1) = 1
 * - h'(0) = 0 (smooth start)
 * - h'(1) = 0 (smooth end)
 */
function hermiteBasis(t: number): number {
  return 3 * t * t - 2 * t * t * t
}

/**
 * Calculate amount multiplier using smooth piecewise (cubic Hermite spline)
 *
 * Matches contract logic in faction_points.rs:calculate_amount_multiplier
 *
 * @param amountUsd - Deposit amount with 7 decimals (bigint)
 * @returns Multiplier as a number (e.g., 1.5 for 1.5x)
 */
export function calculateAmountMultiplier(amountUsd: bigint): number {
  if (amountUsd <= 0n) {
    return 1.0
  }

  if (amountUsd <= TARGET_AMOUNT_USD) {
    // Rising segment: 1.0 → COMPONENT_PEAK
    const t = Number(amountUsd) / Number(TARGET_AMOUNT_USD)
    const h = hermiteBasis(t)
    return 1.0 + h * (COMPONENT_PEAK - 1.0)
  }

  if (amountUsd < MAX_AMOUNT_USD) {
    // Falling segment: COMPONENT_PEAK → 1.0
    const excess = Number(amountUsd - TARGET_AMOUNT_USD)
    const range = Number(MAX_AMOUNT_USD - TARGET_AMOUNT_USD)
    const t = excess / range
    const h = hermiteBasis(t)
    return COMPONENT_PEAK - h * (COMPONENT_PEAK - 1.0)
  }

  // Beyond max: 1.0x
  return 1.0
}

/**
 * Calculate time multiplier using smooth piecewise (cubic Hermite spline)
 *
 * Matches contract logic in faction_points.rs:calculate_time_multiplier
 *
 * @param timeHeldSeconds - Time held in seconds (bigint)
 * @returns Multiplier as a number (e.g., 2.0 for 2.0x)
 */
export function calculateTimeMultiplier(timeHeldSeconds: bigint): number {
  if (timeHeldSeconds <= 0n) {
    return 1.0
  }

  if (timeHeldSeconds <= TARGET_TIME_SECONDS) {
    // Rising segment: 1.0 → COMPONENT_PEAK
    const t = Number(timeHeldSeconds) / Number(TARGET_TIME_SECONDS)
    const h = hermiteBasis(t)
    return 1.0 + h * (COMPONENT_PEAK - 1.0)
  }

  if (timeHeldSeconds < MAX_TIME_SECONDS) {
    // Falling segment: COMPONENT_PEAK → 1.0
    const excess = Number(timeHeldSeconds - TARGET_TIME_SECONDS)
    const range = Number(MAX_TIME_SECONDS - TARGET_TIME_SECONDS)
    const t = excess / range
    const h = hermiteBasis(t)
    return COMPONENT_PEAK - h * (COMPONENT_PEAK - 1.0)
  }

  // Beyond max: 1.0x
  return 1.0
}

/**
 * Calculate combined multiplier (amount × time)
 *
 * @param amountUsd - Deposit amount with 7 decimals
 * @param timeHeldSeconds - Time held in seconds
 * @returns Combined multiplier
 */
export function calculateCombinedMultiplier(
  amountUsd: bigint,
  timeHeldSeconds: bigint
): number {
  return calculateAmountMultiplier(amountUsd) * calculateTimeMultiplier(timeHeldSeconds)
}
