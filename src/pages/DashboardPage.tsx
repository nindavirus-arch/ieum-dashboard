// src/pages/DashboardPage.tsx
import { useEffect, useMemo, useState } from 'react'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO } from 'date-fns'
import { Users, DollarSign, TrendingDown, CalendarDays, RefreshCw } from 'lucide-react'
import { fetchLeads, fetchAdSpend } from '../lib/dataService'
import type { LeadRecord, AdSpend, ViewMode } from '../types'
import TimeSeriesChart from '../components/dashboard/TimeSeriesChart'
import ChannelBar from '../components/channels/ChannelBar'
import clsx from 'clsx'

const today = format(new Date(), 'yyyy-MM-dd')
const CHANNELS = ['naver','google','meta','youtube','viral','direct','etc'] as const
const CHANNEL_LABELS: Record<string, string> = {
  naver:'네이버', google:'구글', meta:'메타', youtube:'유튜브', viral:'바이럴', direct:'직접유입', etc:'기타'
}
const CHANNEL_COLORS: Record<string, string> = {
  naver:'#03C75A', google:'#4285F4', meta:'#1877F2', youtube:'#FF0000', viral:'#7C3AED', direct:'#64748B', etc:'#94A3B8'
}

function fmtKRW(n: number) {
  if (n >= 100_000_000) return `${(n/100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n/10_000)}만`
  return n.toLocaleString()
}

function safeDate(date: string) {
  try {
    const d = parseISO(date)
    if (!Number.isNaN(d.getTime())) return d
  } catch {}
  return new Date()
}

function rangeByMode(viewMode: ViewMode, selectedDate: string) {
  const base = safeDate(selectedDate)
  if (viewMode === 'daily') {
    return {
      start: format(startOfMonth(base), 'yyyy-MM-dd'),
      end: format(endOfMonth(base), 'yyyy-MM-dd'),
      activeStart: selectedDate,
      activeEnd: selectedDate,
      label: `${format(base, 'yyyy년 MM월 dd일')} 기준`,
      cardLabel: '선택일 DB',
    }
  }
  if (viewMode === 'monthly') {
    return {
      start: format(startOfYear(base), 'yyyy-MM-dd'),
      end: format(endOfYear(base), 'yyyy-MM-dd'),
      activeStart: format(startOfMonth(base), 'yyyy-MM-dd'),
      activeEnd: format(endOfMonth(base), 'yyyy-MM-dd'),
      label: `${format(base, 'yyyy년 MM월')} 기준`,
      cardLabel: '선택월 DB',
    }
  }
  return {
    start: format(startOfYear(base), 'yyyy-MM-dd'),
    end: format(endOfYear(base), 'yyyy-MM-dd'),
    activeStart: format(startOfYear(base), 'yyyy-MM-dd'),
    activeEnd: format(endOfYear(base), 'yyyy-MM-dd'),
    label: `${format(base, 'yyyy년')} 기준`,
    cardLabel: '선택연 DB',
  }
}

