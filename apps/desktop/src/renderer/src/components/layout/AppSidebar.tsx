import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CloudIcon, FolderIcon, UserRound } from 'lucide-react'
import React from 'react'
import logoPath from '../../../../assets/logo.png'

export type LibraryTab = 'projects' | 'cloud-renders' | 'account'

interface AppSidebarProps {
  activeTab: LibraryTab
  onTabChange: (tab: LibraryTab) => void
  cloudRenderCount: number
  user?: {
    name: string
    email: string
    plan: 'plus' | 'pro' | null
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
          <img src={logoPath} alt="" aria-hidden="true" className="h-7 w-auto shrink-0" />
          <span className="text-sm font-bold text-white">RaceDash</span>
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
          icon={<UserRound />}
          active={activeTab === 'account'}
          onClick={() => onTabChange('account')}
        />
      </nav>

      {/* Footer */}
      {user && (
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
                <p className="text-[10px] text-blue-400">RaceDash Cloud PRO</p>
              )}
              {user.plan === 'plus' && (
                <p className="text-[10px] text-emerald-400">RaceDash Cloud PLUS</p>
              )}
            </div>
          </div>
        </div>
      )}
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
    <Button
      variant="ghost"
      onClick={onClick}
      className={cn(
        'w-full justify-start gap-2.5 px-3 py-2 text-sm',
        active
          ? 'bg-white/10 text-white hover:bg-white/10'
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
    </Button>
  )
}
