import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export interface OptionGroupOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

interface OptionGroupProps<T extends string> {
  options: OptionGroupOption<T>[]
  value: T
  onValueChange: (value: T) => void
}

export function OptionGroup<T extends string>({ options, value, onValueChange }: OptionGroupProps<T>) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => { if (val) onValueChange(val as T) }}
      className="grid w-full auto-cols-fr grid-flow-col gap-2"
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className="rounded-lg border border-toggle-border bg-toggle-bg px-3 py-1 text-xs text-toggle-fg data-[state=on]:border-toggle-border-active data-[state=on]:bg-toggle-bg-active data-[state=on]:text-toggle-fg-active disabled:border-toggle-border-disabled disabled:bg-toggle-bg-disabled disabled:text-toggle-fg-disabled"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
