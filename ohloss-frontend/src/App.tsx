import { Routes, Route, Navigate } from 'react-router-dom'
import { HomePage } from '@/components/HomePage'
import { AccountPage } from '@/components/AccountPage'
import { SignerPage } from '@/components/SignerPage'
import { useWalletStore } from '@/stores/walletStore'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isConnected } = useWalletStore()

  if (!isConnected) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        }
      />
      {/* Signer popup route - for cross-app transaction signing */}
      <Route path="/signer" element={<SignerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
