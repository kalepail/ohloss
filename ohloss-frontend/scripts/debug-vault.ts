#!/usr/bin/env bun
/**
 * Debug script to investigate vault balance rounding
 *
 * Usage: bun scripts/debug-vault.ts <ADDRESS>
 *
 * Reads from .env file automatically (bun feature)
 */

import { Client as FeeVaultClient } from 'fee-vault'
import { rpc, xdr, Address, scValToNative } from '@stellar/stellar-sdk'

const { Server: RpcServer } = rpc

// Config from env
const config = {
  rpcUrl: process.env.VITE_RPC_URL!,
  networkPassphrase: process.env.VITE_NETWORK_PASSPHRASE!,
  feeVaultContract: process.env.VITE_FEE_VAULT_CONTRACT!,
}

const SCALAR_7 = 10_000_000n

function formatWithDecimals(amount: bigint, decimals = 7): string {
  const divisor = BigInt(10 ** decimals)
  const whole = amount / divisor
  const fraction = (amount < 0n ? -amount : amount) % divisor
  return `${whole}.${fraction.toString().padStart(decimals, '0')}`
}

function buildVaultSharesKey(address: string): xdr.LedgerKey {
  const sharesKey = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Shares'),
    new Address(address).toScVal(),
  ])

  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(config.feeVaultContract).toScAddress(),
      key: sharesKey,
      durability: xdr.ContractDataDurability.persistent(),
    })
  )
}

function parseI128Balance(data: xdr.LedgerEntryData | null): bigint {
  if (!data) return 0n

  try {
    const contractData = data.contractData()
    const val = contractData.val()

    if (val.switch().name === 'scvI128') {
      const i128 = val.i128()
      const lo = BigInt(i128.lo().toString())
      const hi = BigInt(i128.hi().toString())
      return (hi << 64n) | lo
    }

    const native = scValToNative(val)
    if (typeof native === 'bigint') return native
    if (typeof native === 'number' || typeof native === 'string') return BigInt(native)

    return 0n
  } catch {
    return 0n
  }
}

