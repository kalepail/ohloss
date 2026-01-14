// Swap service for XLM -> USDC via Soroswap Aggregator
// Uses Cloudflare Worker backend for quote (API key secure)
// Transaction building, signing, and submission happens client-side

import {
  TransactionBuilder,
  xdr,
  Networks,
  Contract,
  Address,
  nativeToScVal,
  rpc,
} from '@stellar/stellar-sdk'
import { getKit } from './smartAccount'
import { sendXdr as relayerSendXdr, isConfigured as relayerIsConfigured } from './relayerService'

const { Server: RpcServer, Api: RpcApi, assembleTransaction } = rpc

const SCALAR_7 = 10_000_000n
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE || Networks.PUBLIC
const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://mainnet.sorobanrpc.com'
const API_URL = import.meta.env.VITE_API_URL || ''

// Mainnet contract addresses
const AGGREGATOR_CONTRACT = 'CAYP3UWLJM7ZPTUKL6R6BFGTRWLZ46LRKOXTERI2K6BIJAWGYY62TXTO'
const XLM_CONTRACT = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA'
const USDC_CONTRACT = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'

// Protocol ID mapping (matches aggregator contract enum)
const PROTOCOL_IDS: Record<string, number> = {
  soroswap: 0,
  phoenix: 1,
  aqua: 2,
  comet: 3,
}

// Route plan item from API response
interface RoutePlanItem {
  protocol_id: string
  path: string[]
  parts: number
  is_exact_in?: boolean
  poolHashes?: string[] // For aqua protocol
}

// API response types
interface QuoteResponse {
  assetIn: string
  amountIn: string
  assetOut: string
  amountOut: string | number
  otherAmountThreshold: string | number
  priceImpactPct: string
  platform: string
  rawTrade: {
    amountIn: string
    amountOutMin: string
    distribution: RoutePlanItem[]
  }
  routePlan: unknown[] // For display only, not used for tx building
}

export interface SwapQuote {
  amountIn: bigint
  amountOut: bigint
  minAmountOut: bigint // After slippage
  priceImpact: number
  rate: number // USDC per XLM
  distribution: RoutePlanItem[] // For building the swap transaction
}

/**
 * Get a swap quote for XLM -> USDC
 * @param xlmAmount Amount of XLM in stroops (7 decimals)
 * @param slippageBps Slippage tolerance in basis points (default 500 = 5%)
 */
