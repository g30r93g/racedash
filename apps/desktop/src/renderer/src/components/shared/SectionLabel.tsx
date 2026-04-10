import { cn } from '@/lib/utils'
import React from 'react'

interface SectionLabelProps {
  className?: string
  children: React.ReactNode
}

export function SectionLabel({ className, children }: SectionLabelProps): React.ReactElement {
  return <p className={cn("mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground", className)}>{children}</p>
}
