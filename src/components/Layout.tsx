import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Radio, Upload, BadgeDollarSign, MapPin, GitMerge,
  ChevronDown, ChevronRight, Users, Menu, X, ClipboardList,
  ShieldCheck, LogOut, Target, Briefcase, FileSpreadsheet,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../contexts/AuthContext'
import { canAccess } from '../lib/auth'

const NAV_GROUPS = [
  {
    key: 'dashboard',
    label: '대시보드',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: '메인 대시보드' },
    ],
  },
  {
    key: 'analytics',
    label: '성과 분석',
    items: [
      { to: '/channels', icon: Radio, label: '매체별 성과' },
      { to: '/kpi', icon: Target, label: '온라인광고 KPI' },
      { to: '/funnel', icon: GitMerge, label: '퍼널 분석' },
      { to: '/region', icon: MapPin, label: '지역별 통계' },
      { to: '/sales-performance', icon: Briefcase, label: '영업관리' },
    ],
  },
  {
    key: 'operations',
    label: '운영 관리',
    items: [
      { to: '/db-manage', icon: Users, label: 'DB관리' },
      { to: '/manage-spend', icon: ClipboardList, label: '광고비 관리' },
    ],
  },
  {
    key: 'updates',
    label: '데이터 업데이트',
    items: [
      { to: '/upload-db', icon: Upload, label: 'DB 업로드' },
      { to: '/upload-projects', icon: FileSpreadsheet, label: '프로젝트 업로드' },
      { to: '/upload-spend', icon: BadgeDollarSign, label: '광고비 업로드' },
    ],
  },
  {
    key: 'system',
    label: '시스템',
    items: [
      { to: '/admin-users', icon: ShieldCheck, label: '관리자 계정 관리' },
    ],
  },
]

function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-blue-700 shadow-[0_5px_14px_rgba(30,64,175,0.28)]">
        <img src="/favicon.png" alt="창호마스터 이음" className="h-full w-full object-cover" />
      </div>
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold leading-tight text-white">창호마스터 이음</p>
          <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">광고 성과 대시보드</p>
        </div>
      )}
    </div>
  )
}

function Navigation({ mobile = false, onSelect }: { mobile?: boolean; onSelect?: () => void }) {
  const { user } = useAuth()
  const location = useLocation()
  const visibleGroups = NAV_GROUPS
    .map(group => ({ ...group, items: group.items.filter(item => canAccess(user, item.to)) }))
    .filter(group => group.items.length > 0)
  const currentGroup = visibleGroups.find(group => group.items.some(item => item.to === location.pathname))?.key
  const [openGroup, setOpenGroup] = useState<string | null>(currentGroup || visibleGroups[0]?.key || null)

  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
      {visibleGroups.map((group, groupIndex) => {
        const expanded = !mobile || openGroup === group.key
        return (
          <section key={group.key} className={clsx(groupIndex > 0 && 'mt-3 border-t border-white/[0.06] pt-3')}>
            <button
              type="button"
              onClick={() => mobile && setOpenGroup(expanded ? null : group.key)}
              className={clsx(
                'flex w-full items-center justify-between px-3 pb-1.5 text-left text-[10px] font-semibold text-slate-500',
                mobile ? 'cursor-pointer rounded-md py-1.5 active:bg-white/[0.04]' : 'cursor-default',
              )}
              aria-expanded={expanded}
            >
              <span>{group.label}</span>
              {mobile && <ChevronDown size={13} className={clsx('transition-transform', expanded && 'rotate-180')} />}
            </button>

            {expanded && (
              <div className="space-y-0.5">
                {group.items.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onSelect}
                    className={({ isActive }) => clsx(
                      'group flex min-h-10 items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150',
                      isActive
                        ? 'bg-blue-600 text-white shadow-[0_6px_18px_rgba(37,99,235,0.24)]'
                        : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={clsx(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                          isActive ? 'bg-white/15 text-white' : 'bg-white/[0.035] text-slate-500 group-hover:text-slate-300',
                        )}>
                          <Icon size={15} strokeWidth={1.8} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        {isActive && <ChevronRight size={13} className="shrink-0 text-blue-100" />}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </nav>
  )
}

function AccountPanel({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth()
  const displayName = user?.name || user?.id || '관리자'
  return (
    <div className="border-t border-white/[0.07] p-3">
      <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.035] p-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-700 text-xs font-bold text-slate-100">
          {displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-200">{displayName}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{user?.role === 'master' ? '마스터 관리자' : '관리자'}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white"
          aria-label="로그아웃"
          title="로그아웃"
        >
          <LogOut size={15} />
        </button>
      </div>
    </div>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { logout } = useAuth()

  return (
    <div className="min-h-screen bg-[#f5f7fa] md:flex md:h-screen md:overflow-hidden">
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/[0.07] bg-[#0b1220] px-4 text-white shadow-lg md:hidden">
        <BrandLogo />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white active:bg-white/10"
          aria-label="메뉴 열기"
        >
          <Menu size={21} />
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-label="메뉴 닫기 배경"
          />
          <aside className="relative flex h-full w-[86vw] max-w-[304px] flex-col border-r border-white/[0.07] bg-[#0b1220] text-white shadow-2xl">
            <div className="flex h-20 items-center justify-between gap-2 px-5">
              <BrandLogo />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-slate-300 active:bg-white/10"
                aria-label="메뉴 닫기"
              >
                <X size={18} />
              </button>
            </div>
            <Navigation mobile onSelect={() => setMobileOpen(false)} />
            <AccountPanel onLogout={() => logout()} />
          </aside>
        </div>
      )}

      <aside className="hidden w-[248px] flex-shrink-0 flex-col border-r border-white/[0.07] bg-[#0b1220] text-white shadow-[8px_0_28px_rgba(15,23,42,0.08)] md:flex">
        <div className="flex h-20 items-center px-5">
          <BrandLogo />
        </div>
        <Navigation />
        <AccountPanel onLogout={() => logout()} />
      </aside>

      <main className="min-h-screen flex-1 overflow-y-auto pt-16 md:h-screen md:min-h-0 md:pt-0">
        {children}
      </main>
    </div>
  )
}
