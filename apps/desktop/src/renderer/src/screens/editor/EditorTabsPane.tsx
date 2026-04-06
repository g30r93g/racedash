import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PanelLeft, Save } from 'lucide-react'
import React, { useState } from 'react'
import type { TimestampsResult, VideoInfo } from '../../../../types/ipc'
import type { ProjectData } from '../../../../types/project'
import { ExportTab } from './tabs/ExportTab'
import { StyleTab } from './tabs/StyleTab'
import type { StyleState } from './tabs/StyleTab'
import { TimingTab, type Override } from './tabs/TimingTab'

interface EditorTabsPaneProps {
  project: ProjectData
  videoInfo?: VideoInfo | null
  currentTime?: number
  playing?: boolean
  onSave?: () => void
  overrides: Override[]
  onOverridesChange: (overrides: Override[]) => void
  styleState: StyleState
  onStyleChange: (next: StyleState) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  timestampsResult?: TimestampsResult | null
  timingLoading?: boolean
  timingError?: string | null
  onProjectUpdate: (updated: ProjectData) => void
  authUser?: { name: string } | null
  licenseTier?: 'plus' | 'pro' | null
  onSignIn?: () => void
  drawerOpen?: boolean
  onToggleDrawer?: () => void
}

const TAB_IDS = ['timing', 'style', 'export'] as const
type TabId = (typeof TAB_IDS)[number]

const TAB_LABELS: Record<TabId, string> = {
  timing: 'Timing',
  style: 'Style',
  export: 'Export',
}

export function EditorTabsPane({
  project,
  videoInfo,
  currentTime,
  playing,
  onSave,
  overrides,
  onOverridesChange,
  styleState,
  onStyleChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  timestampsResult,
  timingLoading,
  timingError,
  onProjectUpdate,
  authUser,
  licenseTier,
  onSignIn,
  drawerOpen,
  onToggleDrawer,
}: EditorTabsPaneProps): React.ReactElement {
  const [rendering, setRendering] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('timing')

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          if (!rendering) setActiveTab(v as TabId)
        }}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList className="h-auto w-full shrink-0 justify-start rounded-none border-b border-border bg-transparent px-0">
          {TAB_IDS.map((id) => (
            <TabsTrigger
              key={id}
              value={id}
              className="-mb-px cursor-pointer rounded-none border-b-2 border-transparent px-5 py-3 text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none aria-disabled:pointer-events-none aria-disabled:opacity-50"
              aria-disabled={rendering && id !== activeTab ? true : undefined}
            >
              {TAB_LABELS[id]}
            </TabsTrigger>
          ))}
          <div className="ml-auto flex items-center px-2">
            <Button size="sm" variant={drawerOpen ? 'secondary' : 'ghost'} onClick={onToggleDrawer} className="mr-1">
              <PanelLeft className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
            <Button size="sm" onClick={onSave} disabled={rendering}>
              <Save className="mr-1.5 h-4 w-4" />
              Save
            </Button>
          </div>
        </TabsList>

        <TabsContent value="timing" className="mt-0 flex-1 overflow-auto" forceMount={undefined}>
          {activeTab === 'timing' && (
            <TimingTab
              project={project}
              videoInfo={videoInfo}
              currentTime={currentTime}
              playing={playing}
              overrides={overrides}
              onOverridesChange={onOverridesChange}
              timestampsResult={timestampsResult}
              timingLoading={timingLoading}
              timingError={timingError}
              onProjectUpdate={onProjectUpdate}
            />
          )}
        </TabsContent>
        <TabsContent value="style" className="mt-0 flex-1 overflow-auto">
          <StyleTab
            styleState={styleState}
            onStyleChange={onStyleChange}
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            segmentLabels={project.segments.map((s) => s.label)}
          />
        </TabsContent>
        <TabsContent value="export" className="mt-0 flex-1 overflow-auto">
          <ExportTab
            project={project}
            videoInfo={videoInfo}
            onRenderingChange={setRendering}
            overlayType={styleState.overlayType}
            authUser={authUser}
            licenseTier={licenseTier}
            onSignIn={onSignIn}
          />
        </TabsContent>
      </Tabs>

      {/* RaceDash Cloud footer */}
      <div className="flex h-14 shrink-0 items-center justify-between border-t border-border px-4">
        <span className="text-xs text-muted-foreground">RaceDash Cloud</span>
        {authUser ? (
          <span className="text-xs text-foreground">{authUser.name}</span>
        ) : (
          <Button variant="ghost" size="sm" onClick={onSignIn}>
            Sign in
          </Button>
        )}
      </div>
    </div>
  )
}
