import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { StyleComponentDef } from '@renderer/registry'

interface AddComponentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableComponents: StyleComponentDef[]
  onAdd: (component: StyleComponentDef) => void
}

export function AddComponentModal({ open, onOpenChange, availableComponents, onAdd }: AddComponentModalProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Add Component</DialogTitle>
          <DialogDescription>Select a component to add to the overlay.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          {availableComponents.map((comp) => (
            <button
              key={comp.key}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
              onClick={() => {
                onAdd(comp)
                onOpenChange(false)
              }}
            >
              <span className="flex-1">{comp.label}</span>
            </button>
          ))}
          {availableComponents.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">All components have been added.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