async function debugVaultBalance(address: string) {
  const rpcClient = new RpcServer(config.rpcUrl)

  console.log('=== Vault Balance Debug ===')
  console.log('Address:', address)
  console.log('Fee Vault:', config.feeVaultContract)
  console.log('RPC:', config.rpcUrl)
  console.log('')

  // 1. Read shares directly via getLedgerEntries (no simulation)
  console.log('1. Reading shares directly from ledger...')
  const sharesKey = buildVaultSharesKey(address)
  const sharesResponse = await rpcClient.getLedgerEntries(sharesKey)

  let userShares = 0n
  if (sharesResponse.entries && sharesResponse.entries.length > 0) {
    userShares = parseI128Balance(sharesResponse.entries[0].val)
  }
  console.log('   User Shares (raw):', userShares.toString())
  console.log('   User Shares (formatted):', formatWithDecimals(userShares))
  console.log('')

  // 2. Get vault data via simulation
  console.log('2. Getting vault data via simulation...')
  const client = new FeeVaultClient({
    contractId: config.feeVaultContract,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
  })

  const vaultTx = await client.get_vault()
  const vaultResult = await vaultTx.simulate()
  const vault = vaultResult.result

  console.log('   Vault Data:')
  console.log('     total_shares:', vault.total_shares.toString())
  console.log('     total_b_tokens:', vault.total_b_tokens.toString())
  console.log('     b_rate:', vault.b_rate.toString(), `(${formatWithDecimals(vault.b_rate)})`)
  console.log('     admin_balance:', vault.admin_balance.toString())
  console.log('')

  // 3. Calculate user's bTokens from shares
  // user_b_tokens = (user_shares * total_b_tokens) / total_shares
  console.log('3. Manual calculation: shares → bTokens → underlying')

  const userBTokens = userShares > 0n && vault.total_shares > 0n
    ? (userShares * vault.total_b_tokens) / vault.total_shares
    : 0n

  console.log('   Step 1: shares → bTokens')
  console.log('     Formula: (user_shares * total_b_tokens) / total_shares')
  console.log('     = (' + userShares + ' * ' + vault.total_b_tokens + ') / ' + vault.total_shares)
  console.log('     = ' + userBTokens.toString())
  console.log('     User bTokens (formatted):', formatWithDecimals(userBTokens))
  console.log('')

  // 4. Calculate underlying from bTokens
  // underlying = (b_tokens * b_rate) / SCALAR_7
  const calculatedUnderlying = (userBTokens * vault.b_rate) / SCALAR_7

  console.log('   Step 2: bTokens → underlying')
  console.log('     Formula: (user_b_tokens * b_rate) / SCALAR_7')
  console.log('     = (' + userBTokens + ' * ' + vault.b_rate + ') / ' + SCALAR_7)
  console.log('     = ' + calculatedUnderlying.toString())
  console.log('     Calculated underlying (formatted):', formatWithDecimals(calculatedUnderlying))
  console.log('')

  // 5. Compare with get_underlying_tokens simulation
  console.log('4. Contract get_underlying_tokens() result:')
  const underlyingTx = await client.get_underlying_tokens({ user: address })
  const underlyingResult = await underlyingTx.simulate()
  const contractUnderlying = BigInt(underlyingResult.result)

  console.log('   Contract result (raw):', contractUnderlying.toString())
  console.log('   Contract result (formatted):', formatWithDecimals(contractUnderlying))
  console.log('')

  // 6. Show the difference
  const diff = calculatedUnderlying - contractUnderlying
  console.log('5. Comparison:')
  console.log('   Manual calculation:', formatWithDecimals(calculatedUnderlying), 'USDC')
  console.log('   Contract result:   ', formatWithDecimals(contractUnderlying), 'USDC')
  console.log('   Difference:        ', formatWithDecimals(diff), '(' + diff.toString() + ' stroops)')
  console.log('')

  // 7. Show conversion ratios
  console.log('6. Conversion ratios:')
  const bTokensPerShare = vault.total_shares > 0n
    ? Number(vault.total_b_tokens) / Number(vault.total_shares)
    : 0
  console.log('   bTokens per Share:', bTokensPerShare.toFixed(7))

  const underlyingPerBToken = Number(vault.b_rate) / Number(SCALAR_7)
  console.log('   Underlying per bToken (b_rate):', underlyingPerBToken.toFixed(7))

  const effectiveRate = bTokensPerShare * underlyingPerBToken
  console.log('   Effective underlying per share:', effectiveRate.toFixed(7))
  console.log('')

  // 8. Rounding loss analysis
  console.log('7. Rounding loss analysis:')
  const exactBTokens = Number(userShares) * Number(vault.total_b_tokens) / Number(vault.total_shares)
  const truncatedBTokens = Number(userBTokens)
  const bTokenRoundingLoss = exactBTokens - truncatedBTokens
  console.log('   Exact bTokens (float):', exactBTokens.toFixed(7))
  console.log('   Truncated bTokens:', truncatedBTokens)
  console.log('   bToken rounding loss:', bTokenRoundingLoss.toFixed(7))

  const exactUnderlying = truncatedBTokens * Number(vault.b_rate) / Number(SCALAR_7)
  const truncatedUnderlying = Number(calculatedUnderlying)
  const underlyingRoundingLoss = exactUnderlying - truncatedUnderlying
  console.log('   Exact underlying (float):', exactUnderlying.toFixed(7))
  console.log('   Truncated underlying:', truncatedUnderlying)
  console.log('   Underlying rounding loss:', underlyingRoundingLoss.toFixed(7))
}

// Main
const address = process.argv[2] || process.env.VITE_DEBUG_ADDRESS

if (!address) {
  console.error('Usage: bun scripts/debug-vault.ts <ADDRESS>')
  console.error('   or: Set VITE_DEBUG_ADDRESS in .env')
  console.error('')
  console.error('Example: bun scripts/debug-vault.ts CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC')
  process.exit(1)
}

if (!config.rpcUrl || !config.feeVaultContract) {
  console.error('Missing required env vars. Make sure .env has:')
  console.error('  VITE_RPC_URL')
  console.error('  VITE_NETWORK_PASSPHRASE')
  console.error('  VITE_FEE_VAULT_CONTRACT')
  process.exit(1)
}

debugVaultBalance(address).catch(console.error)
