// Pending passkey (pending credential) helpers
//
// smart-account-kit can create WebAuthn credentials that are not yet deployed.
// These are "pending" credentials (aka orphaned passkeys) and should be
// recoverable in UX flows so users don't get stuck.

import {
  getPendingCredentials,
  deployPendingCredential,
  deletePendingCredential,
} from './smartAccount'

export type PendingCredential = { credentialId: string; createdAt: number }

export function sortPendingCredentials(pending: PendingCredential[]): PendingCredential[] {
  return [...pending].sort((a, b) => a.createdAt - b.createdAt)
}

export async function loadPendingCredentialsSorted(): Promise<PendingCredential[]> {
  const pending = (await getPendingCredentials()) as PendingCredential[]
  if (!pending || pending.length === 0) return []
  return sortPendingCredentials(pending)
}

export function formatCredentialIdShort(credentialId: string, head = 10, tail = 6): string {
  if (!credentialId) return ''
  if (credentialId.length <= head + tail + 1) return credentialId
  return `${credentialId.slice(0, head)}…${credentialId.slice(-tail)}`
}

export function formatCreatedAt(createdAtMs: number): string {
  try {
    const d = new Date(createdAtMs)
    if (Number.isNaN(d.getTime())) return 'Unknown'
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return 'Unknown'
  }
}

export function formatAge(createdAtMs: number): string {
  const now = Date.now()
  const delta = Math.max(0, now - createdAtMs)
  const minutes = Math.floor(delta / 60_000)
  const hours = Math.floor(delta / 3_600_000)
  const days = Math.floor(delta / 86_400_000)

  if (days > 365) {
    const years = Math.floor(days / 365)
    return `${years}y ago`
  }
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

export async function deployPendingCredentialOrThrow(credentialId: string): Promise<string> {
  const result = await deployPendingCredential(credentialId)
  if (!result.success) {
    throw new Error(result.error || 'Deployment failed')
  }
  return result.contractId
}

export async function deletePendingCredentialSafe(credentialId: string): Promise<void> {
  await deletePendingCredential(credentialId)
}
