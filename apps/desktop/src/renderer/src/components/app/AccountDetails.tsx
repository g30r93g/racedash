import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import React, { useState } from 'react'
import { InfoRow } from './InfoRow'
import { SectionLabel } from './SectionLabel'
import { CreditBalance } from './CreditBalance'
import { CreditHistory } from './CreditHistory'
import type { AuthUser, AuthLicense, CreditBalance as CreditBalanceType, CreditHistory as CreditHistoryType, YouTubeConnectionStatus } from '../../../../types/ipc'

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface AccountDetailsProps {
  user: AuthUser | null
  license: AuthLicense | null
  creditBalance: CreditBalanceType | null
  youtubeStatus: YouTubeConnectionStatus
  onSignIn: () => void
  onSignOut: () => void
  onTopUpCredits: () => void
  onManageSubscription: () => void
  onSubscribe: (tier: 'plus' | 'pro') => void
  onYouTubeConnect: () => void
  onYouTubeDisconnect: () => void
  fetchCreditHistory: (cursor?: string) => Promise<CreditHistoryType>
}

export function AccountDetails({
  user,
  license,
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
  const planName = license?.tier === 'pro' ? 'RaceDash Cloud Pro' : license?.tier === 'plus' ? 'RaceDash Cloud Plus' : null

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-blue-700 text-sm font-bold text-white">
            {initials(user.name)}
          </AvatarFallback>
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
          <Button variant="outline" className="mt-3 w-full" size="sm" onClick={onManageSubscription} disabled>
            Manage subscription ↗
          </Button>
          <p className="mt-1 text-center text-[10px] text-muted-foreground">Coming soon</p>
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
          <CreditBalance
            balance={creditBalance}
            onTopUp={onTopUpCredits}
            onViewHistory={() => setShowHistory(true)}
          />
          <Separator />
        </>
      )}

      {license && showHistory && (
        <>
          <CreditHistory
            fetchHistory={fetchCreditHistory}
            onBack={() => setShowHistory(false)}
          />
          <Separator />
        </>
      )}

      {license && (
        <section>
          <SectionLabel>Connected Accounts</SectionLabel>
          {youtubeStatus.connected ? (
            <div className="flex items-center justify-between rounded-md border border-border bg-accent px-3 py-2">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-red-500 fill-current"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                <span className="text-sm">{youtubeStatus.account?.accountName}</span>
                <Badge variant="outline" className="text-[10px]">Connected</Badge>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={onYouTubeDisconnect}>
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-border bg-accent px-3 py-2">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted-foreground fill-current"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
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
        <button className="w-full rounded-md border border-border bg-accent px-3 py-2 text-left text-sm text-foreground hover:bg-accent/80">
          Change password ›
        </button>
      </section>

      <Separator />

      <Button
        variant="destructive"
        className="w-full bg-red-950 text-red-500 hover:bg-red-900"
        onClick={onSignOut}
      >
        Sign out
      </Button>
    </div>
  )
}
