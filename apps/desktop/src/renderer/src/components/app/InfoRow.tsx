import React from 'react'

interface InfoRowProps {
  label: string
  value: string
}

export function InfoRow({ label, value }: InfoRowProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  )
}
