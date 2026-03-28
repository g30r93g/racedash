import React from 'react'

interface SectionLabelProps {
  children: React.ReactNode
}

export function SectionLabel({ children }: SectionLabelProps): React.ReactElement {
  return <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{children}</p>
}