function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end
}

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly')
  const [selectedDate, setSelectedDate] = useState(today)
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [spends, setSpends] = useState<AdSpend[]>([])
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => rangeByMode(viewMode, selectedDate), [viewMode, selectedDate])

  async function load() {
    setLoading(true)
    try {
      const [l, s] = await Promise.all([fetchLeads(range.start, range.end), fetchAdSpend(range.start, range.end)])
      setLeads(l)
      setSpends(s)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [viewMode, selectedDate])

  const validLeads = leads.filter(l => l.status !== 'invalid' && l.status !== 'test' && l.status !== 'duplicate')
  const activeLeads = validLeads.filter(l => inRange(l.date, range.activeStart, range.activeEnd))
  const activeSpends = spends.filter(s => inRange(s.date, range.activeStart, range.activeEnd))
  const periodSpend = activeSpends.reduce((a, b) => a + b.amount, 0)
  const totalSpend = spends.reduce((a, b) => a + b.amount, 0)
  const totalDB = activeLeads.length
  const avgCPL = totalDB > 0 ? Math.round(periodSpend / totalDB) : 0

  const channelStats = CHANNELS.map(ch => {
    const db = activeLeads.filter(l => l.channel === ch).length
    const spend = activeSpends.filter(s => s.channel === ch).reduce((a, b) => a + b.amount, 0)
    const cpl = db > 0 ? Math.round(spend / db) : 0
    return { ch, label: CHANNEL_LABELS[ch], db, spend, cpl, color: CHANNEL_COLORS[ch] }
  })
  const maxDB = Math.max(...channelStats.map(c => c.db), 1)

  const STAT_CARDS = [
    { label: range.cardLabel, value: totalDB, unit: '건', icon: CalendarDays, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: viewMode === 'daily' ? '선택월 DB' : viewMode === 'monthly' ? '선택연 누적 DB' : '선택연 DB', value: validLeads.length, unit: '건', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: viewMode === 'daily' ? '선택일 광고비' : viewMode === 'monthly' ? '선택월 광고비' : '선택연 광고비', value: fmtKRW(periodSpend), unit: '원', icon: DollarSign, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: '평균 CPL', value: fmtKRW(avgCPL), unit: '원', icon: TrendingDown, color: 'text-orange-600', bg: 'bg-orange-50' },
  ]

  const inputValue = viewMode === 'daily'
    ? selectedDate
    : viewMode === 'monthly'
      ? selectedDate.slice(0, 7)
      : selectedDate.slice(0, 4)

  function handleDateChange(value: string) {
    if (!value) return
    if (viewMode === 'daily') setSelectedDate(value)
    else if (viewMode === 'monthly') setSelectedDate(`${value}-01`)
    else setSelectedDate(`${value}-01-01`)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">메인 대시보드</h1>
          <p className="text-xs text-slate-500 mt-0.5">{range.label}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-slate-200 rounded-lg p-1 gap-0.5">
            {(['daily','monthly','yearly'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={clsx('tab-btn', viewMode===m && 'active')}>
                {m === 'daily' ? '일별' : m === 'monthly' ? '월별' : '연별'}
              </button>
            ))}
          </div>

          {viewMode === 'daily' && (
            <input type="date" value={inputValue} onChange={(e) => handleDateChange(e.target.value)} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700" />
          )}
          {viewMode === 'monthly' && (
            <input type="month" value={inputValue} onChange={(e) => handleDateChange(e.target.value)} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700" />
          )}
          {viewMode === 'yearly' && (
            <input type="number" min="2020" max="2035" value={inputValue} onChange={(e) => handleDateChange(e.target.value)} className="h-9 w-24 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700" />
          )}

          <button onClick={() => setSelectedDate(today)} className="btn-secondary">오늘</button>
          <button onClick={load} className="btn-secondary">
            <RefreshCw size={13} className={clsx(loading && 'animate-spin')} /> 새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {STAT_CARDS.map(({ label, value, unit, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-medium">{label}</p>
              <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', bg)}>
                <Icon size={15} className={color} />
              </div>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold text-slate-800">{loading ? '—' : value}</span>
              <span className="text-xs text-slate-400 pb-0.5">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 card p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">
            {viewMode === 'daily' ? '일자별 DB 추이' : viewMode === 'monthly' ? '월별 DB 추이' : '연도별 DB 추이'}
          </p>
          <TimeSeriesChart leads={validLeads} spends={spends} viewMode={viewMode} selectedDate={selectedDate} />
        </div>

        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">유입채널 현황</p>
          {channelStats.map(({ ch, label, db, spend, color }) => (
            <ChannelBar key={ch} label={label} db={db} spend={spend} maxDB={maxDB} color={color} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '리타겟 DB', tier: 'retarget', color: 'bg-violet-500', light: 'bg-violet-50 text-violet-700' },
          { label: '1차 DB', tier: 'first', color: 'bg-blue-500', light: 'bg-blue-50 text-blue-700' },
          { label: '2차 DB', tier: 'second', color: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-700' },
        ].map(({ label, tier, color, light }) => {
          const count = activeLeads.filter(l => l.dbTier === tier).length
          const pct = totalDB > 0 ? Math.round((count / totalDB) * 100) : 0
          return (
            <div key={tier} className="stat-card">
              <div className="flex items-center justify-between">
                <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-md', light)}>{label}</span>
                <span className="text-xs text-slate-400">{pct}%</span>
              </div>
              <p className="text-xl font-bold text-slate-800">{loading ? '—' : count.toLocaleString()}<span className="text-xs text-slate-400 ml-1">건</span></p>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                <div className={clsx('h-1.5 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
