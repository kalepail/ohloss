/**
 * SignerPage - Popup window for cross-app transaction signing
 *
 * This page is opened as a popup by game apps that need to sign transactions.
 * It handles postMessage communication with the opener window.
 *
 * Full onboarding flow:
 * 1. Connect or create wallet
 * 2. Check if player has selected a faction
 * 3. If no faction, show faction selection UI
 * 4. After faction selected, proceed with signing request
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { xdr, Address } from '@stellar/stellar-sdk'
import { useWalletStore } from '@/stores/walletStore'
import { Radio } from '@/components/ui'
import {
  getKit,
  connectWallet,
  createWallet,
  isConfigured,
} from '@/lib/smartAccount'
import {
  type PendingCredential,
  loadPendingCredentialsSorted,
  deployPendingCredentialOrThrow,
  deletePendingCredentialSafe,
  formatAge,
  formatCreatedAt,
  formatCredentialIdShort,
} from '@/lib/pendingPasskeys'
import { getPlayerData, selectFaction } from '@/lib/contractService'
import { getFactionName, getFactionSymbol, FACTION_NAMES } from '@/stores/ohlossStore'

// Message types (matching game-frontend/src/types/messages.ts)
interface BaseMessage {
  type: string
  origin: string
  timestamp: number
}

interface ConnectRequest extends BaseMessage {
  type: 'CONNECT_REQUEST'
  appName: string
  appIcon?: string
}

interface SignTransactionRequest extends BaseMessage {
  type: 'SIGN_TRANSACTION_REQUEST'
  requestId: string
  transactionXdr: string
  description: string
  submit?: boolean
}

interface SignAuthEntryRequest extends BaseMessage {
  type: 'SIGN_AUTH_ENTRY_REQUEST'
  requestId: string
  authEntryXdr: string
  description: string
}

interface WalletUiErrorRequest extends BaseMessage {
  type: 'WALLET_UI_ERROR'
  error: string
}

type IncomingMessage =
  | ConnectRequest
  | SignTransactionRequest
  | SignAuthEntryRequest
  | WalletUiErrorRequest

interface PendingRequest {
  id: string
  type: 'transaction' | 'auth_entry'
  description: string
  xdr: string
  submit?: boolean
  timestamp: number
}

export function SignerPage() {
  const { address, setAddress } = useWalletStore()

  // State
  const [mode, setMode] = useState<'initializing' | 'connecting' | 'connected' | 'faction_select' | 'signing' | 'success' | 'error'>('initializing')
  const [appInfo, setAppInfo] = useState<{ name: string; icon?: string; origin: string } | null>(null)
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null)
  const pendingRequestRef = useRef<PendingRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Initializing...')

  // Faction selection state
  const [selectedFaction, setSelectedFaction] = useState<number | null>(null)
  const [isSelectingFaction, setIsSelectingFaction] = useState(false)

  // Orphaned passkeys (pending credentials that were created but not deployed)
  const [pendingCredentials, setPendingCredentials] = useState<PendingCredential[]>([])
  const [createChoice, setCreateChoice] = useState<'pending' | 'new'>('new')
  const [selectedPendingCredentialId, setSelectedPendingCredentialId] = useState<string | null>(null)
  const [isDeployingPending, setIsDeployingPending] = useState(false)

  // Track response state
  const responsesSentRef = useRef<Set<string>>(new Set())
  const openerRef = useRef<Window | null>(null)
  const initCompleteRef = useRef(false)
  const pendingConnectRequestRef = useRef<{ origin: string; appName: string; appIcon?: string } | null>(null)
  const addressRef = useRef<string | null>(null) // Track address in ref to avoid stale closures

  // Keep pendingRequest in a ref to avoid stale reads inside initialization flow.
  useEffect(() => {
    pendingRequestRef.current = pendingRequest
  }, [pendingRequest])

  // Get opener window
  useEffect(() => {
    openerRef.current = window.opener
    if (!openerRef.current) {
      setError('This page must be opened as a popup from a game')
      setMode('error')
    }
  }, [])

  // Send message to opener
  const sendToOpener = useCallback((message: object, targetOrigin: string) => {
    if (openerRef.current && !openerRef.current.closed) {
      openerRef.current.postMessage(message, targetOrigin)
    }
  }, [])

  // Best-effort broadcast to opener when we don't yet know the opener's origin.
  // This is safe because the message is only delivered to the opener window.
  const broadcastToOpener = useCallback((message: object) => {
    if (openerRef.current && !openerRef.current.closed) {
      openerRef.current.postMessage(message, '*')
    }
  }, [])

  // Check faction status for sign requests (when already connected)
  // Defined as useCallback so it can be referenced in handleMessage
  const checkFactionForSignRequest = useCallback(async (walletAddress: string) => {
    try {
      // Add timeout to prevent hanging forever
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 30000) // 30 second timeout
      })

      const player = await Promise.race([
        getPlayerData(walletAddress),
        timeoutPromise
      ])

      if (!player || player.selected_faction === undefined || player.selected_faction === null) {
        // No faction - show selection UI
        setMode('faction_select')
      } else {
        // Has faction - proceed to signing
        setMode('signing')
      }
    } catch (err) {
      console.error('[SignerPage] Error checking faction for sign request:', err)
      // On error, assume no faction and show selection
      setMode('faction_select')
    }
  }, [])

  // Check faction status for connect requests (when already connected)
  const checkFactionForConnectRequest = useCallback(async (walletAddress: string, origin: string) => {
    console.log('[SignerPage] checkFactionForConnectRequest:', walletAddress, origin)
    try {
      // Add timeout to prevent hanging forever
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 30000) // 30 second timeout
      })

      const player = await Promise.race([
        getPlayerData(walletAddress),
        timeoutPromise
      ])
      console.log('[SignerPage] Player data:', player)

      if (!player || player.selected_faction === undefined || player.selected_faction === null) {
        // No faction - show selection UI
        console.log('[SignerPage] No faction, showing selection')
        setMode('faction_select')
      } else {
        // Has faction - send connect response and close
        console.log('[SignerPage] Has faction:', player.selected_faction, '- sending response')
        sendToOpener({
          type: 'CONNECT_RESPONSE',
          origin: window.location.origin,
          timestamp: Date.now(),
          success: true,
          address: walletAddress,
        }, origin)
        setTimeout(() => window.close(), 100)
      }
    } catch (err) {
      console.error('[SignerPage] Error checking faction for connect request:', err)
      // On error, assume no faction and show selection
      console.log('[SignerPage] Falling back to faction selection due to error')
      setMode('faction_select')
    }
  }, [sendToOpener])

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    console.log('[SignerPage] Message received:', event.data?.type, 'from:', event.origin)

    // Validate that we have an opener
    if (!openerRef.current) {
      console.log('[SignerPage] No opener, ignoring message')
      return
    }

    // Only accept messages from the opener window that created this popup.
    // Prevents cross-talk if other tabs/windows post similar messages.
    if (event.source !== openerRef.current) {
      return
    }

    // For security, you might want to validate the origin
    // For now, we accept messages from any origin since games can be on different domains
    const data = event.data as IncomingMessage

    if (!data || typeof data.type !== 'string') {
      console.log('[SignerPage] Invalid message format')
      return
    }

    switch (data.type) {
      case 'WALLET_UI_ERROR': {
        const req = data as WalletUiErrorRequest
        // The game pre-opened the popup but failed before it could send a signing request.
        // Show the error so users aren't left staring at "Connected" with no context.
        setError(req.error || 'Request failed')
        // Keep whatever mode we're in, but if we're idle, stay on connected.
        if (!pendingRequestRef.current) {
          setMode('connected')
        }
        break
      }

      case 'CONNECT_REQUEST': {
        const req = data as ConnectRequest
        console.log('[SignerPage] CONNECT_REQUEST received:', req)
        setAppInfo({
          name: req.appName,
          icon: req.appIcon,
          origin: event.origin,
        })

        // If init hasn't completed yet, store this request for later processing
        if (!initCompleteRef.current) {
          console.log('[SignerPage] Init not complete, storing connect request for later')
          pendingConnectRequestRef.current = {
            origin: event.origin,
            appName: req.appName,
            appIcon: req.appIcon,
          }
          // Mode is already 'initializing', just wait
          break
        }

        // Init is complete - check connection status using ref (avoids stale closure)
        const kit = getKit()
        const currentAddress = addressRef.current
        console.log('[SignerPage] kit.isConnected:', kit.isConnected, 'addressRef:', currentAddress)
        if (kit.isConnected && currentAddress) {
          // Trigger faction check - will send response and close if faction exists
          console.log('[SignerPage] Checking faction for:', currentAddress)
          setMode('initializing')
          setStatusMessage('Checking account status...')
          checkFactionForConnectRequest(currentAddress, event.origin)
        } else {
          // Not connected - show connecting UI
          console.log('[SignerPage] Not connected, showing connect UI')
          setMode('connecting')
        }
        break
      }

      case 'SIGN_TRANSACTION_REQUEST': {
        const req = data as SignTransactionRequest
        console.log('[SignerPage] SIGN_TRANSACTION_REQUEST received:', req.requestId)

        // Check if we already handled this request
        if (responsesSentRef.current.has(req.requestId)) return

        setPendingRequest({
          id: req.requestId,
          type: 'transaction',
          description: req.description,
          xdr: req.transactionXdr,
          submit: req.submit,
          timestamp: req.timestamp,
        })
        setAppInfo(prev => prev || { name: 'Game', origin: event.origin })

        // If init hasn't completed yet, don't try to inspect kit state.
        // We'll process this request after restore completes.
        if (!initCompleteRef.current) {
          setMode('initializing')
          setStatusMessage('Restoring session...')
          break
        }

        // Verify actual kit connection state before proceeding
        const kit = getKit()
        const currentAddress = addressRef.current
        console.log('[SignerPage] kit.isConnected:', kit.isConnected, 'currentAddress:', currentAddress)

        if (kit.isConnected && currentAddress) {
          // Connected - verify faction status
          setMode('initializing')
          setStatusMessage('Checking account status...')
          checkFactionForSignRequest(currentAddress)
        } else {
          // Need to connect first - show connecting state
          setMode('connecting')
          setStatusMessage('Please connect your wallet to sign this request')
        }
        break
      }

      case 'SIGN_AUTH_ENTRY_REQUEST': {
        const req = data as SignAuthEntryRequest
        console.log('[SignerPage] SIGN_AUTH_ENTRY_REQUEST received:', req.requestId)

        if (responsesSentRef.current.has(req.requestId)) return

        setPendingRequest({
          id: req.requestId,
          type: 'auth_entry',
          description: req.description,
          xdr: req.authEntryXdr,
          timestamp: req.timestamp,
        })
        setAppInfo(prev => prev || { name: 'Game', origin: event.origin })

        // If init hasn't completed yet, don't try to inspect kit state.
        // We'll process this request after restore completes.
        if (!initCompleteRef.current) {
          setMode('initializing')
          setStatusMessage('Restoring session...')
          break
        }

        // Verify actual kit connection state before proceeding
        const kit = getKit()
        const currentAddress = addressRef.current
        console.log('[SignerPage] kit.isConnected:', kit.isConnected, 'currentAddress:', currentAddress)

        if (kit.isConnected && currentAddress) {
          // Connected - verify faction status
          setMode('initializing')
          setStatusMessage('Checking account status...')
          checkFactionForSignRequest(currentAddress)
        } else {
          // Need to connect first - show connecting state
          setMode('connecting')
          setStatusMessage('Please connect your wallet to sign this request')
        }
        break
      }
    }
  }, [sendToOpener, checkFactionForSignRequest, checkFactionForConnectRequest])

  // Set up message listener
  useEffect(() => {
    window.addEventListener('message', handleMessage)

    // Let the opener know we're ready to receive requests (prevents race conditions
    // where the game posts before the listener is attached).
    broadcastToOpener({
      type: 'WALLET_STATUS_UPDATE',
      origin: window.location.origin,
      timestamp: Date.now(),
      status: 'ready',
    })

    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage, broadcastToOpener])

  // Notify opener when closed
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (appInfo?.origin) {
        sendToOpener({
          type: 'WALLET_STATUS_UPDATE',
          origin: window.location.origin,
          timestamp: Date.now(),
          status: 'closed',
        }, appInfo.origin)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [appInfo?.origin, sendToOpener])

  // Load pending credentials when showing connect UI.
  // This mirrors the frontend-v2 home page behavior for "orphaned passkeys".
  useEffect(() => {
    if (mode !== 'connecting') return
    if (!isConfigured()) return

    const load = async () => {
      try {
        const sorted = await loadPendingCredentialsSorted()
        setPendingCredentials(sorted)
        if (sorted.length > 0) {
          setCreateChoice('pending')
          setSelectedPendingCredentialId((prev) => prev || sorted[0].credentialId)
        } else {
          setCreateChoice('new')
          setSelectedPendingCredentialId(null)
        }
      } catch (err) {
        console.warn('[SignerPage] Failed to load pending credentials:', err)
        setPendingCredentials([])
        setCreateChoice('new')
        setSelectedPendingCredentialId(null)
      }
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Initialize: Try silent restore from IndexedDB storage
  useEffect(() => {
    // Reset refs on mount (important for StrictMode double-mounting)
    initCompleteRef.current = false
    addressRef.current = null

    const initialize = async () => {
      console.log('[SignerPage] Starting initialization...')
      setStatusMessage('Restoring session...')

      let restoredAddress: string | null = null

      try {
        // Try silent restore first (no passkey prompt)
        const result = await connectWallet()
        console.log('[SignerPage] connectWallet result:', result)

        if (result) {
          // Successfully restored session
          restoredAddress = result.contractId
          addressRef.current = result.contractId // Update ref immediately
          setAddress(result.contractId)
          console.log('[SignerPage] Session restored, address:', result.contractId)
        } else {
          // No stored session - user needs to connect
          console.log('[SignerPage] No stored session')
        }
      } catch (err) {
        console.error('[SignerPage] Init error:', err)
      }

      // Mark init as complete
      initCompleteRef.current = true
      console.log('[SignerPage] Init complete, restoredAddress:', restoredAddress)

      // Check if there's a pending connect request to process
      const pendingConnect = pendingConnectRequestRef.current
      const pendingSign = pendingRequestRef.current
      console.log('[SignerPage] Pending connect request:', pendingConnect)
      console.log('[SignerPage] Pending sign request:', pendingSign?.id)

      if (pendingConnect) {
        console.log('[SignerPage] Processing pending connect request')
        pendingConnectRequestRef.current = null

        if (restoredAddress) {
          // We have a session - check faction status
          console.log('[SignerPage] Has session, checking faction...')
          setMode('initializing')
          setStatusMessage('Checking account status...')
          checkFactionForConnectRequest(restoredAddress, pendingConnect.origin)
        } else {
          // No session - show connect UI
          console.log('[SignerPage] No session, showing connect UI')
          setMode('connecting')
          setStatusMessage('')
        }
        return
      }

      // If a sign request arrived while we were initializing, process it now.
      if (pendingSign) {
        if (restoredAddress) {
          setMode('initializing')
          setStatusMessage('Checking account status...')
          checkFactionForSignRequest(restoredAddress)
        } else {
          setMode('connecting')
          setStatusMessage('Please connect your wallet to sign this request')
        }
        return
      }

      // No pending request - just set mode based on session status
      console.log('[SignerPage] No pending request, setting mode based on session')
      if (restoredAddress) {
        console.log('[SignerPage] Setting mode to connected')
        setMode('connected')
        setStatusMessage('Session restored')
      } else {
        console.log('[SignerPage] Setting mode to connecting')
        setMode('connecting')
        setStatusMessage('')
      }
    }

    initialize()

    // Cleanup on unmount
    return () => {
      console.log('[SignerPage] Cleanup - resetting refs')
      initCompleteRef.current = false
    }
  }, [setAddress, checkFactionForConnectRequest])

  // Check if player has selected a faction
  const checkFactionAndProceed = async (walletAddress: string) => {
    setStatusMessage('Checking account status...')

    try {
      // Add timeout to prevent hanging forever
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 30000) // 30 second timeout
      })

      const player = await Promise.race([
        getPlayerData(walletAddress),
        timeoutPromise
      ])

      // Check if player has selected a faction
      if (!player || player.selected_faction === undefined || player.selected_faction === null) {
        // No faction selected - show faction selection UI
        setMode('faction_select')
        return false
      }

      // Player has faction - proceed based on whether there's a pending request
      if (pendingRequest) {
        setMode('signing')
      } else {
        // Just connecting, send response and close
        if (appInfo?.origin) {
          sendToOpener({
            type: 'CONNECT_RESPONSE',
            origin: window.location.origin,
            timestamp: Date.now(),
            success: true,
            address: walletAddress,
          }, appInfo.origin)
          setTimeout(() => window.close(), 100)
        } else {
          setMode('connected')
        }
      }
      return true
    } catch (err) {
      console.error('[SignerPage] Error checking faction:', err)
      // On error, assume no faction and show selection
      setMode('faction_select')
      return false
    }
  }

  // Handle faction selection
  const handleSelectFaction = async (faction: number) => {
    if (!address) return

    setIsSelectingFaction(true)
    setSelectedFaction(faction)
    setStatusMessage(`Selecting ${getFactionName(faction)}...`)

    try {
      const result = await selectFaction(address, faction)

      if (result.success) {
        // Ensure the faction selection is visible on-chain before continuing.
        // This avoids races where the game immediately tries to start a session
        // but the faction gate still fails due to ledger propagation.
        const waitForFaction = async () => {
          const start = Date.now()
          while (Date.now() - start < 15_000) {
            try {
              const p = await getPlayerData(address)
              if (p && p.selected_faction !== undefined && p.selected_faction !== null) {
                return
              }
            } catch {
              // ignore
            }
            await new Promise((r) => setTimeout(r, 750))
          }
        }

        await waitForFaction()

        // Faction selected successfully - proceed
        if (pendingRequest) {
          setMode('signing')
        } else if (appInfo?.origin) {
          // Just connecting, send response and close
          sendToOpener({
            type: 'CONNECT_RESPONSE',
            origin: window.location.origin,
            timestamp: Date.now(),
            success: true,
            address,
          }, appInfo.origin)
          setTimeout(() => window.close(), 100)
        } else {
          setMode('connected')
        }
      } else {
        setError(result.error || 'Failed to select faction')
      }
    } catch (err) {
      console.error('[SignerPage] Error selecting faction:', err)
      setError(err instanceof Error ? err.message : 'Failed to select faction')
    } finally {
      setIsSelectingFaction(false)
      setSelectedFaction(null)
    }
  }

  // Handle wallet connection
  const handleConnect = async () => {
    if (!isConfigured()) {
      setError('Wallet not configured')
      setMode('error')
      return
    }

    setStatusMessage('Authenticating with passkey...')
    setIsProcessing(true)

    try {
      const result = await connectWallet({ prompt: true })

      if (result) {
        addressRef.current = result.contractId
        setAddress(result.contractId)

        // Check faction status before proceeding
        await checkFactionAndProceed(result.contractId)
      } else {
        setError('No wallet found. Please create one first.')
        setMode('error')
      }
    } catch (err) {
      console.error('[SignerPage] Connect error:', err)
      setError(err instanceof Error ? err.message : 'Connection failed')
      setMode('error')

      if (appInfo?.origin) {
        sendToOpener({
          type: 'CONNECT_RESPONSE',
          origin: window.location.origin,
          timestamp: Date.now(),
          success: false,
          error: err instanceof Error ? err.message : 'Connection failed',
        }, appInfo.origin)
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const refreshPendingCredentials = async () => {
    try {
      const sorted = await loadPendingCredentialsSorted()
      setPendingCredentials(sorted)
      if (sorted.length > 0) {
        setCreateChoice('pending')
        setSelectedPendingCredentialId((prev) => prev || sorted[0].credentialId)
      } else {
        setCreateChoice('new')
        setSelectedPendingCredentialId(null)
      }
    } catch {
      setPendingCredentials([])
      setCreateChoice('new')
      setSelectedPendingCredentialId(null)
    }
  }

  // Mimics HomePage: deploy oldest pending credential by default.
  const handleCompleteRegistration = async () => {
    const oldest = pendingCredentials[0]
    if (!oldest) return
    setSelectedPendingCredentialId(oldest.credentialId)
    await handleDeployPending(oldest.credentialId)
  }

  const handleDeployPending = async (credentialId?: string) => {
    const id = credentialId || selectedPendingCredentialId
    if (!id) return

    setIsDeployingPending(true)
    setError(null)
    setStatusMessage('Deploying existing passkey...')

    try {
      const contractId = await deployPendingCredentialOrThrow(id)
      addressRef.current = contractId
      setAddress(contractId)

      // After deployment, proceed with the normal gating flow.
      await checkFactionAndProceed(contractId)
    } catch (err) {
      console.error('[SignerPage] Deploy pending credential error:', err)
      setError(err instanceof Error ? err.message : 'Failed to deploy existing passkey')

      // IMPORTANT: do not delete/hide pending passkeys on failure.
      // Refresh list (deployment attempt may have changed pending set)
      await refreshPendingCredentials()
    } finally {
      setIsDeployingPending(false)
    }
  }

  const handleDeletePending = async () => {
    if (!selectedPendingCredentialId) return

    const ok = window.confirm(
      'Remove this pending passkey from this device?\n\nUse this if you no longer have access to that passkey (for example, it was created on a device you no longer have).'
    )
    if (!ok) return

    setIsDeployingPending(true)
    setError(null)
    setStatusMessage('Removing pending passkey...')

    try {
      await deletePendingCredentialSafe(selectedPendingCredentialId)
      await refreshPendingCredentials()
    } catch (err) {
      console.error('[SignerPage] Delete pending credential error:', err)
      setError(err instanceof Error ? err.message : 'Failed to remove pending passkey')
    } finally {
      setIsDeployingPending(false)
    }
  }

  // Handle creating a new wallet
  const handleCreateWallet = async () => {
    if (!isConfigured()) {
      setError('Wallet not configured')
      return
    }

    setStatusMessage('Creating new wallet...')
    setIsProcessing(true)

    try {
      const result = await createWallet()
      addressRef.current = result.contractId
      setAddress(result.contractId)

      // New wallet - they definitely need to select a faction
      setMode('faction_select')
    } catch (err) {
      console.error('[SignerPage] Create wallet error:', err)
      setError(err instanceof Error ? err.message : 'Failed to create wallet')
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle signing approval
  const handleApprove = async () => {
    if (!pendingRequest || !appInfo?.origin) return

    setIsProcessing(true)
    setStatusMessage(pendingRequest.type === 'transaction' ? 'Signing transaction...' : 'Signing auth entry...')

    try {
      const kit = getKit()

      // Ensure the kit is connected before signing
      // The popup window may have a fresh kit instance that needs to restore from storage
      if (!kit.isConnected) {
        setStatusMessage('Connecting wallet...')
        const connectResult = await connectWallet()
        if (!connectResult) {
          throw new Error('Please connect your wallet first')
        }
      }

      type XdrOperation = ReturnType<typeof xdr.Operation.read>
      type XdrAuthEntry = ReturnType<typeof xdr.SorobanAuthorizationEntry.read>

      // Only sign auth entries that match the currently-connected wallet address.
      // If we try to sign every address-based auth entry, we can trigger multiple
      // passkey prompts (and it may look like an "endless" signing loop).
      const walletAddress = addressRef.current

      // IMPORTANT: smart-account-kit defaults auth signature expiration to ~timeoutInSeconds,
      // which is typically ~30s (6 ledgers). That is too short for passkey prompts +
      // Relayer's (re-)simulation step.
      // We explicitly set auth signature expiration to 24 hours.
      const LEDGERS_PER_DAY = 17_280 // ~5s ledgers
      const { sequence: latestLedgerSeq } = await kit.rpc.getLatestLedger()
      const expiration = latestLedgerSeq + LEDGERS_PER_DAY

      if (pendingRequest.type === 'transaction') {
        // Parse the transaction
        const txEnvelope = xdr.TransactionEnvelope.fromXDR(pendingRequest.xdr, 'base64')

        if (txEnvelope.switch().name !== 'envelopeTypeTx') {
          throw new Error('Invalid transaction envelope type')
        }

        const v1 = txEnvelope.v1()
        const txBody = v1.tx()
        const ops = txBody.operations()

        // Sign auth entries for each operation
        const signedOps: XdrOperation[] = []

        for (const op of ops) {
          const opBody = op.body()

          if (opBody.switch().name === 'invokeHostFunction') {
            const invokeOp = opBody.invokeHostFunctionOp()
            const authEntries = invokeOp.auth()
            const signedAuth: XdrAuthEntry[] = []

            // Sign only the auth entry (or entries) that belong to *this* wallet.
            // Other auth entries (e.g. opponent signatures) must be left untouched.
            for (const authEntry of authEntries) {
              try {
                const credentials = authEntry.credentials()

                if (credentials.switch().name !== 'sorobanCredentialsAddress') {
                  signedAuth.push(authEntry)
                  continue
                }

                // sorobanCredentialsAddress => compare address to our wallet.
                const scAddr = credentials.address().address()
                const entryAddr = Address.fromScAddress(scAddr).toString()

                if (walletAddress && entryAddr === walletAddress) {
                  const signedEntry = await kit.signAuthEntry(authEntry, { expiration })
                  signedAuth.push(signedEntry)
                } else {
                  signedAuth.push(authEntry)
                }
              } catch {
                signedAuth.push(authEntry)
              }
            }

            // Rebuild operation with signed auth
            const newInvokeOp = new xdr.InvokeHostFunctionOp({
              hostFunction: invokeOp.hostFunction(),
              auth: signedAuth,
            })
            const newOpBody = xdr.OperationBody.invokeHostFunction(newInvokeOp)
            signedOps.push(new xdr.Operation({
              sourceAccount: op.sourceAccount(),
              body: newOpBody,
            }))
          } else {
            signedOps.push(op)
          }
        }

        // Rebuild transaction with signed operations
        const newTxBody = new xdr.Transaction({
          sourceAccount: txBody.sourceAccount(),
          fee: txBody.fee(),
          seqNum: txBody.seqNum(),
          cond: txBody.cond(),
          memo: txBody.memo(),
          operations: signedOps,
          ext: txBody.ext(),
        })

        const signedEnvelope = xdr.TransactionEnvelope.envelopeTypeTx(
          new xdr.TransactionV1Envelope({
            tx: newTxBody,
            signatures: v1.signatures(),
          })
        )

        const signedXdr = signedEnvelope.toXDR('base64')

        // Submit if requested
        let txHash: string | undefined

        if (pendingRequest.submit && kit.relayer) {
          setStatusMessage('Submitting transaction...')
          const submitResult = await kit.relayer.sendXdr(signedXdr)
          if (!submitResult.success) {
            throw new Error(submitResult.error || 'Transaction submission failed')
          }
          txHash = submitResult.hash
        }

        responsesSentRef.current.add(pendingRequest.id)
        sendToOpener({
          type: 'SIGN_TRANSACTION_RESPONSE',
          origin: window.location.origin,
          timestamp: Date.now(),
          requestId: pendingRequest.id,
          success: true,
          signedXdr,
          txHash,
        }, appInfo.origin)

        setPendingRequest(null)
        setMode('success')
        setStatusMessage(txHash ? 'Transaction submitted!' : 'Signed successfully!')

      } else {
        // Sign auth entry using the kit's signAuthEntry method
        const authEntry = xdr.SorobanAuthorizationEntry.fromXDR(pendingRequest.xdr, 'base64')
        const signedEntry = await kit.signAuthEntry(authEntry, { expiration })
        const signedEntryXdr = signedEntry.toXDR('base64')

        responsesSentRef.current.add(pendingRequest.id)
        sendToOpener({
          type: 'SIGN_AUTH_ENTRY_RESPONSE',
          origin: window.location.origin,
          timestamp: Date.now(),
          requestId: pendingRequest.id,
          success: true,
          signedAuthEntryXdr: signedEntryXdr,
        }, appInfo.origin)

        setPendingRequest(null)
        setMode('success')
        setStatusMessage('Signed successfully!')
      }

      // Show success for 1.5 seconds before auto-closing
      setTimeout(() => window.close(), 1500)

    } catch (err) {
      console.error('[SignerPage] Sign error:', err)

      const msg = err instanceof Error ? err.message : 'Signing failed'

      // Surface the error in the popup UI but keep the pendingRequest
      // so the user can retry or reject. Don't auto-close - let user decide.
      setError(msg)
      setStatusMessage('Signing failed - you can retry or reject')
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle rejection
  const handleReject = () => {
    if (!pendingRequest || !appInfo?.origin) return

    // If there was an error during signing, include it in the rejection message
    // so the game site can display the actual error
    const errorMessage = error
      ? `Request rejected after error: ${error}`
      : 'User rejected the request'

    responsesSentRef.current.add(pendingRequest.id)
    sendToOpener({
      type: pendingRequest.type === 'transaction' ? 'SIGN_TRANSACTION_RESPONSE' : 'SIGN_AUTH_ENTRY_RESPONSE',
      origin: window.location.origin,
      timestamp: Date.now(),
      requestId: pendingRequest.id,
      success: false,
      error: errorMessage,
    }, appInfo.origin)

    // Clear local state and close the popup (same behavior as approve).
    setPendingRequest(null)
    setError(null)
    setStatusMessage('Request rejected')

    // Brief delay to ensure the message is delivered before closing.
    setTimeout(() => window.close(), 100)
  }

  // Render
  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-fg flex flex-col">
      {/* Header */}
      <header className="border-b border-terminal-dim/30 p-4">
        <div className="w-full max-w-[420px] mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-terminal-fg/10 rounded-lg flex items-center justify-center">
            <span className="text-lg">🔐</span>
          </div>
          <div>
            <h1 className="font-mono font-bold">Ohloss Signer</h1>
            {appInfo && (
              <p className="text-terminal-dim text-sm">
                Request from {appInfo.name}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 flex flex-col items-center justify-center">
        <div className="w-full max-w-[420px] mx-auto">
        {mode === 'initializing' && (
          <div className="text-center max-w-sm">
            <div className="w-12 h-12 mx-auto mb-4 border-2 border-terminal-fg/30 border-t-terminal-fg rounded-full animate-spin" />
            <p className="text-terminal-dim font-mono">{statusMessage || 'Loading...'}</p>
            {appInfo && (
              <p className="text-terminal-dim/60 text-xs mt-2">
                Connecting to {appInfo.name}
              </p>
            )}
          </div>
        )}

        {mode === 'error' && (
          <div className="w-full max-w-sm">
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
            <button
              onClick={() => {
                setError(null)
                setMode('connecting')
                handleConnect()
              }}
              className="w-full py-3 bg-terminal-fg/10 hover:bg-terminal-fg/20 rounded-lg font-mono transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {mode === 'connecting' && (
          <div className="text-center">
            {isProcessing ? (
              <>
                <div className="w-12 h-12 mx-auto mb-4 border-2 border-terminal-fg/30 border-t-terminal-fg rounded-full animate-spin" />
                <p className="text-terminal-dim">{statusMessage}</p>
              </>
            ) : (
              <div className="w-full max-w-sm space-y-4">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 mx-auto mb-4 bg-terminal-fg/10 rounded-2xl flex items-center justify-center">
                    <span className="text-3xl">🎮</span>
                  </div>
                  <h2 className="font-mono font-bold text-xl mb-2">Connect to Game</h2>
                  <p className="text-terminal-dim text-sm">
                    {appInfo?.name || 'A game'} wants to connect to your wallet
                  </p>
                </div>

                <button
                  onClick={handleConnect}
                  className="w-full py-3 bg-terminal-fg text-terminal-bg hover:bg-terminal-hover rounded-lg font-mono font-bold transition-colors"
                >
                  Connect with Passkey
                </button>

                {pendingCredentials.length > 0 && (
                  <div className="border border-yellow-500/50 bg-yellow-500/10 rounded-lg p-3 text-left space-y-3">
                    <div>
                      <p className="text-yellow-400 text-xs font-bold mb-1">PENDING PASSKEYS FOUND</p>
                      <p className="text-yellow-400/80 text-[10px]">
                        A PREVIOUS REGISTRATION MAY HAVE BEEN INTERRUPTED. YOU CAN DEPLOY A PENDING
                        PASSKEY OR CREATE A NEW ONE. NOTHING IS REMOVED UNLESS YOU CLICK REMOVE.
                      </p>
                      <p className="text-yellow-400/60 text-[10px] mt-1">({pendingCredentials.length} PENDING)</p>
                    </div>

                    <div className="space-y-2">
                      <Radio
                        name="createChoice"
                        checked={createChoice === 'pending'}
                        onChange={() => setCreateChoice('pending')}
                        label="DEPLOY A PENDING PASSKEY"
                        labelClassName="text-yellow-200/90 text-[11px]"
                      />

                      {createChoice === 'pending' && (
                        <div className="ml-5 space-y-2">
                          {pendingCredentials.slice(0, 5).map((c) => (
                            <Radio
                              key={c.credentialId}
                              name="pendingCredential"
                              checked={selectedPendingCredentialId === c.credentialId}
                              onChange={() => setSelectedPendingCredentialId(c.credentialId)}
                              label={
                                <span>
                                  <span className="font-mono">{formatCredentialIdShort(c.credentialId)}</span>
                                  <span className="text-yellow-400/60">
                                    {' '}
                                    — {formatAge(c.createdAt)} ({formatCreatedAt(c.createdAt)})
                                  </span>
                                </span>
                              }
                              labelClassName="text-yellow-200/90 text-[11px]"
                              className="items-start"
                            />
                          ))}

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              onClick={handleCompleteRegistration}
                              disabled={isDeployingPending || isProcessing}
                              className="py-2 bg-yellow-500/20 hover:bg-yellow-500/30 rounded font-mono text-xs transition-colors disabled:opacity-50"
                            >
                              {isDeployingPending ? 'DEPLOYING…' : 'DEPLOY OLDEST'}
                            </button>
                            <button
                              onClick={() => handleDeployPending()}
                              disabled={isDeployingPending || !selectedPendingCredentialId}
                              className="py-2 bg-yellow-500/20 hover:bg-yellow-500/30 rounded font-mono text-xs transition-colors disabled:opacity-50"
                            >
                              {isDeployingPending ? 'WORKING…' : 'DEPLOY SELECTED'}
                            </button>
                          </div>

                          <button
                            onClick={handleDeletePending}
                            disabled={isDeployingPending || !selectedPendingCredentialId}
                            className="text-yellow-200/80 hover:text-yellow-200 text-[10px] underline disabled:opacity-50"
                          >
                            REMOVE SELECTED PENDING PASSKEY
                          </button>
                        </div>
                      )}

                      <Radio
                        name="createChoice"
                        checked={createChoice === 'new'}
                        onChange={() => setCreateChoice('new')}
                        label="CREATE A NEW PASSKEY"
                        labelClassName="text-yellow-200/90 text-[11px]"
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={handleCreateWallet}
                  className="w-full py-3 bg-terminal-fg/10 hover:bg-terminal-fg/20 rounded-lg font-mono transition-colors"
                >
                  Create New Wallet
                </button>
              </div>
            )}
          </div>
        )}

        {mode === 'connected' && !pendingRequest && (
          <div className="text-center">
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4 text-left">
                <p className="text-red-400 text-sm font-mono break-all">{error}</p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setError(null)}
                    className="flex-1 py-2 bg-terminal-fg/10 hover:bg-terminal-fg/20 rounded font-mono text-xs transition-colors"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => window.close()}
                    className="flex-1 py-2 bg-terminal-fg text-terminal-bg hover:bg-terminal-hover rounded font-mono text-xs font-bold transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
            <div className="w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="font-mono font-bold text-xl mb-2">Connected</h2>
            <p className="text-terminal-dim text-sm mb-4">
              {address?.slice(0, 8)}...{address?.slice(-4)}
            </p>
            <p className="text-terminal-dim/60 text-xs">
              Waiting for signing requests...
            </p>
          </div>
        )}

        {mode === 'faction_select' && (
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-terminal-fg/10 rounded-2xl flex items-center justify-center">
                <span className="text-3xl">⚔️</span>
              </div>
              <h2 className="font-mono font-bold text-xl mb-2">Choose Your Faction</h2>
              <p className="text-terminal-dim text-sm">
                Before you can play, select which faction you'll fight for this epoch.
              </p>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="text-red-400/60 text-xs mt-1 hover:text-red-400"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="space-y-3">
              {FACTION_NAMES.map((name, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectFaction(index)}
                  disabled={isSelectingFaction}
                  className={`w-full p-4 border rounded-lg font-mono transition-all ${
                    selectedFaction === index
                      ? 'border-terminal-fg bg-terminal-fg/10'
                      : 'border-terminal-dim/50 hover:border-terminal-fg/50 hover:bg-terminal-fg/5'
                  } ${isSelectingFaction && selectedFaction === index ? 'animate-pulse' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-3xl opacity-60">{getFactionSymbol(index)}</span>
                    <div className="text-left">
                      <div className="font-bold">{name}</div>
                      <div className="text-terminal-dim text-xs">
                        {index === 0 && 'The flexible ones'}
                        {index === 1 && 'The sharp strategists'}
                        {index === 2 && 'The solid defenders'}
                      </div>
                    </div>
                    {isSelectingFaction && selectedFaction === index && (
                      <div className="ml-auto">
                        <div className="w-5 h-5 border-2 border-terminal-fg/30 border-t-terminal-fg rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <p className="text-terminal-dim/60 text-xs text-center mt-4">
              Your faction is locked for the epoch once you start playing.
            </p>
          </div>
        )}

        {mode === 'signing' && pendingRequest && (
          <div className="w-full max-w-sm">
            <div className="bg-terminal-fg/5 border border-terminal-dim/30 rounded-lg p-4 mb-6">
              <h2 className="font-mono font-bold mb-2">
                {pendingRequest.type === 'transaction' ? 'Sign Transaction' : 'Sign Auth Entry'}
              </h2>
              <p className="text-terminal-dim text-sm mb-4">
                {pendingRequest.description}
              </p>

              {appInfo && (
                <div className="flex items-center gap-2 text-terminal-dim/60 text-xs">
                  <span>From:</span>
                  <span className="font-mono">{appInfo.name}</span>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4">
                <p className="text-red-400 text-sm font-mono break-all">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="text-red-400/60 text-xs mt-2 hover:text-red-400"
                >
                  Dismiss
                </button>
              </div>
            )}

            {isProcessing ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-6 h-6 border-2 border-terminal-fg/30 border-t-terminal-fg rounded-full animate-spin mr-3" />
                <span className="text-terminal-dim">{statusMessage}</span>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleReject}
                  className="flex-1 py-3 bg-terminal-fg/10 hover:bg-terminal-fg/20 rounded-lg font-mono transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={handleApprove}
                  className="flex-1 py-3 bg-terminal-fg text-terminal-bg hover:bg-terminal-hover rounded-lg font-mono font-bold transition-colors"
                >
                  {error ? 'Retry' : 'Approve'}
                </button>
              </div>
            )}
          </div>
        )}

        {mode === 'success' && (
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
              <span className="text-4xl">✓</span>
            </div>
            <h2 className="font-mono font-bold text-xl mb-2 text-green-400">
              {statusMessage}
            </h2>
            <p className="text-terminal-dim text-sm">
              Closing automatically...
            </p>
          </div>
        )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-terminal-dim/30 p-3 text-center">
        <div className="w-full max-w-[420px] mx-auto">
          <p className="text-terminal-dim/40 text-xs font-mono">
            Ohloss Wallet • Secure Transaction Signing
          </p>
        </div>
      </footer>
    </div>
  )
}
