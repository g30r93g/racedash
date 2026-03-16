import React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function App(): React.ReactElement {
  return (
    <div className="flex h-screen overflow-hidden">

      {/* Left pane — video + timeline */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-border">
        {/* Video area */}
        <div className="flex flex-1 items-center justify-center bg-[#0a0a0a]">
          <span className="text-xs tracking-widest text-muted-foreground">
            NO VIDEO LOADED
          </span>
        </div>

        {/* Timeline area */}
        <div className="flex h-[180px] shrink-0 items-center justify-center border-t border-border bg-background">
          <span className="text-xs text-muted-foreground">TIMELINE</span>
        </div>
      </div>

      {/* Right pane — tabbed panel */}
      <div className="flex w-[430px] shrink-0 flex-col overflow-hidden bg-card">
        <Tabs defaultValue="timing" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="h-auto w-full shrink-0 justify-start rounded-none border-b border-border bg-transparent px-0">
            {(['timing', 'style', 'export'] as const).map((id) => (
              <TabsTrigger
                key={id}
                value={id}
                className="-mb-px rounded-none border-b-2 border-transparent px-5 py-3 capitalize text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {id.charAt(0).toUpperCase() + id.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>

          {(['timing', 'style', 'export'] as const).map((id) => (
            <TabsContent key={id} value={id} className="mt-0 flex-1 overflow-auto p-4">
              <p className="text-xs text-muted-foreground">
                {id.charAt(0).toUpperCase() + id.slice(1)} tab — coming soon
              </p>
            </TabsContent>
          ))}
        </Tabs>

        {/* Bottom status bar — right pane only */}
        <div className="flex h-16 shrink-0 items-center border-t border-border bg-card px-4">
          <span className="text-xs text-muted-foreground">Racedash Cloud</span>
        </div>
      </div>
    </div>
  )
}
