import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AsciiBackground } from './AsciiBackground'
import { AsciiLoader } from './AsciiLoader'
import { Radio } from '@/components/ui'
import { useWalletStore } from '@/stores/walletStore'
import {
  createWallet,
  connectWallet,
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

const ASCII_LOGO = `
  ██████╗ ██╗  ██╗██╗      ██████╗ ███████╗███████╗
 ██╔═══██╗██║  ██║██║     ██╔═══██╗██╔════╝██╔════╝
 ██║   ██║███████║██║     ██║   ██║███████╗███████╗
 ██║   ██║██╔══██║██║     ██║   ██║╚════██║╚════██║
 ╚██████╔╝██║  ██║███████╗╚██████╔╝███████║███████║
  ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝╚══════╝
`

const FACTIONS = [
  { name: 'WHOLE_NOODLE', symbol: '~', description: 'FLEXIBILITY IS STRENGTH' },
  { name: 'POINTY_STICK', symbol: '/', description: 'PIERCE THE OPPOSITION' },
  { name: 'SPECIAL_ROCK', symbol: '#', description: 'UNMOVABLE FORCE' },
]


export function HomePage() {
  const navigate = useNavigate()
  const { setAddress, setError, error } = useWalletStore()
  const [mode, setMode] = useState<'initial' | 'login' | 'register'>('initial')
  const [sdkConfigured, setSdkConfigured] = useState(false)
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [pendingCredentials, setPendingCredentials] = useState<PendingCredential[]>([])
  const [registerChoice, setRegisterChoice] = useState<'pending' | 'new'>('new')
  const [selectedPendingCredentialId, setSelectedPendingCredentialId] = useState<string | null>(null)

  // Check if SDK is configured on mount
  useEffect(() => {
    setSdkConfigured(isConfigured())
  }, [])

  // Check for pending credentials when entering register mode
  useEffect(() => {
    if (mode === 'register' && sdkConfigured) {
      const checkPending = async () => {
        try {
          const sorted = await loadPendingCredentialsSorted()
          if (sorted.length > 0) {
            setPendingCredentials(sorted)
            // Default to reusing the oldest pending passkey, but allow opting out.
            setRegisterChoice('pending')
            setSelectedPendingCredentialId((prev) => prev || sorted[0].credentialId)
          } else {
            setPendingCredentials([])
            setRegisterChoice('new')
            setSelectedPendingCredentialId(null)
          }
        } catch (err) {
          console.error('Error checking pending credentials:', err)
          setPendingCredentials([])
          setRegisterChoice('new')
          setSelectedPendingCredentialId(null)
        }
      }
      checkPending()
    }
  }, [mode, sdkConfigured])

  // Try silent auto-connect on mount
  useEffect(() => {
    if (!sdkConfigured || autoConnectAttempted) return
    setAutoConnectAttempted(true)

    const tryAutoConnect = async () => {
      try {
        const result = await connectWallet()
        if (result) {
          setAddress(result.contractId)
          navigate('/account')
        }
      } catch {
        // Silent fail - no stored session
      }
    }

    tryAutoConnect()
  }, [sdkConfigured, autoConnectAttempted, setAddress, navigate])

  const refreshPending = async () => {
    try {
      const sorted = await loadPendingCredentialsSorted()
      setPendingCredentials(sorted)
      if (sorted.length === 0) {
        setRegisterChoice('new')
        setSelectedPendingCredentialId(null)
      } else {
        setSelectedPendingCredentialId((prev) => prev || sorted[0].credentialId)
      }
    } catch {
      // ignore
    }
  }

  const handleDeleteSelectedPending = async () => {
    if (!selectedPendingCredentialId) return

    const ok = window.confirm(
      'Remove this pending passkey from this device?\n\nThis should only be used if you no longer have access to that passkey or you do not intend to deploy it.'
    )
    if (!ok) return

    setIsLoading(true)
    setError(null)

    try {
      await deletePendingCredentialSafe(selectedPendingCredentialId)
      await refreshPending()
    } catch (err) {
      console.error('Failed to delete pending passkey:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete pending passkey')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!sdkConfigured) {
      setError('Smart Account Kit not configured. Check environment variables.')
      return
    }

    setIsLoading(true)
    setError(null)

    // Small delay to allow UI to update before WebAuthn dialog appears
    await new Promise((resolve) => setTimeout(resolve, 50))

    try {
      if (registerChoice === 'pending' && selectedPendingCredentialId) {
        try {
          const contractId = await deployPendingCredentialOrThrow(selectedPendingCredentialId)
          setAddress(contractId)
          navigate('/account')
          return
        } catch (deployErr) {
          console.error('Deploy error:', deployErr)

          // IMPORTANT: do not delete/hide pending passkeys on failure.
          setError(
            `Failed to deploy existing passkey: ${deployErr instanceof Error ? deployErr.message : 'Unknown error'}. ` +
              `You can retry, pick a different pending passkey, or create a new one.`
          )
          await refreshPending()
          return
        }
      }

      // Create a new wallet (new passkey)
      const result = await createWallet()
      setAddress(result.contractId)
      navigate('/account')
    } catch (err) {
      console.error('Registration failed:', err)
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogin = async () => {
    if (!sdkConfigured) {
      setError('Smart Account Kit not configured. Check environment variables.')
      return
    }

    setIsLoading(true)
    setError(null)

    // Small delay to allow UI to update before WebAuthn dialog appears
    await new Promise((resolve) => setTimeout(resolve, 50))

    try {
      const result = await connectWallet({ prompt: true })
      if (result) {
        setAddress(result.contractId)
        navigate('/account')
      } else {
        setError('No wallet found. Please create a new wallet.')
      }
    } catch (err) {
      console.error('Login failed:', err)
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative" style={{ zIndex: 1 }}>
      <AsciiBackground />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-terminal-dim bg-terminal-bg/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="font-mono text-sm tracking-wider"
          >
            <span className="text-terminal-dim">[</span>
            <span className="text-terminal-fg">OHLOSS</span>
            <span className="text-terminal-dim">]</span>
          </button>
          <nav className="flex items-center gap-6 text-xs tracking-widest">
            <button
              onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-terminal-dim hover:text-terminal-fg transition-colors"
            >
              ABOUT
            </button>
            <button
              onClick={() => document.getElementById('factions')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-terminal-dim hover:text-terminal-fg transition-colors"
            >
              FACTIONS
            </button>
            <button
              onClick={() => document.getElementById('builders')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-terminal-dim hover:text-terminal-fg transition-colors"
            >
              BUILDERS
            </button>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="text-terminal-dim hover:text-terminal-fg transition-colors"
            >
              PLAY
            </button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="min-h-screen flex flex-col items-center justify-center px-4 pt-16 relative">
        {/* All hero content centered together */}
        <div className="text-center">
          {/* ASCII Logo */}
          <pre className="text-[0.35rem] sm:text-[0.5rem] md:text-xs leading-none text-terminal-fg/80 mb-8 font-mono">
            {ASCII_LOGO}
          </pre>

          {/* Tagline */}
          <p className="text-terminal-dim text-sm tracking-[0.3em] uppercase mb-2">
            {'>>> FACTION-BASED COMPETITIVE GAMING <<<'}
          </p>
          <p className="text-terminal-fg text-lg md:text-xl tracking-wide mb-12">
            STAKE. COMPETE. DOMINATE.
          </p>

          {/* Auth Section */}
          <div className="ascii-box p-8 bg-terminal-bg/90 max-w-md mx-auto">
            {mode === 'initial' && (
              <div className="space-y-6">
                <div className="text-center">
                  <p className="text-terminal-dim text-xs mb-2">{'// SYSTEM ACCESS //'}</p>
                  <p className="text-terminal-fg text-sm">SELECT OPERATION:</p>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setMode('login')}
                    className="btn-retro text-sm"
                    disabled={!sdkConfigured}
                  >
                    RETURNING PLAYER
                  </button>
                  <button
                    onClick={() => setMode('register')}
                    className="btn-retro text-sm"
                    disabled={!sdkConfigured}
                  >
                    NEW PLAYER
                  </button>
                </div>

                {!sdkConfigured && (
                  <div className="text-terminal-dim text-[10px] mt-4 p-2 border border-terminal-dim">
                    SDK NOT CONFIGURED - SET ENV VARS
                  </div>
                )}

                <div className="text-center">
                  <p className="text-terminal-dim text-[10px] tracking-wide">
                    PASSKEY-AUTHENTICATED SMART WALLET
                  </p>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div className="space-y-6">
                <div className="text-center">
                  <p className="text-terminal-dim text-xs mb-2">{'// NEW PLAYER REGISTRATION //'}</p>
                  <p className="text-terminal-fg text-sm">CREATE YOUR SMART WALLET</p>
                </div>

                {pendingCredentials.length > 0 && (
                  <div className="border border-yellow-500 p-3 text-left space-y-3">
                    <div>
                      <p className="text-yellow-400 text-xs font-bold mb-1">
                        PENDING PASSKEYS FOUND
                      </p>
                      <p className="text-yellow-400/80 text-[10px]">
                        A PREVIOUS REGISTRATION MAY HAVE BEEN INTERRUPTED. YOU CAN DEPLOY AN EXISTING
                        PENDING PASSKEY OR CREATE A NEW ONE. PENDING PASSKEYS ARE NOT LOST UNLESS YOU
                        CHOOSE TO REMOVE THEM.
                      </p>
                      <p className="text-yellow-400/60 text-[10px] mt-1">
                        ({pendingCredentials.length} PENDING)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Radio
                        name="registerChoice"
                        checked={registerChoice === 'pending'}
                        onChange={() => setRegisterChoice('pending')}
                        label="DEPLOY A PENDING PASSKEY"
                        labelClassName="text-yellow-200/90 text-[11px]"
                      />

                      {registerChoice === 'pending' && (
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
                                  <span className="text-yellow-400/60"> — {formatAge(c.createdAt)} ({formatCreatedAt(c.createdAt)})</span>
                                </span>
                              }
                              labelClassName="text-yellow-200/90 text-[11px]"
                              className="items-start"
                            />
                          ))}

                          <button
                            onClick={handleDeleteSelectedPending}
                            disabled={isLoading || !selectedPendingCredentialId}
                            className="text-yellow-200/80 hover:text-yellow-200 text-[10px] underline disabled:opacity-50"
                          >
                            REMOVE SELECTED PENDING PASSKEY
                          </button>
                        </div>
                      )}

                      <Radio
                        name="registerChoice"
                        checked={registerChoice === 'new'}
                        onChange={() => setRegisterChoice('new')}
                        label="CREATE A NEW PASSKEY"
                        labelClassName="text-yellow-200/90 text-[11px]"
                      />
                    </div>
                  </div>
                )}

                <div className="border border-terminal-dim p-4 text-left text-xs space-y-2">
                  <p className="text-terminal-dim">{'>'} NO SEED PHRASE REQUIRED</p>
                  <p className="text-terminal-dim">{'>'} SECURED BY DEVICE BIOMETRICS</p>
                  <p className="text-terminal-dim">{'>'} POWERED BY STELLAR SOROBAN</p>
                </div>

                <button
                  onClick={handleRegister}
                  disabled={isLoading}
                  className="btn-retro text-sm w-full disabled:opacity-50"
                >
                  {isLoading ? (
                    <AsciiLoader text={registerChoice === 'pending' ? 'DEPLOYING' : 'CREATING'} />
                  ) : registerChoice === 'pending' && pendingCredentials.length > 0 ? (
                    'DEPLOY SELECTED PASSKEY'
                  ) : (
                    'CREATE PASSKEY'
                  )}
                </button>

                <button
                  onClick={() => setMode('initial')}
                  disabled={isLoading}
                  className="text-terminal-dim text-xs hover:text-terminal-fg transition-colors disabled:opacity-50"
                >
                  {'<'} BACK
                </button>
              </div>
            )}

            {mode === 'login' && (
              <div className="space-y-6">
                <div className="text-center">
                  <p className="text-terminal-dim text-xs mb-2">{'// RETURNING PLAYER //'}</p>
                  <p className="text-terminal-fg text-sm">AUTHENTICATE WITH PASSKEY</p>
                </div>

                <button
                  onClick={handleLogin}
                  disabled={isLoading}
                  className="btn-retro text-sm w-full disabled:opacity-50"
                >
                  {isLoading ? <AsciiLoader text="CONNECTING" /> : 'LOGIN'}
                </button>

                <button
                  onClick={() => setMode('initial')}
                  disabled={isLoading}
                  className="text-terminal-dim text-xs hover:text-terminal-fg transition-colors disabled:opacity-50"
                >
                  {'<'} BACK
                </button>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 border border-red-500 bg-terminal-bg">
                <p className="text-red-400 text-xs">
                  ERROR: {error}
                </p>
              </div>
            )}
          </div>

          {/* Scroll indicator */}
          <div className="mt-36 text-terminal-dim animate-bounce">
            <p className="text-xs tracking-widest">SCROLL FOR MORE</p>
            <p className="text-lg">v</p>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="min-h-screen flex items-center px-4 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12">
            <p className="text-terminal-dim text-xs tracking-[0.3em] mb-2">{'// SECTION_01 //'}</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-wider text-terminal-fg">
              {'>>> ABOUT <<<'}
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="ascii-box p-6 bg-terminal-bg/80">
              <h3 className="text-terminal-fg text-lg mb-4 tracking-wide">HOW IT WORKS</h3>
              <div className="space-y-3 text-sm text-terminal-dim">
                <p>{'[1]'} DEPOSIT ASSETS INTO YIELD VAULT</p>
                <p>{'[2]'} EARN FACTION POINTS OVER TIME</p>
                <p>{'[3]'} COMPETE IN GAMES FOR YOUR FACTION</p>
                <p>{'[4]'} WINNING FACTION SHARES THE YIELD</p>
              </div>
            </div>

            <div className="ascii-box p-6 bg-terminal-bg/80">
              <h3 className="text-terminal-fg text-lg mb-4 tracking-wide">THE CYCLE</h3>
              <div className="space-y-3 text-sm text-terminal-dim">
                <p>EPOCHS RUN FOR <span className="text-terminal-fg">4 DAYS</span></p>
                <p>YIELD GENERATED VIA <span className="text-terminal-fg">BLEND PROTOCOL</span></p>
                <p>BLND CONVERTED TO <span className="text-terminal-fg">USDC</span></p>
                <p>WINNERS TAKE <span className="text-terminal-fg">ALL</span></p>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <pre className="text-terminal-dim text-xs inline-block text-left">
{`
  ┌─────────────────────────────────────────┐
  │  DEPOSIT ──► EARN FP ──► PLAY ──► WIN  │
  │     ▲                              │    │
  │     └──────── EPOCH CYCLE ─────────┘    │
  └─────────────────────────────────────────┘
`}
            </pre>
          </div>
        </div>
      </section>

      {/* Factions Section */}
      <section id="factions" className="min-h-screen flex items-center px-4 py-24">
        <div className="max-w-4xl mx-auto w-full">
          <div className="mb-12">
            <p className="text-terminal-dim text-xs tracking-[0.3em] mb-2">{'// SECTION_02 //'}</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-wider text-terminal-fg">
              {'>>> FACTIONS <<<'}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {FACTIONS.map((faction, i) => (
              <div key={faction.name} className="ascii-box p-6 bg-terminal-bg/80 text-center group hover:bg-terminal-fg/5 transition-colors">
                <div className="text-6xl md:text-8xl font-mono text-terminal-fg/60 group-hover:text-terminal-fg transition-colors mb-4">
                  {faction.symbol}
                </div>
                <h3 className="text-terminal-fg text-lg tracking-wider mb-2">
                  {faction.name.replace('_', ' ')}
                </h3>
                <p className="text-terminal-dim text-xs tracking-wide">
                  {faction.description}
                </p>
                <div className="mt-4 text-terminal-dim text-[10px]">
                  FACTION_{String(i).padStart(2, '0')}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-terminal-dim text-sm">
              CHOOSE YOUR ALLEGIANCE. FIGHT FOR GLORY.
            </p>
          </div>
        </div>
      </section>

      {/* Zero Loss Section */}
      <section id="zero-loss" className="min-h-screen flex items-center px-4 py-24">
        <div className="max-w-4xl mx-auto w-full">
          <div className="mb-12">
            <p className="text-terminal-dim text-xs tracking-[0.3em] mb-2">{'// SECTION_03 //'}</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-wider text-terminal-fg">
              {'>>> ZERO LOSS <<<'}
            </h2>
          </div>

          <div className="ascii-box p-8 bg-terminal-bg/80 mb-8">
            <div className="text-center mb-8">
              <p className="text-terminal-fg text-xl tracking-wide mb-2">YOUR PRINCIPAL IS ALWAYS SAFE</p>
              <p className="text-terminal-dim text-sm">DEPOSIT ANYTIME. WITHDRAW ANYTIME. NO LOCKUPS.</p>
            </div>

            <pre className="text-terminal-dim text-xs text-center mb-8">
{`
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   YOU DEPOSIT ──► YIELD GENERATES ──► WINNERS PAID      │
│        ▲                                      │         │
│        │           YOUR DEPOSIT STAYS         │         │
│        └──────────────────────────────────────┘         │
│                                                         │
│    * ONLY THE YIELD IS AT STAKE, NEVER YOUR DEPOSIT     │
│                                                         │
└─────────────────────────────────────────────────────────┘
`}
            </pre>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="border border-terminal-dim p-4">
                <h4 className="text-terminal-fg text-sm mb-3 tracking-wide">AMOUNT MULTIPLIER</h4>
                <p className="text-terminal-dim text-xs leading-relaxed">
                  PEAKS AT <span className="text-terminal-fg">$1,000</span> (2.45x), THEN DECREASES.
                  AT $10K IT'S BACK TO 1x. WHALES GET DIMINISHING RETURNS.
                </p>
              </div>
              <div className="border border-terminal-dim p-4">
                <h4 className="text-terminal-fg text-sm mb-3 tracking-wide">TIME MULTIPLIER</h4>
                <p className="text-terminal-dim text-xs leading-relaxed">
                  PEAKS AT <span className="text-terminal-fg">35 DAYS</span> (2.45x), THEN DECREASES.
                  COMBINED OPTIMAL: 6x AT $1K + 35 DAYS. WITHDRAW {'>'} 50%? TIMER RESETS.
                </p>
              </div>
            </div>
          </div>

          <div className="text-center text-terminal-dim text-xs">
            THE HOUSE DOESN'T WIN. THE BEST FACTION DOES.
          </div>
        </div>
      </section>

      {/* Free to Play Section */}
      <section id="strategy" className="min-h-screen flex items-center px-4 py-24">
        <div className="max-w-4xl mx-auto w-full">
          <div className="mb-12">
            <p className="text-terminal-dim text-xs tracking-[0.3em] mb-2">{'// SECTION_04 //'}</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-wider text-terminal-fg">
              {'>>> THE STRATEGY <<<'}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="ascii-box p-6 bg-terminal-bg/80">
              <div className="text-4xl font-mono text-terminal-fg/60 mb-4">$0</div>
              <h3 className="text-terminal-fg text-lg mb-3 tracking-wide">START FREE</h3>
              <p className="text-terminal-dim text-sm leading-relaxed">
                NO DEPOSIT TO TRY IT OUT. LEARN THE GAMES, FIND YOUR FACTION.
                FREE PLAYERS GET 100 FP PER EPOCH.
              </p>
            </div>

            <div className="ascii-box p-6 bg-terminal-bg/80">
              <div className="text-4xl font-mono text-terminal-fg/60 mb-4">$1</div>
              <h3 className="text-terminal-fg text-lg mb-3 tracking-wide">UNLOCK REWARDS</h3>
              <p className="text-terminal-dim text-sm leading-relaxed">
                MINIMUM DEPOSIT TO CLAIM YOUR SHARE OF EPOCH REWARDS.
                ANTI-SYBIL: NO FREE EXTRACTION.
              </p>
            </div>

            <div className="ascii-box p-6 bg-terminal-bg/80">
              <div className="text-4xl font-mono text-terminal-fg/60 mb-4">$1K</div>
              <h3 className="text-terminal-fg text-lg mb-3 tracking-wide">THE SWEET SPOT</h3>
              <p className="text-terminal-dim text-sm leading-relaxed">
                PEAK AMOUNT MULTIPLIER (2.45x). HOLD 35 DAYS FOR MAX TIME MULTIPLIER.
                COMBINED: 6x YOUR BASE FP.
              </p>
            </div>
          </div>

          <div className="ascii-box p-6 bg-terminal-bg/80 text-center">
            <p className="text-terminal-fg text-sm mb-4">THE PATH TO DOMINANCE:</p>
            <div className="text-terminal-dim text-xs space-y-2">
              <p>{'[1]'} START FREE - LEARN THE GAMES, PICK YOUR FACTION</p>
              <p>{'[2]'} DEPOSIT TO UNLOCK MULTIPLIERS ($1 MIN TO CLAIM REWARDS)</p>
              <p>{'[3]'} HOLD AND PLAY - TIME MULTIPLIER BUILDS MOMENT BY MOMENT</p>
              <p>{'[4]'} WIN REWARDS, COMPOUND, GROW YOUR INFLUENCE</p>
            </div>
            <p className="text-terminal-dim text-[10px] mt-6 tracking-wide">
              * WITHDRAW {'>'} 50%? YOUR TIME MULTIPLIER RESETS TO ZERO. DIAMOND HANDS WIN.
            </p>
          </div>
        </div>
      </section>

      {/* For Builders Section */}
      <section id="builders" className="min-h-screen flex items-center px-4 py-24">
        <div className="max-w-4xl mx-auto w-full">
          <div className="mb-12">
            <p className="text-terminal-dim text-xs tracking-[0.3em] mb-2">{'// SECTION_05 //'}</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-wider text-terminal-fg">
              {'>>> FOR BUILDERS <<<'}
            </h2>
          </div>

          <div className="ascii-box p-8 bg-terminal-bg/80 mb-8">
            <div className="text-center mb-8">
              <p className="text-terminal-fg text-xl tracking-wide mb-2">BUILD GAMES. GET PAID.</p>
              <p className="text-terminal-dim text-sm">EVERY GAME PLAYED GENERATES REVENUE FOR ITS CREATOR</p>
            </div>

            <pre className="text-terminal-dim text-xs text-center mb-8">
{`
┌────────────────────────────────────────────────┐
│                                                │
│     PLAYER WAGERS FP ──► GAME EXECUTES         │
│                              │                 │
│                              ▼                 │
│                      FEE TO DEVELOPER          │
│                                                │
│    * SUSTAINABLE INCOME FROM PLAYER USAGE      │
│                                                │
└────────────────────────────────────────────────┘
`}
            </pre>

            <div className="grid md:grid-cols-3 gap-4 text-center">
              <div className="border border-terminal-dim p-4">
                <div className="text-terminal-fg text-2xl font-bold mb-1">OPEN</div>
                <p className="text-terminal-dim text-[10px]">PERMISSIONLESS GAME REGISTRY</p>
              </div>
              <div className="border border-terminal-dim p-4">
                <div className="text-terminal-fg text-2xl font-bold mb-1">FAIR</div>
                <p className="text-terminal-dim text-[10px]">VERIFIABLE ON-CHAIN OUTCOMES</p>
              </div>
              <div className="border border-terminal-dim p-4">
                <div className="text-terminal-fg text-2xl font-bold mb-1">PAID</div>
                <p className="text-terminal-dim text-[10px]">AUTOMATIC FEE DISTRIBUTION</p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-terminal-dim text-sm mb-4">
              SHIP A GAME. REGISTER IT. EARN FROM EVERY PLAY.
            </p>
            <p className="text-terminal-dim text-[10px] tracking-wide">
              DOCUMENTATION AND SDK COMING SOON
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="play" className="min-h-[50vh] flex items-center justify-center px-4 py-24">
        <div className="text-center">
          <div className="mb-8">
            <pre className="text-terminal-fg/60 text-xs md:text-sm inline-block">
{`
    ╔════════════════════════════════╗
    ║                                ║
    ║   READY TO JOIN THE OHLOSS?    ║
    ║                                ║
    ╚════════════════════════════════╝
`}
            </pre>
          </div>

          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="btn-retro text-lg px-12 py-4"
          >
            ENTER THE ARENA
          </button>

          <p className="mt-8 text-terminal-dim text-xs">
            BUILT ON STELLAR SOROBAN
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-terminal-dim py-8 px-4 bg-terminal-bg relative" style={{ zIndex: 50 }}>
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-terminal-dim text-xs">
            {'// '} OHLOSS v0.0.1 {' //'}
          </div>
          <div className="flex items-center gap-6 text-xs">
            <a href="https://github.com/kalepail/blendizzard" target="_blank" rel="noopener noreferrer" className="text-terminal-dim hover:text-terminal-fg transition-colors">
              GITHUB
            </a>
          </div>
          <div className="text-terminal-dim text-xs">
            {new Date().getFullYear()} // ALL RIGHTS RESERVED
          </div>
        </div>
      </footer>
    </div>
  )
}
