// src/components/Layout.tsx
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Radio, Upload, BadgeDollarSign,
  MapPin, GitMerge, ChevronRight, Megaphone, Users, Menu, X, ClipboardList, ShieldCheck, LogOut
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../contexts/AuthContext'
import { canAccess } from '../lib/auth'

const NAV = [
  { to: '/dashboard',     icon: LayoutDashboard,    label: '메인 대시보드' },
  { to: '/channels',      icon: Radio,              label: '매체별 성과' },
  { to: '/funnel',        icon: GitMerge,           label: '퍼널 분석' },
  { to: '/region',        icon: MapPin,             label: '지역별 통계' },
  { to: '/db-manage',     icon: Users,              label: 'DB관리' },
  { to: '/upload-db',     icon: Upload,             label: 'DB 업로드' },
  { to: '/upload-spend',  icon: BadgeDollarSign,    label: '광고비 업로드' },
  { to: '/manage-spend',  icon: ClipboardList,      label: '광고비 관리' },
  { to: '/admin-users',   icon: ShieldCheck,       label: '관리자 계정 관리' },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white">
        <Megaphone size={16} />
      </div>
      <div>
        <p className="text-xs font-bold leading-none text-white">창호마스터</p>
        <p className="text-[10px] text-slate-400 mt-0.5">이음 AD Dashboard</p>
      </div>
    </div>
  )
}

function Navigation({ onSelect }: { onSelect?: () => void }) {
  const { user } = useAuth()
  return (
    <nav className="flex-1 py-3 overflow-y-auto">
      <p className="px-5 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        메뉴
      </p>
      {NAV.filter(item => canAccess(user, item.to)).map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onSelect}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors duration-100 group',
              isActive
                ? 'bg-blue-600 text-white font-medium'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={16} className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'} />
              <span className="flex-1">{label}</span>
              {isActive && <ChevronRight size={12} className="opacity-60" />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50 md:flex md:h-screen md:overflow-hidden">
      {/* Mobile Top Header */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between bg-slate-900 px-4 text-white shadow md:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-white active:bg-slate-700"
          aria-label="메뉴 열기"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-label="메뉴 닫기 배경"
          />
          <aside className="relative flex h-full w-[82vw] max-w-[320px] flex-col bg-slate-900 text-white shadow-2xl">
            <div className="h-14 flex items-center justify-between gap-2.5 px-5 border-b border-slate-700/60">
              <Logo />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 active:bg-slate-700"
                aria-label="메뉴 닫기"
              >
                <X size={20} />
              </button>
            </div>
            <Navigation onSelect={() => setMobileOpen(false)} />
            <div className="px-4 py-3 border-t border-slate-700/60">
              <div className="mb-2 text-xs text-slate-300">{user?.name || user?.id}<span className="ml-1 text-[10px] text-slate-500">{user?.role === 'master' ? '마스터' : '관리자'}</span></div>
              <button onClick={() => logout()} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"><LogOut size={14}/> 로그아웃</button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden w-56 flex-shrink-0 flex-col bg-slate-900 text-white md:flex">
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-slate-700/60">
          <Logo />
        </div>
        <Navigation />
        <div className="px-4 py-3 border-t border-slate-700/60">
          <div className="mb-2 truncate text-xs text-slate-300">{user?.name || user?.id}<span className="ml-1 text-[10px] text-slate-500">{user?.role === 'master' ? '마스터' : '관리자'}</span></div>
          <button onClick={() => logout()} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"><LogOut size={14}/> 로그아웃</button>
        </div>
      </aside>

      {/* Main */}
      <main className="min-h-screen flex-1 overflow-y-auto pt-14 md:h-screen md:min-h-0 md:pt-0">
        {children}
      </main>
    </div>
  )
}
