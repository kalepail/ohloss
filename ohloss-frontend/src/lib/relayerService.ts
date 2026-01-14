/**
 * Relayer Service
 *
 * Handles transaction submission to OpenZeppelin Channels Relayer.
 *
 * Two modes based on environment:
 * - Development (with VITE_RELAYER_API_KEY): Uses ChannelsClient SDK
 * - Production (no API key): Direct fetch to proxy with X-Turnstile-Response header
 *
 * Pattern based on: https://github.com/kalepail/kale-site/blob/farm/src/utils/passkey-kit.ts
 */

import { ChannelsClient } from '@openzeppelin/relayer-plugin-channels'
import { useTurnstileStore } from '../stores/turnstileStore'

const RELAYER_URL = import.meta.env.VITE_RELAYER_URL || ''
const RELAYER_API_KEY = import.meta.env.VITE_RELAYER_API_KEY || ''

// Initialize ChannelsClient if we have an API key (development mode)
let channelsClient: ChannelsClient | null = null
if (RELAYER_URL && RELAYER_API_KEY) {
  channelsClient = new ChannelsClient({
    baseUrl: RELAYER_URL,
    apiKey: RELAYER_API_KEY,
  })
}

interface RelayerResponse {
  success: boolean
  hash?: string
  transactionId?: string
  status?: string
  error?: string
  errorCode?: string
}

/**
 * Send a signed transaction XDR to the Relayer for fee-bumping.
 *
 * - Dev (API key set): Uses ChannelsClient.submitTransaction()
 * - Prod (no API key): POST form data to proxy with X-Turnstile-Response header
 */
export async function sendXdr(xdr: string): Promise<RelayerResponse> {
  if (!RELAYER_URL) {
    return {
      success: false,
      error: 'Relayer URL not configured',
    }
  }

  try {
    // Development mode: Use ChannelsClient SDK
    if (channelsClient) {
      const result = await channelsClient.submitTransaction({ xdr })
      return {
        success: true,
        hash: result.hash ?? undefined,
        transactionId: result.transactionId ?? undefined,
        status: result.status ?? undefined,
      }
    }

    // Production mode: Direct fetch with Turnstile token
    const token = useTurnstileStore.getState().token
    if (!token) {
      return {
        success: false,
        error: 'Turnstile token not available. Please wait for verification.',
      }
    }

    const response = await fetch(RELAYER_URL, {
      method: 'POST',
      headers: {
        'X-Turnstile-Response': token,
      },
      body: new URLSearchParams({ xdr }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `Relayer error: ${errorText}`,
      }
    }

    const data = await response.json()
    return {
      success: true,
      hash: data.hash,
      transactionId: data.transactionId,
      status: data.status,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Relayer request failed',
    }
  }
}

/**
 * Send func + auth entries to the Relayer for transaction building and submission.
 * This is used for invokeHostFunction flows where the Relayer builds the tx envelope.
 *
 * - Dev (API key set): Uses ChannelsClient.submitSorobanTransaction()
 * - Prod (no API key): Direct fetch to proxy with Turnstile token
 */
export async function send(func: string, auth: string[]): Promise<RelayerResponse> {
  if (!RELAYER_URL) {
    return {
      success: false,
      error: 'Relayer URL not configured',
    }
  }

  try {
    // Development mode: Use ChannelsClient SDK
    if (channelsClient) {
      const result = await channelsClient.submitSorobanTransaction({ func, auth })
      return {
        success: true,
        hash: result.hash ?? undefined,
        transactionId: result.transactionId ?? undefined,
        status: result.status ?? undefined,
      }
    }

    // Production mode: Direct fetch with Turnstile token
    const token = useTurnstileStore.getState().token
    if (!token) {
      return {
        success: false,
        error: 'Turnstile token not available. Please wait for verification.',
      }
    }

    // For func+auth, we need to send JSON to the proxy
    const response = await fetch(RELAYER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Turnstile-Response': token,
      },
      body: JSON.stringify({ func, auth }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `Relayer error: ${errorText}`,
      }
    }

    const data = await response.json()
    return {
      success: true,
      hash: data.hash,
      transactionId: data.transactionId,
      status: data.status,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Relayer request failed',
    }
  }
}

/**
 * Check if the Relayer is configured
 */
export function isConfigured(): boolean {
  return !!RELAYER_URL
}
