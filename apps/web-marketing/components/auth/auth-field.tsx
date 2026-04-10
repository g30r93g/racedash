import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
}

// Styled text input for the auth forms. Matches the marketing site's glass
// aesthetic (dark surface, accent focus ring, cool-white text) rather than
// the desktop app's generic white/5 look. The `hint` slot is used for inline
// helper text under the field.
export function AuthField({ label, hint, id, className, ...rest }: AuthFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-foreground-dim text-xs font-medium tracking-wide uppercase">
        {label}
      </label>
      <input
        id={id}
        className={cn(
          'text-foreground-strong placeholder:text-foreground-dim rounded-[14px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-surface-deep)] px-4 py-3 text-sm outline-none transition-colors',
          'focus:border-[color:var(--color-accent)]/60 focus:ring-2 focus:ring-[color:var(--color-accent)]/20',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...rest}
      />
      {hint && <p className="text-foreground-dim text-xs">{hint}</p>}
    </div>
  )
}
