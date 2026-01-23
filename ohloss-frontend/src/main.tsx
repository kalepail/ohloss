import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'
import { turnstileCallback } from './stores/turnstileStore'

// Turnstile site key from environment (fallback to always-pass invisible for dev)
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'

// Cloudflare Turnstile type declarations
declare global {
  interface Window {
    turnstile: {
      ready: (callback: () => void) => void
      render: (element: string, options: {
        appearance?: 'always' | 'execute' | 'interaction-only'
        sitekey: string
        'response-field'?: boolean
        'feedback-enabled'?: boolean
        callback?: (token: string) => void
        'error-callback'?: (error: unknown) => void
      }) => void
    }
  }
}

// Initialize Cloudflare Turnstile when API is ready
if (typeof window !== 'undefined' && window.turnstile && TURNSTILE_SITE_KEY) {
  window.turnstile.ready(() => {
    window.turnstile.render('.cf-turnstile', {
      appearance: 'interaction-only',
      sitekey: TURNSTILE_SITE_KEY,
      'response-field': false,
      'feedback-enabled': false,
      callback: (token: string) => turnstileCallback(token),
      'error-callback': (error: unknown) => console.error('Turnstile error:', error),
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
