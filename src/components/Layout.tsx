// src/components/Layout.tsx
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Radio, Upload, BadgeDollarSign,
  MapPin, GitMerge, ChevronRight, Megaphone, Users
} from 'lucide-react'
import clsx from 'clsx'

const NAV = [
  { to: '/dashboard',     icon: LayoutDashboard,    label: '메인 대시보드' },
  { to: '/channels',      icon: Radio,              label: '매체별 성과' },
  { to: '/funnel',        icon: GitMerge,           label: '퍼널 분석' },
  { to: '/region',        icon: MapPin,             label: '지역별 통계' },
  { to: '/db-manage',     icon: Users,              label: 'DB관리' },
  { to: '/upload-db',     icon: Upload,             label: 'DB 업로드' },
  { to: '/upload-spend',  icon: BadgeDollarSign,    label: '광고비 업로드' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col bg-slate-900 text-white">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-slate-700/60">
          <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
            <Megaphone size={15} />
          </div>
          <div>
            <p className="text-xs font-bold leading-none text-white">창호마스터</p>
            <p className="text-[10px] text-slate-400 mt-0.5">이음 AD Dashboard</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <p className="px-5 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            메뉴
          </p>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm transition-colors duration-100 group',
                  isActive
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'} />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight size={12} className="opacity-60" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700/60">
          <p className="text-[10px] text-slate-500">© 2024 창호마스터 이음</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
