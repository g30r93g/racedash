import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/loaders/Spinner'
import React, { useState } from 'react'
import { InfoRow } from '../shared/InfoRow'
import { SectionLabel } from '../shared/SectionLabel'
import { CreditBalance } from './CreditBalance'
import { CreditHistory } from './CreditHistory'
import { YouTubeIcon } from '../icons/YouTubeIcon'
import type {
  AuthUser,
  AuthLicense,
  CreditBalance as CreditBalanceType,
  CreditHistory as CreditHistoryType,
  YouTubeConnectionStatus,
} from '../../../../types/ipc'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface AccountDetailsProps {
  user: AuthUser | null
  license: AuthLicense | null
  isLoading: boolean
  creditBalance: CreditBalanceType | null
  youtubeStatus: YouTubeConnectionStatus
  onSignIn: () => void
  onSignOut: () => void
  onTopUpCredits: (packSize: number) => void
  onManageSubscription: () => void
  onSubscribe: (tier: 'plus' | 'pro') => void
  onYouTubeConnect: () => void
  onYouTubeDisconnect: () => void
  fetchCreditHistory: (cursor?: string) => Promise<CreditHistoryType>
}

export function AccountDetails({
  user,
  license,
  isLoading,
  creditBalance,
  youtubeStatus,
  onSignIn,
  onSignOut,
  onTopUpCredits,
  onManageSubscription,
  onSubscribe,
  onYouTubeConnect,
  onYouTubeDisconnect,
  fetchCreditHistory,
}: AccountDetailsProps): React.ReactElement {
  const [showHistory, setShowHistory] = useState(false)

  // Loading state — Clerk session exists, waiting for profile from API
  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <Spinner size="1.5rem" label="Loading account" />
        <p className="text-sm text-muted-foreground">Loading account...</p>
      </div>
    )
  }

  // Signed-out state
  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">Sign in to access RaceDash Cloud</p>
        <Button onClick={onSignIn}>Sign in</Button>
      </div>
    )
  }

  const tierLabel = license?.tier === 'pro' ? 'PRO' : license?.tier === 'plus' ? 'PLUS' : null
  const planName =
    license?.tier === 'pro' ? 'RaceDash Cloud Pro' : license?.tier === 'plus' ? 'RaceDash Cloud Plus' : null

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-blue-700 text-sm font-bold text-white">{initials(user.name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{user.name}</p>
            {tierLabel && <Badge className="text-[10px]">{tierLabel}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <Separator />

      {license ? (
        <section>
          <SectionLabel>Subscription</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <InfoRow label="Plan" value={planName ?? '—'} />
            <div className="border-t border-border" />
            <InfoRow label="Renews" value={formatDate(license.expiresAt)} />
          </div>
          <Button variant="outline" className="mt-3 w-full" size="sm" onClick={onManageSubscription}>
            Manage subscription ↗
          </Button>
        </section>
      ) : (
        <section>
          <SectionLabel>Subscription</SectionLabel>
          <p className="mb-3 text-sm text-muted-foreground">No active subscription</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" size="sm" onClick={() => onSubscribe('plus')}>
              Subscribe to Plus
            </Button>
            <Button className="flex-1" size="sm" onClick={() => onSubscribe('pro')}>
              Subscribe to Pro
            </Button>
          </div>
        </section>
      )}

      <Separator />

      {license && !showHistory && (
        <>
          <CreditBalance balance={creditBalance} onTopUp={onTopUpCredits} onViewHistory={() => setShowHistory(true)} />
          <Separator />
        </>
      )}

      {license && showHistory && (
        <>
          <CreditHistory fetchHistory={fetchCreditHistory} onBack={() => setShowHistory(false)} />
          <Separator />
        </>
      )}

      {license && (
        <section>
          <SectionLabel>Connected Accounts</SectionLabel>
          {youtubeStatus.connected ? (
            <div className="flex items-center justify-between rounded-md border border-border bg-accent px-3 py-2">
              <div className="flex items-center gap-2">
                <YouTubeIcon className="h-4 w-4 text-red-500" />
                <span className="text-sm">{youtubeStatus.account?.accountName}</span>
                <Badge variant="outline" className="text-[10px]">
                  Connected
                </Badge>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={onYouTubeDisconnect}>
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-border bg-accent px-3 py-2">
              <div className="flex items-center gap-2">
                <YouTubeIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">YouTube</span>
              </div>
              <Button variant="outline" size="sm" className="text-xs" onClick={onYouTubeConnect}>
                Connect
              </Button>
            </div>
          )}
        </section>
      )}

      {license && <Separator />}

      <section>
        <SectionLabel>Security</SectionLabel>
        <Button variant="outline" className="w-full justify-start text-sm">
          Change password ›
        </Button>
      </section>

      <Separator />

      <Button variant="destructive" className="w-full bg-red-950 text-red-500 hover:bg-red-900" onClick={onSignOut}>
        Sign out
      </Button>
    </div>
  )
}
