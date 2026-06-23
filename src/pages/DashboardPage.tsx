// src/pages/DashboardPage.tsx
import { useEffect, useMemo, useState } from 'react'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO } from 'date-fns'
import { Users, DollarSign, TrendingDown, CalendarDays, RefreshCw, ChevronDown } from 'lucide-react'
import { fetchLeads, fetchAdSpend } from '../lib/dataService'
import type { LeadRecord, AdSpend, ViewMode } from '../types'
import TimeSeriesChart from '../components/dashboard/TimeSeriesChart'
import ChannelBar from '../components/channels/ChannelBar'
import clsx from 'clsx'

const today = format(new Date(), 'yyyy-MM-dd')
const CHANNELS = ['naver','google','meta','youtube','viral','direct','tu_albarich','tu_youtube','tu_danggeun','hugreen_danggeun','hugreen_mail','inbound_call','etc'] as const
const ONLINE_CHANNELS = new Set(['naver','google','meta','youtube','viral'])
const CHANNEL_LABELS: Record<string, string> = {
  naver:'네이버', google:'구글', meta:'메타', youtube:'유튜브', viral:'바이럴', direct:'직접유입',
  tu_albarich:'TU-알바리치', tu_youtube:'TU-유튜브', tu_danggeun:'TU-당근',
  hugreen_danggeun:'휴그린-당근', hugreen_mail:'휴그린-메일', inbound_call:'인바운드-인입콜', etc:'기타'
}
const CHANNEL_COLORS: Record<string, string> = {
  naver:'#03C75A', google:'#4285F4', meta:'#1877F2', youtube:'#FF0000', viral:'#7C3AED', direct:'#64748B',
  tu_albarich:'#0EA5E9', tu_youtube:'#EF4444', tu_danggeun:'#F97316',
  hugreen_danggeun:'#22C55E', hugreen_mail:'#14B8A6', inbound_call:'#334155', etc:'#94A3B8'
}

function defaultSubChannelForChannel(ch: string) {
  if (ch === 'naver') return '네이버 SA'
  if (ch === 'google') return '구글 검색광고'
  if (ch === 'meta') return '메타'
  if (ch === 'youtube') return '유튜브'
  if (ch === 'viral') return '바이럴'
  if (ch === 'direct') return '홈페이지 직접유입'
  if (ch === 'tu_albarich') return 'TU-알바리치'
  if (ch === 'tu_youtube') return 'TU-유튜브'
  if (ch === 'tu_danggeun') return 'TU-당근'
  if (ch === 'hugreen_danggeun') return '휴그린-당근'
  if (ch === 'hugreen_mail') return '휴그린-메일'
  if (ch === 'inbound_call') return '인바운드-인입콜'
  return '기타'
}

function channelFromSubChannel(label?: string) {
  const t = String(label || '').toLowerCase().replace(/[\s_\-\/()\[\].]/g, '')
  if (!t) return ''
  if (t.includes('네이버') || t.includes('naver') || t.includes('gfa') || t.includes('브랜드검색')) return 'naver'
  if (t.includes('구글') || t.includes('google') || t.includes('디맨드') || t.includes('demand') || t.includes('gdn')) return 'google'
  if (t.includes('메타') || t.includes('인스타') || t.includes('facebook') || t.includes('meta')) return 'meta'
  if (t.includes('유튜브') || t.includes('youtube')) return 'youtube'
  if (t.includes('바이럴') || t.includes('블로그') || t.includes('레뷰') || t.includes('카페')) return 'viral'
  if (t.includes('홈페이지') || t.includes('직접유입') || t.includes('direct')) return 'direct'
  if (t.includes('tu알바리치') || t === 'tu') return 'tu_albarich'
  if (t.includes('tu유튜브') || t.includes('tu유투브')) return 'tu_youtube'
  if (t.includes('tu당근')) return 'tu_danggeun'
  if (t.includes('휴그린당근')) return 'hugreen_danggeun'
  if (t.includes('휴그린메일') || t.includes('휴그린본사')) return 'hugreen_mail'
  if (t.includes('인바운드') || t.includes('인입콜')) return 'inbound_call'
  return ''
}

