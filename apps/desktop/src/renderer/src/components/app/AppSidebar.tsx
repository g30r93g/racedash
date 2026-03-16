import React from 'react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export type LibraryTab = 'projects' | 'cloud-renders' | 'account'

interface AppSidebarProps {
  activeTab: LibraryTab
  onTabChange: (tab: LibraryTab) => void
  cloudRenderCount: number
  user: {
    name: string
    email: string
    plan: 'free' | 'pro'
  }
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

export function AppSidebar({
  activeTab,
  onTabChange,
  cloudRenderCount,
  user,
}: AppSidebarProps): React.ReactElement {
  return (
    <Sidebar className="w-[190px] shrink-0 border-r-0 bg-[#161616]">
      <SidebarHeader className="px-3 py-4">
        <div className="mb-2 flex items-center gap-2 px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M2.5 7L5.5 10L11.5 4"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-sm font-bold text-white">Racedash</span>
        </div>
        <Separator className="bg-white/10" />
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'projects'}
              onClick={() => onTabChange('projects')}
              className="gap-2.5 text-sm text-white"
            >
              <FolderIcon />
              Projects
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'cloud-renders'}
              onClick={() => onTabChange('cloud-renders')}
              className="gap-2.5 text-sm text-white"
            >
              <CloudIcon />
              <span className="flex-1">Cloud Renders</span>
              {cloudRenderCount > 0 && (
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {cloudRenderCount}
                </Badge>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'account'}
              onClick={() => onTabChange('account')}
              className="gap-2.5 text-sm text-white"
            >
              <AccountIcon />
              Account
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="px-3 py-4">
        <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="bg-blue-700 text-[11px] font-bold text-white">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white">{user.name}</p>
            {user.plan === 'pro' && (
              <p className="text-[10px] text-blue-400">Racedash Cloud PRO</p>
            )}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function FolderIcon(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H5.879C6.144 2.5 6.398 2.605 6.586 2.793L7.207 3.414C7.395 3.602 7.649 3.707 7.914 3.707H12.5C13.052 3.707 13.5 4.155 13.5 4.707V11.5C13.5 12.052 13.052 12.5 12.5 12.5H2.5C1.948 12.5 1.5 12.052 1.5 11.5V3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  )
}

function CloudIcon(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M4.5 10.5C3.119 10.5 2 9.381 2 8C2 6.753 2.887 5.713 4.07 5.53C4.285 3.83 5.737 2.5 7.5 2.5C9.157 2.5 10.539 3.679 10.893 5.235C12.1 5.416 13 6.454 13 7.5C13 8.881 11.881 10.5 10.5 10.5H4.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  )
}

function AccountIcon(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="7.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path
        d="M2 13C2 10.791 4.462 9 7.5 9C10.538 9 13 10.791 13 13"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
