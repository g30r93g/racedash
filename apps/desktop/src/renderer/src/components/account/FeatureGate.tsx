import React from 'react'
import { UpgradePrompt } from './UpgradePrompt'

interface FeatureGateProps {
  requiredTier: 'pro'
  currentTier: 'plus' | 'pro' | null
  children: React.ReactNode
  feature: string
  onUpgrade: () => void
  fallback?: React.ReactNode
}

const TIER_RANK: Record<string, number> = { plus: 1, pro: 2 }

export function FeatureGate({
  requiredTier,
  currentTier,
  children,
  feature,
  onUpgrade,
  fallback,
}: FeatureGateProps): React.ReactElement {
  const currentRank = currentTier ? (TIER_RANK[currentTier] ?? 0) : 0
  const requiredRank = TIER_RANK[requiredTier] ?? 0

  if (currentRank >= requiredRank) {
    return <>{children}</>
  }

  if (fallback) {
    return <>{fallback}</>
  }

  return <UpgradePrompt feature={feature} onUpgrade={onUpgrade} onDismiss={() => {}} inline />
}
