import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { SectionLabel } from '../shared/SectionLabel'
import type { CreditPurchase, CreditHistory as CreditHistoryType } from '../../../../types/ipc'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface CreditHistoryProps {
  fetchHistory: (cursor?: string) => Promise<CreditHistoryType>
  onBack: () => void
}

export function CreditHistory({ fetchHistory, onBack }: CreditHistoryProps): React.ReactElement {
  const [purchases, setPurchases] = useState<CreditPurchase[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadPage = useCallback(async (cursor?: string) => {
    setIsLoading(true)
    try {
      const result = await fetchHistory(cursor)
      setPurchases((prev) => cursor ? [...prev, ...result.purchases] : result.purchases)
      setNextCursor(result.nextCursor)
    } catch {
      // Error loading history
    } finally {
      setIsLoading(false)
    }
  }, [fetchHistory])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Button
          variant="link"
          onClick={onBack}
          className="h-auto p-0 text-xs text-primary"
        >
          ← Back
        </Button>
        <SectionLabel>Purchase History</SectionLabel>
      </div>

      {purchases.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground">No purchases yet.</p>
      )}

      {purchases.length > 0 && (
        <div className="rounded-md border border-border bg-accent">
          {purchases.map((purchase, i) => (
            <div key={purchase.id}>
              {i > 0 && <div className="border-t border-border" />}
              <div className="flex items-center justify-between px-3 py-1.5">
                <div className="flex flex-col">
                  <span className="text-xs text-foreground">{purchase.packName}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDate(purchase.purchasedAt)} · {purchase.rcTotal} RC
                  </span>
                </div>
                <span className="text-xs font-medium text-foreground">
                  £{purchase.priceGbp}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {nextCursor && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          onClick={() => loadPage(nextCursor)}
          disabled={isLoading}
        >
          {isLoading ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </section>
  )
}
