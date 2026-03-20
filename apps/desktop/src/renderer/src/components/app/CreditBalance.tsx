import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SectionLabel } from './SectionLabel'
import type { CreditBalance as CreditBalanceType } from '../../../../types/ipc'

const PACK_SIZES = [50, 100, 250, 500] as const

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isExpiringSoon(expiresAt: string): boolean {
  const daysRemaining = (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return daysRemaining < 30 && daysRemaining > 0
}

interface CreditBalanceProps {
  balance: CreditBalanceType | null
  onTopUp: (packSize: number) => void
  onViewHistory: () => void
}

export function CreditBalance({ balance, onTopUp, onViewHistory }: CreditBalanceProps): React.ReactElement {
  const [selectedPack, setSelectedPack] = useState<number>(100)

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

      <div className="flex items-center gap-2">
        <div className="flex flex-1 rounded-md border border-border">
          {PACK_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => setSelectedPack(size)}
              className={[
                'flex-1 py-1.5 text-xs transition-colors first:rounded-l-md last:rounded-r-md',
                selectedPack === size
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              ].join(' ')}
            >
              {size}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => onTopUp(selectedPack)}>
          Buy
        </Button>
      </div>

      <button
        className="mt-2 w-full text-center text-xs text-primary hover:underline"
        onClick={onViewHistory}
      >
        Purchase history
      </button>
    </section>
  )
}
