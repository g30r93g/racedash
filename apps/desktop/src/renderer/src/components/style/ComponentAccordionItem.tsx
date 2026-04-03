import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Switch } from '@/components/ui/switch'
import { ChevronRight } from 'lucide-react'
import React from 'react'

interface ComponentAccordionItemProps {
  label: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  children?: React.ReactNode
}

export function ComponentAccordionItem({ label, enabled, onToggle, children }: ComponentAccordionItemProps): React.ReactElement {
  return (
    <Collapsible open={enabled ? undefined : false}>
      <div className="flex items-center justify-between py-1.5">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-foreground [&[data-state=open]>svg]:rotate-90">
          <ChevronRight className="h-3 w-3 text-muted-foreground transition-transform" />
          {label}
        </CollapsibleTrigger>
        <Switch checked={enabled} onCheckedChange={onToggle} className="h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3" />
      </div>
      {children && (
        <CollapsibleContent>
          <div className="ml-4 border-l border-border pl-2">{children}</div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}
