import React from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { InfoRow } from './InfoRow'
import { SectionLabel } from './SectionLabel'

export function AccountDetails(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-blue-700 text-sm font-bold text-white">GG</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">G. Gorzynski</p>
            <Badge className="text-[10px]">PRO</Badge>
          </div>
          <p className="text-xs text-muted-foreground">george@university.ac.uk</p>
        </div>
      </div>

      <Separator />

      <section>
        <SectionLabel>Subscription</SectionLabel>
        <div className="rounded-md border border-border bg-accent px-3">
          <InfoRow label="Plan" value="Racedash Cloud Pro" />
          <div className="border-t border-border" />
          <InfoRow label="Renews" value="1 Apr 2026" />
        </div>
        <Button variant="outline" className="mt-3 w-full" size="sm">
          Manage subscription ↗
        </Button>
      </section>

      <Separator />

      <section>
        <SectionLabel>Security</SectionLabel>
        <button className="w-full rounded-md border border-border bg-accent px-3 py-2 text-left text-sm text-foreground hover:bg-accent/80">
          Change password ›
        </button>
      </section>

      <Separator />

      <Button variant="destructive" className="w-full bg-red-950 text-red-500 hover:bg-red-900" disabled>
        Sign out
      </Button>
    </div>
  )
}
