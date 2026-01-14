import { useState, useEffect, useCallback } from 'react'
import {
  getSwapQuote,
  executeSwap,
  formatXLMAmount,
  formatUSDCAmount,
  parseXLMInput,
  type SwapQuote,
} from '@/lib/swapService'
import { AsciiLoader } from './AsciiLoader'

interface SwapPanelProps {
  xlmBalance: bigint
  address: string
  onSwapComplete: () => void
}

export function SwapPanel({ xlmBalance, address, onSwapComplete }: SwapPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [xlmAmount, setXlmAmount] = useState('')
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [isLoadingQuote, setIsLoadingQuote] = useState(false)
  const [isExecutingSwap, setIsExecutingSwap] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Debounced quote fetching
  const fetchQuote = useCallback(async (amount: string) => {
    const parsedAmount = parseXLMInput(amount)

    if (parsedAmount <= 0n) {
      setQuote(null)
      return
    }

    // Minimum swap amount check (e.g., 1 XLM)
    if (parsedAmount < 10000000n) {
      setError('Minimum swap amount is 1 XLM')
      setQuote(null)
      return
    }

    // Check balance
    if (parsedAmount > xlmBalance) {
      setError('Insufficient XLM balance')
      setQuote(null)
      return
    }

    setIsLoadingQuote(true)
    setError(null)

    const result = await getSwapQuote(parsedAmount)

    if (result.success) {
      setQuote(result.quote)
      setError(null)
    } else {
      setQuote(null)
      setError(result.error)
    }

    setIsLoadingQuote(false)
  }, [xlmBalance])

  // Debounce quote fetching
  useEffect(() => {
    const timer = setTimeout(() => {
      if (xlmAmount) {
        fetchQuote(xlmAmount)
      } else {
        setQuote(null)
        setError(null)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [xlmAmount, fetchQuote])

  const handleSwap = async () => {
    if (!quote || !address) return

    setIsExecutingSwap(true)
    setError(null)
    setSuccess(null)

    const result = await executeSwap(quote, address)

    if (result.success) {
      setSuccess(`Swap successful!`)
      setXlmAmount('')
      setQuote(null)
      onSwapComplete() // Refreshes balances to show actual received amount
    } else {
      setError(result.error)
    }

    setIsExecutingSwap(false)
  }

  const handleSetMax = () => {
    // Leave some XLM for fees (0.5 XLM buffer)
    const maxAmount = xlmBalance > 5000000n ? xlmBalance - 5000000n : 0n
    if (maxAmount > 0n) {
      setXlmAmount(formatXLMAmount(maxAmount, 7).replace(/,/g, ''))
    }
  }

  const clearMessages = () => {
    setError(null)
    setSuccess(null)
  }

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full border border-terminal-fg p-3 text-center text-terminal-fg hover:bg-terminal-fg hover:text-terminal-bg transition-colors text-xs tracking-wider"
      >
        SWAP XLM TO USDC
      </button>
    )
  }

  return (
    <div className="border border-terminal-dim p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-terminal-dim text-xs tracking-wider">SWAP XLM TO USDC</p>
        <button
          onClick={() => {
            setIsExpanded(false)
            setXlmAmount('')
            setQuote(null)
            clearMessages()
          }}
          className="text-terminal-dim hover:text-terminal-fg text-xs"
        >
          [X]
        </button>
      </div>

      {/* Error/Success Messages */}
      {(error || success) && (
        <div className={`p-3 border ${error ? 'border-red-500' : 'border-green-500'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs ${error ? 'text-red-400' : 'text-green-400'}`}>
              {error || success}
            </span>
            <button onClick={clearMessages} className="text-terminal-dim hover:text-terminal-fg text-xs">
              [X]
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-terminal-dim text-xs">AMOUNT (XLM)</label>
          <button
            onClick={handleSetMax}
            className="text-terminal-dim hover:text-terminal-fg text-[10px] underline"
          >
            MAX
          </button>
        </div>
        <input
          type="text"
          value={xlmAmount}
          onChange={(e) => setXlmAmount(e.target.value)}
          placeholder="0.00"
          className="w-full bg-terminal-bg border border-terminal-dim px-3 py-2 text-terminal-fg font-mono focus:border-terminal-fg outline-none"
        />
        <div className="text-terminal-dim text-[10px] mt-1">
          AVAILABLE: {formatXLMAmount(xlmBalance)} XLM
        </div>
      </div>

      {/* Quote Display */}
      {isLoadingQuote ? (
        <div className="flex items-center justify-center py-4">
          <AsciiLoader text="FETCHING QUOTE" />
        </div>
      ) : quote ? (
        <div className="border border-terminal-dim p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-terminal-dim">YOU RECEIVE (EST.)</span>
            <span className="text-terminal-fg font-bold">
              {formatUSDCAmount(quote.amountOut)} USDC
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-terminal-dim">MIN. RECEIVED (5% SLIPPAGE)</span>
            <span className="text-terminal-fg">
              {formatUSDCAmount(quote.minAmountOut)} USDC
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-terminal-dim">RATE</span>
            <span className="text-terminal-fg">
              1 XLM = {quote.rate.toFixed(4)} USDC
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-terminal-dim">PRICE IMPACT</span>
            <span className={quote.priceImpact > 2 ? 'text-yellow-400' : 'text-terminal-fg'}>
              {quote.priceImpact.toFixed(2)}%
            </span>
          </div>
        </div>
      ) : null}

      {/* Slippage Notice */}
      <div className="text-terminal-dim text-[10px] text-center">
        SLIPPAGE TOLERANCE: 5%
      </div>

      {/* Swap Button */}
      <button
        onClick={handleSwap}
        disabled={!quote || isExecutingSwap || isLoadingQuote}
        className="btn-retro text-sm w-full disabled:opacity-50"
      >
        {isExecutingSwap ? (
          <AsciiLoader text="SWAPPING" />
        ) : (
          'CONFIRM SWAP'
        )}
      </button>
    </div>
  )
}