function safeDetailLabel(ch: string, rawLabel?: string) {
  const label = String(rawLabel || '').trim()
  if (!label) return defaultSubChannelForChannel(ch)
  const implied = channelFromSubChannel(label)
  // 저장된 channel과 subChannel이 서로 다르면 상세매체 오염값으로 보고 현재 channel 기준으로 보정한다.
  if (implied && implied !== ch) return defaultSubChannelForChannel(ch)
  return label
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
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null)

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
  // CPL은 온라인 광고매체만 기준으로 계산. 외부유입(TU/휴그린/인바운드/직접유입/기타)은 제외.
  const onlineActiveLeads = activeLeads.filter(l => ONLINE_CHANNELS.has(l.channel))
  const periodSpend = activeSpends.filter(s => ONLINE_CHANNELS.has(s.channel)).reduce((a, b) => a + b.amount, 0)
  const totalSpend = spends.filter(s => ONLINE_CHANNELS.has(s.channel)).reduce((a, b) => a + b.amount, 0)
  const totalDB = activeLeads.length
  const avgCPL = onlineActiveLeads.length > 0 ? Math.round(periodSpend / onlineActiveLeads.length) : 0

  const channelStats = CHANNELS.map(ch => {
    const chLeads = activeLeads.filter(l => l.channel === ch)
    const db = chLeads.length
    const spend = ONLINE_CHANNELS.has(ch) ? activeSpends.filter(s => s.channel === ch).reduce((a, b) => a + b.amount, 0) : 0
    const cpl = db > 0 ? Math.round(spend / db) : 0
    const detailMap = new Map<string, number>()
    chLeads.forEach(l => {
      const label = safeDetailLabel(ch, l.subChannel)
      detailMap.set(label, (detailMap.get(label) || 0) + 1)
    })
    const details = Array.from(detailMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
    return { ch, label: CHANNEL_LABELS[ch], db, spend, cpl, color: CHANNEL_COLORS[ch], details }
  })
  const maxDB = Math.max(...channelStats.map(c => c.db), 1)

  const firstDB = activeLeads.filter(l => l.dbTier === 'first').length
  const secondDB = activeLeads.filter(l => l.dbTier === 'second').length
  const firstReentryDB = activeLeads.filter(l => l.dbTier === 'first_reentry').length
  const secondReentryDB = activeLeads.filter(l => l.dbTier === 'second_reentry').length
  const firstTotalDB = firstDB + firstReentryDB
  const secondTotalDB = secondDB + secondReentryDB
  const conversionRate = firstTotalDB > 0 ? Math.round((secondTotalDB / firstTotalDB) * 100) : 0

  const todayDB = validLeads.filter(l => l.date === today).length

  const periodLabel = viewMode === 'daily'
    ? (range.activeStart === today ? '오늘 DB' : '선택일 DB')
    : viewMode === 'monthly'
      ? (selectedDate.slice(0, 7) === today.slice(0, 7) ? '이번달 DB' : '선택월 DB')
      : (selectedDate.slice(0, 4) === today.slice(0, 4) ? '올해 DB' : '선택연 DB')

  const STAT_CARDS = [
    { label: '오늘 DB', value: todayDB, unit: '건', icon: CalendarDays, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: periodLabel, value: totalDB, unit: '건', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: '누적 DB', value: validLeads.length, unit: '건', icon: Users, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: viewMode === 'daily' ? '선택일 광고비' : viewMode === 'monthly' ? '이번달 광고비' : '선택연 광고비', value: fmtKRW(periodSpend), unit: '원', icon: DollarSign, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: '평균 CPL', value: fmtKRW(avgCPL), unit: '원', icon: TrendingDown, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: '1→2 전환율', value: conversionRate, unit: '%', icon: TrendingDown, color: 'text-cyan-600', bg: 'bg-cyan-50' },
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
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-bold text-slate-800 whitespace-nowrap">메인 대시보드</h1>
          <p className="text-xs text-slate-500 mt-0.5 whitespace-nowrap">{range.label}</p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 md:mx-0 md:px-0 md:pb-0 md:overflow-visible">
          <div className="flex shrink-0 bg-white border border-slate-200 rounded-lg p-1 gap-0.5">
            {(['daily','monthly','yearly'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={clsx('tab-btn', viewMode===m && 'active')}>
                {m === 'daily' ? '일별' : m === 'monthly' ? '월별' : '연별'}
              </button>
            ))}
          </div>

          {viewMode === 'daily' && (
            <input type="date" value={inputValue} onChange={(e) => handleDateChange(e.target.value)} className="h-9 shrink-0 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700" />
          )}
          {viewMode === 'monthly' && (
            <input type="month" value={inputValue} onChange={(e) => handleDateChange(e.target.value)} className="h-9 shrink-0 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700" />
          )}
          {viewMode === 'yearly' && (
            <input type="number" min="2020" max="2035" value={inputValue} onChange={(e) => handleDateChange(e.target.value)} className="h-9 w-24 shrink-0 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700" />
          )}

          <button onClick={() => setSelectedDate(today)} className="btn-secondary">오늘</button>
          <button onClick={load} className="btn-secondary">
            <RefreshCw size={13} className={clsx(loading && 'animate-spin')} /> 새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">
            {viewMode === 'daily' ? '일자별 DB 추이' : viewMode === 'monthly' ? '월별 DB 추이' : '연도별 DB 추이'}
          </p>
          <TimeSeriesChart leads={validLeads} spends={spends} viewMode={viewMode} selectedDate={selectedDate} />
        </div>

        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">유입채널 현황</p>
          {[
            { title: '온라인 광고', rows: channelStats.filter(c => ONLINE_CHANNELS.has(c.ch)) },
            { title: '외부 유입', rows: channelStats.filter(c => !ONLINE_CHANNELS.has(c.ch)) },
          ].map(group => (
            <div key={group.title} className="space-y-2">
              <p className="pt-1 text-[11px] font-semibold text-slate-400">{group.title}</p>
              {group.rows.map(({ ch, label, db, spend, color, details }) => (
                <div key={ch} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setExpandedChannel(expandedChannel === ch ? null : ch)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-1">
                      <div className="flex-1">
                        <ChannelBar label={label} db={db} spend={spend} maxDB={maxDB} color={color} />
                      </div>
                      <ChevronDown size={13} className={clsx('text-slate-400 transition-transform', expandedChannel === ch && 'rotate-180')} />
                    </div>
                  </button>
                  {expandedChannel === ch && details.length > 0 && (
                    <div className="ml-5 mr-1 mb-2 rounded-lg bg-slate-50 border border-slate-100 p-2 space-y-1">
                      {details.map(d => (
                        <div key={d.label} className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">{d.label}</span>
                          <span className="font-semibold text-slate-700">{d.count.toLocaleString()}건</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: '리타겟 DB', tier: 'retarget', color: 'bg-violet-500', light: 'bg-violet-50 text-violet-700' },
          { label: '1차 DB', tier: 'first', color: 'bg-blue-500', light: 'bg-blue-50 text-blue-700' },
          { label: '2차 DB', tier: 'second', color: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-700' },
          { label: '1차 재인입', tier: 'first_reentry', color: 'bg-sky-500', light: 'bg-sky-50 text-sky-700' },
          { label: '2차 재인입', tier: 'second_reentry', color: 'bg-teal-500', light: 'bg-teal-50 text-teal-700' },
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
