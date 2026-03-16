import React from 'react'
import type { VideoInfo } from '../../../../types/ipc'
import type { ProjectData } from '../../../../types/project'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TimingTab } from './tabs/TimingTab'
import { StyleTab } from './tabs/StyleTab'
import { ExportTab } from './tabs/ExportTab'

interface EditorTabsPaneProps {
  project: ProjectData
  videoInfo?: VideoInfo | null
}

const TAB_IDS = ['timing', 'style', 'export'] as const
type TabId = (typeof TAB_IDS)[number]

const TAB_LABELS: Record<TabId, string> = {
  timing: 'Timing',
  style: 'Style',
  export: 'Export',
}

export function EditorTabsPane({ project, videoInfo }: EditorTabsPaneProps): React.ReactElement {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs defaultValue="timing" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="h-auto w-full shrink-0 justify-start rounded-none border-b border-border bg-transparent px-0">
          {TAB_IDS.map((id) => (
            <TabsTrigger
              key={id}
              value={id}
              className="-mb-px rounded-none border-b-2 border-transparent px-5 py-3 text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {TAB_LABELS[id]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="timing" className="mt-0 flex-1 overflow-auto">
          <TimingTab project={project} videoInfo={videoInfo} />
        </TabsContent>
        <TabsContent value="style" className="mt-0 flex-1 overflow-auto">
          <StyleTab />
        </TabsContent>
        <TabsContent value="export" className="mt-0 flex-1 overflow-auto">
          <ExportTab project={project} videoInfo={videoInfo} />
        </TabsContent>
      </Tabs>

      {/* Racedash Cloud footer — coming soon */}
      <div className="flex h-14 shrink-0 items-center justify-between border-t border-border px-4">
        <span className="text-xs text-muted-foreground">Racedash Cloud</span>
        <button
          disabled
          className="cursor-not-allowed rounded px-3 py-1 text-xs text-muted-foreground opacity-40"
        >
          Sign in
        </button>
      </div>
    </div>
  )
}
