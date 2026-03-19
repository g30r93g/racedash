import React from 'react'
import { Button } from '@/components/ui/button'
import { SectionLabel } from './SectionLabel'
import type { CreditBalance as CreditBalanceType } from '../../../../types/ipc'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isExpiringSoon(expiresAt: string): boolean {
  const daysRemaining = (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return daysRemaining < 30 && daysRemaining > 0
}

interface CreditBalanceProps {
  balance: CreditBalanceType | null
  onTopUp: () => void
  onViewHistory: () => void
}

export function CreditBalance({ balance, onTopUp, onViewHistory }: CreditBalanceProps): React.ReactElement {
  return (
    <section>
      <SectionLabel>Credits</SectionLabel>

      <p className="mb-2 text-2xl font-bold text-foreground">
        {balance?.totalRc ?? 0} <span className="text-sm font-normal text-muted-foreground">RC</span>
      </p>

      {balance && balance.packs.length > 0 && (
        <div className="mb-3 rounded-md border border-border bg-accent">
          {balance.packs.map((pack, i) => (
            <div key={pack.id}>
              {i > 0 && <div className="border-t border-border" />}
              <div className="flex items-center justify-between px-3 py-1.5">
                <div className="flex flex-col">
                  <span className="text-xs text-foreground">{pack.packName}</span>
                  <span className="text-[11px] text-muted-foreground">
                    Expires {formatDate(pack.expiresAt)}
                    {isExpiringSoon(pack.expiresAt) && (
                      <span className="ml-1 text-amber-500">⚠ Expiring soon</span>
                    )}
                  </span>
                </div>
                <span className="text-xs font-medium text-foreground">
                  {pack.rcRemaining} / {pack.rcTotal} RC
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {balance && balance.packs.length === 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          No credit packs. Purchase credits to use cloud rendering.
        </p>
      )}

      <Button variant="outline" className="w-full" size="sm" onClick={onTopUp}>
        Top up credits
      </Button>

      <button
        className="mt-2 w-full text-center text-xs text-primary hover:underline"
        onClick={onViewHistory}
      >
        Purchase history
      </button>
    </section>
  )
}
