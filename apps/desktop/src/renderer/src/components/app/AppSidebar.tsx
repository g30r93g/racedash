import React from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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
    <div className="flex w-[190px] shrink-0 flex-col rounded-lg bg-[#161616]">
      {/* Logo */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-2">
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
        <div className="mt-4 h-px bg-white/10" />
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        <NavItem
          label="Projects"
          icon={<FolderIcon />}
          active={activeTab === 'projects'}
          onClick={() => onTabChange('projects')}
        />
        <NavItem
          label="Cloud Renders"
          icon={<CloudIcon />}
          active={activeTab === 'cloud-renders'}
          onClick={() => onTabChange('cloud-renders')}
          badge={cloudRenderCount > 0 ? String(cloudRenderCount) : undefined}
        />
        <NavItem
          label="Account"
          icon={<AccountIcon />}
          active={activeTab === 'account'}
          onClick={() => onTabChange('account')}
        />
      </nav>

      {/* Footer */}
      <div className="px-3 py-4">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
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
      </div>
    </div>
  )
}

function NavItem({
  label,
  icon,
  active,
  onClick,
  badge,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  badge?: string
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-white/10 text-white'
          : 'text-white/50 hover:bg-white/5 hover:text-white/80'
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {badge}
        </Badge>
      )}
    </button>
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
