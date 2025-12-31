import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useWalletStore } from '@/store/walletStore'
import ConnectPage from '@/pages/ConnectPage'
import LobbyPage from '@/pages/LobbyPage'
import GamePage from '@/pages/GamePage'
import PendingGamesPage from '@/pages/PendingGamesPage'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

// Wrapper that stores the intended URL before redirecting to connect
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isConnected, setPendingRedirect } = useWalletStore()
  const location = useLocation()

  useEffect(() => {
    if (!isConnected) {
      // Store the full URL (pathname + search params) for redirect after connection
      const fullUrl = location.pathname + location.search
      if (fullUrl !== '/' && fullUrl !== '/lobby') {
        setPendingRedirect(fullUrl)
      }
    }
  }, [isConnected, location, setPendingRedirect])

  if (!isConnected) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function App() {
  const { isConnected } = useWalletStore()

  return (
    <div className="min-h-screen bg-game-bg flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-8 flex-1">
        <Routes>
          <Route
            path="/"
            element={isConnected ? <Navigate to="/lobby" replace /> : <ConnectPage />}
          />
          <Route
            path="/lobby"
            element={
              <RequireAuth>
                <LobbyPage />
              </RequireAuth>
            }
          />
          <Route
            path="/game/:sessionId"
            element={
              <RequireAuth>
                <GamePage />
              </RequireAuth>
            }
          />
          <Route
            path="/games"
            element={
              <RequireAuth>
                <PendingGamesPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

export default App
