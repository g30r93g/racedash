import * as React from 'react'
import { cn } from '@/lib/utils'
import { Label } from './label'

interface FormFieldProps {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}

/** Label + control stacked vertically — keeps form layouts DRY. */
export function FormField({ label, hint, children, className }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label>
        {label}
        {hint && <span className="ml-1 normal-case text-muted-foreground/60">{hint}</span>}
      </Label>
      {children}
    </div>
  )
}