export async function getSwapQuote(
  xlmAmount: bigint,
  slippageBps = 500
): Promise<{ success: true; quote: SwapQuote } | { success: false; error: string }> {
  try {
    const response = await fetch(`${API_URL}/api/swap/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountIn: xlmAmount.toString(),
        slippageBps,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      return { success: false, error: errorData.error || `HTTP ${response.status}` }
    }

    const data: QuoteResponse = await response.json()

    const amountIn = BigInt(data.amountIn)
    const amountOut = BigInt(Math.floor(Number(data.amountOut)))
    const minAmountOut = BigInt(data.rawTrade.amountOutMin)
    const priceImpact = parseFloat(data.priceImpactPct)

    // Calculate rate: USDC per XLM
    const rate = Number(amountOut) / Number(amountIn)

    return {
      success: true,
      quote: {
        amountIn,
        amountOut,
        minAmountOut,
        priceImpact,
        rate,
        distribution: data.rawTrade.distribution,
      },
    }
  } catch (error) {
    console.error('Error getting swap quote:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get quote',
    }
  }
}

/**
 * Decode base64 to Uint8Array (browser-compatible)
 */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/**
 * Convert pool hashes to ScVal (Option<Vec<BytesN<32>>>)
 */
function poolHashesToScVal(poolHashes?: string[]): xdr.ScVal {
  if (!poolHashes || poolHashes.length === 0) {
    return xdr.ScVal.scvVoid()
  }

  const scVec: xdr.ScVal[] = poolHashes.map((base64Str) => {
    const bytes = base64ToBytes(base64Str)
    if (bytes.length !== 32) {
      throw new Error(`Expected 32 bytes, got ${bytes.length}`)
    }
    return xdr.ScVal.scvBytes(bytes)
  })

  return xdr.ScVal.scvVec(scVec)
}

/**
 * Convert distribution to DexDistribution ScVal for the aggregator contract
 */
function routePlanToDistributionScVal(distribution: RoutePlanItem[]): xdr.ScVal {
  const distributions = distribution.map((item) => {
    const protocolId = PROTOCOL_IDS[item.protocol_id.toLowerCase()]
    if (protocolId === undefined) {
      throw new Error(`Unknown protocol_id: ${item.protocol_id}`)
    }

    // Build the struct map - fields must be in alphabetical order for Soroban
    return xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('bytes'),
        val: poolHashesToScVal(item.poolHashes),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('parts'),
        val: nativeToScVal(item.parts, { type: 'u32' }),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('path'),
        val: nativeToScVal(item.path.map((addr) => new Address(addr))),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('protocol_id'),
        val: nativeToScVal(protocolId, { type: 'u32' }),
      }),
    ])
  })

  return xdr.ScVal.scvVec(distributions)
}

/**
 * Build and simulate the swap transaction
 * Returns a simulated transaction ready for auth signing
 * @param quote The quote from getSwapQuote
 * @param fromAddress The sender's contract address (C-address)
 */
async function buildAndSimulateSwapTransaction(
  quote: SwapQuote,
  fromAddress: string
): Promise<{ success: true; transaction: ReturnType<typeof assembleTransaction> } | { success: false; error: string }> {
  try {
    const kit = getKit()
    const server = new RpcServer(RPC_URL)
    const contract = new Contract(AGGREGATOR_CONTRACT)

    // Use kit's deployer as transaction source (fee payer)
    // The smart wallet authorizes via auth entries, not as tx source
    const deployerPubKey = kit.deployerPublicKey

    // Deadline: 1 hour from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

    // Build the contract invocation
    const invokeArgs = [
      nativeToScVal(new Address(XLM_CONTRACT)),                    // token_in
      nativeToScVal(new Address(USDC_CONTRACT)),                   // token_out
      nativeToScVal(quote.amountIn, { type: 'i128' }),             // amount_in
      nativeToScVal(quote.minAmountOut, { type: 'i128' }),         // amount_out_min
      routePlanToDistributionScVal(quote.distribution),            // distribution
      nativeToScVal(new Address(fromAddress)),                     // to (smart wallet receives the output)
      nativeToScVal(deadline, { type: 'u64' }),                    // deadline
    ]

    const invokeOp = contract.call('swap_exact_tokens_for_tokens', ...invokeArgs)

    // Get the deployer account from network for correct sequence number
    const deployerAccount = await server.getAccount(deployerPubKey)
    const transaction = new TransactionBuilder(deployerAccount, {
      fee: '10000000', // 1 XLM max fee (will be sponsored via Relayer)
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(invokeOp)
      .setTimeout(300) // 5 minute timeout
      .build()

    // Simulate to get auth entries and resource costs
    const simResult = await server.simulateTransaction(transaction)

    if (RpcApi.isSimulationError(simResult)) {
      console.error('Simulation error:', simResult)
      return { success: false, error: `Simulation failed: ${simResult.error}` }
    }

    // Assemble the transaction with simulation results
    const assembledTx = assembleTransaction(transaction, simResult)

    return { success: true, transaction: assembledTx }
  } catch (error) {
    console.error('Error building swap transaction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build transaction',
    }
  }
}

/**
 * Execute the full swap flow: build -> sign -> submit
 * @param quote The pre-fetched quote from getSwapQuote
 * @param fromAddress The sender's contract address
 */
export async function executeSwap(
  quote: SwapQuote,
  fromAddress: string
): Promise<{
  success: true
  hash: string
  amountIn: bigint
  amountOut: bigint
} | {
  success: false
  error: string
}> {
  try {
    const kit = getKit()

    if (!kit.isConnected) {
      return { success: false, error: 'Wallet not connected' }
    }

    // Step 1: Build and simulate transaction
    const buildResult = await buildAndSimulateSwapTransaction(quote, fromAddress)
    if (!buildResult.success) {
      return { success: false, error: `Build failed: ${buildResult.error}` }
    }

    // Step 3: Sign auth entries with passkey
    const builtTx = buildResult.transaction.build()
    const op = builtTx.operations[0]

    if (op.type !== 'invokeHostFunction') {
      return { success: false, error: 'Invalid operation type' }
    }

    const auth = op.auth || []
    const signedAuth: xdr.SorobanAuthorizationEntry[] = []

    for (const authEntry of auth) {
      const signedEntry = await kit.signAuthEntry(authEntry)
      signedAuth.push(signedEntry)
    }

    // Rebuild transaction with signed auth entries
    const txEnvelope = xdr.TransactionEnvelope.fromXDR(builtTx.toXDR(), 'base64')

    if (txEnvelope.switch().name !== 'envelopeTypeTx') {
      return { success: false, error: 'Invalid transaction envelope type' }
    }

    const v1 = txEnvelope.v1()
    const txBody = v1.tx()
    const ops = txBody.operations()
    const firstOp = ops[0]
    const opBody = firstOp.body()
    const invokeOp = opBody.invokeHostFunctionOp()

    const newInvokeOp = new xdr.InvokeHostFunctionOp({
      hostFunction: invokeOp.hostFunction(),
      auth: signedAuth,
    })

    const newOpBody = xdr.OperationBody.invokeHostFunction(newInvokeOp)
    const newOp = new xdr.Operation({
      sourceAccount: firstOp.sourceAccount(),
      body: newOpBody,
    })

    const newTxBody = new xdr.Transaction({
      sourceAccount: txBody.sourceAccount(),
      fee: txBody.fee(),
      seqNum: txBody.seqNum(),
      cond: txBody.cond(),
      memo: txBody.memo(),
      operations: [newOp],
      ext: txBody.ext(),
    })

    const signedEnvelope = xdr.TransactionEnvelope.envelopeTypeTx(
      new xdr.TransactionV1Envelope({
        tx: newTxBody,
        signatures: v1.signatures(),
      })
    )

    const signedXdr = signedEnvelope.toXDR('base64')

    // Step 4: Submit via Relayer (if configured) or direct RPC
    let submitResult: { success: boolean; hash?: string; error?: string }

    if (relayerIsConfigured()) {
      submitResult = await relayerSendXdr(signedXdr)
    } else {
      // Direct RPC submission - note: this won't work for smart wallets without fee sponsorship
      const server = new RpcServer(RPC_URL)
      try {
        const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)
        const response = await server.sendTransaction(signedTx)
        // sendTransaction returns PENDING on success, ERROR/DUPLICATE/TRY_AGAIN_LATER on failure
        if (response.status === 'PENDING') {
          submitResult = { success: true, hash: response.hash }
        } else {
          submitResult = { success: false, error: `Transaction failed: ${response.status}` }
        }
      } catch (err) {
        submitResult = { success: false, error: err instanceof Error ? err.message : 'RPC submission failed' }
      }
    }

    if (!submitResult.success) {
      return { success: false, error: submitResult.error || 'Transaction failed' }
    }

    return {
      success: true,
      hash: submitResult.hash || '',
      amountIn: quote.amountIn,
      amountOut: quote.amountOut,
    }
  } catch (error) {
    console.error('Error executing swap:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute swap',
    }
  }
}

/**
 * Format XLM amount (7 decimals) to display string
 */
export function formatXLMAmount(amount: bigint, decimals = 4): string {
  const whole = amount / SCALAR_7
  const fraction = amount % SCALAR_7
  const fractionStr = fraction.toString().padStart(7, '0').slice(0, decimals)
  return `${whole.toLocaleString()}.${fractionStr}`
}

/**
 * Format USDC amount (7 decimals) to display string
 * Uses truncation (not rounding) to never show more than actual value
 */
export function formatUSDCAmount(amount: bigint, decimals = 4): string {
  const whole = amount / SCALAR_7
  const fraction = amount % SCALAR_7
  const fractionStr = fraction.toString().padStart(7, '0').slice(0, decimals)
  return `${whole.toLocaleString()}.${fractionStr}`
}

/**
 * Parse XLM input string to bigint (7 decimals)
 */
export function parseXLMInput(amount: string): bigint {
  const cleaned = amount.replace(/,/g, '').trim()
  if (!cleaned || isNaN(Number(cleaned))) return 0n

  const [whole, fraction = ''] = cleaned.split('.')
  const wholeNum = BigInt(whole || '0')
  const fractionPadded = fraction.padEnd(7, '0').slice(0, 7)
  return wholeNum * SCALAR_7 + BigInt(fractionPadded)
}
