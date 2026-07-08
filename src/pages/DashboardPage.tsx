// src/pages/DashboardPage.tsx
import { useEffect, useMemo, useState } from 'react'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO, subDays, eachDayOfInterval } from 'date-fns'
import { Users, DollarSign, TrendingDown, CalendarDays, RefreshCw, ChevronDown } from 'lucide-react'
import { fetchLeads, fetchAdSpend } from '../lib/dataService'
import type { LeadRecord, AdSpend, ViewMode } from '../types'
import TimeSeriesChart from '../components/dashboard/TimeSeriesChart'
import ChannelBar from '../components/channels/ChannelBar'
import DataUpdatedAt from '../components/DataUpdatedAt'
import clsx from 'clsx'
import { buildLeadJourneys, isDirectSales, isPaidChannel, trafficGroup, type TrafficGroup } from '../lib/leadMetrics'

const today = format(new Date(), 'yyyy-MM-dd')
const PAID_CHANNEL_LIST = ['naver','google','meta','youtube','viral','danggeun','kakao_search','kakao_moment'] as const
const EXTERNAL_CHANNEL_LIST = ['tu_albarich','tu_youtube','tu_danggeun','hugreen_danggeun','hugreen_mail','inbound_call'] as const
const CHANNEL_LABELS: Record<string, string> = {
  naver:'네이버', google:'구글', meta:'메타', youtube:'유튜브', viral:'바이럴', danggeun:'당근', direct:'직접유입',
  kakao_search:'카카오 검색광고', kakao_moment:'카카오모먼트',
  tu_albarich:'TU-알바리치', tu_youtube:'TU-유튜브', tu_danggeun:'TU-당근',
  hugreen_danggeun:'휴그린-당근', hugreen_mail:'휴그린-메일', inbound_call:'인바운드-인입콜', etc:'기타'
}
const CHANNEL_COLORS: Record<string, string> = {
  naver:'#03C75A', google:'#4285F4', meta:'#1877F2', youtube:'#FF0000', viral:'#7C3AED', danggeun:'#FF6F0F', kakao_search:'#FEE500', kakao_moment:'#111827', direct:'#64748B',
  tu_albarich:'#0EA5E9', tu_youtube:'#EF4444', tu_danggeun:'#F97316',
  hugreen_danggeun:'#22C55E', hugreen_mail:'#14B8A6', inbound_call:'#334155', etc:'#94A3B8'
}

function defaultSubChannelForChannel(ch: string) {
  if (ch === 'naver') return '네이버 SA'
  if (ch === 'google') return '구글 검색광고'
  if (ch === 'meta') return '메타'
  if (ch === 'youtube') return '유튜브'
  if (ch === 'viral') return '바이럴'
  if (ch === 'danggeun') return '당근'
  if (ch === 'kakao_search') return '카카오 검색광고'
  if (ch === 'kakao_moment') return '카카오모먼트'
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
  if (t.includes('tu유튜브') || t.includes('tu유투브') || t.includes('tuyoutube')) return 'tu_youtube'
  if (t.includes('tu당근') || t.includes('tucarrot')) return 'tu_danggeun'
  if (t.includes('tu알바리치') || t.includes('tualbarich') || t === 'tu') return 'tu_albarich'
  if (t.includes('휴그린당근') || t.includes('hugreendanggeun')) return 'hugreen_danggeun'
  if (t.includes('휴그린메일') || t.includes('hugreenmail')) return 'hugreen_mail'
  if (t.includes('네이버') || t.includes('naver') || t.includes('gfa') || t.includes('브랜드검색')) return 'naver'
  if (t.includes('구글') || t.includes('google') || t.includes('디맨드') || t.includes('demand') || t.includes('gdn')) return 'google'
  if (t.includes('메타') || t.includes('인스타') || t.includes('facebook') || t.includes('meta')) return 'meta'
  if (t.includes('유튜브') || t.includes('youtube')) return 'youtube'
  if (t.includes('바이럴') || t.includes('블로그') || t.includes('레뷰') || t.includes('카페')) return 'viral'
  if (t.includes('카카오검색') || t.includes('kakaosearch') || t.includes('kakaosa')) return 'kakao_search'
  if (t.includes('카카오모먼트') || t.includes('카카오모멘트') || t.includes('kakaomoment')) return 'kakao_moment'
  if (t.includes('홈페이지') || t.includes('직접유입') || t.includes('직접영업') || t.includes('direct')) return 'direct'
  if (t.includes('당근') || t.includes('carrot') || t.includes('karrot')) return 'danggeun'
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

type ChannelRowDefinition = {
  key: string
  label: string
  color: string
  group: TrafficGroup
  matches: (lead: LeadRecord) => boolean
  spendChannel?: string
}

const CHANNEL_ROW_DEFINITIONS: ChannelRowDefinition[] = [
  ...PAID_CHANNEL_LIST.map(ch => ({
    key: ch,
    label: CHANNEL_LABELS[ch],
    color: CHANNEL_COLORS[ch],
    group: 'paid' as const,
    matches: (lead: LeadRecord) => lead.channel === ch,
    spendChannel: ch,
  })),
  {
    key: 'online_direct',
    label: '홈페이지·온라인 기타',
    color: '#64748B',
    group: 'organic',
    matches: (lead: LeadRecord) => trafficGroup(lead) === 'organic',
  },
  {
    key: 'direct_sales',
    label: '직접영업',
    color: '#475569',
    group: 'external',
    matches: (lead: LeadRecord) => isDirectSales(lead),
  },
  ...EXTERNAL_CHANNEL_LIST.map(ch => ({
    key: ch,
    label: CHANNEL_LABELS[ch],
    color: CHANNEL_COLORS[ch],
    group: 'external' as const,
    matches: (lead: LeadRecord) => lead.channel === ch && !isDirectSales(lead),
  })),
  {
    key: 'unclassified',
    label: '미분류',
    color: '#94A3B8',
    group: 'unclassified',
    matches: (lead: LeadRecord) => trafficGroup(lead) === 'unclassified',
  },
]

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
  if (viewMode === 'weekly') {
    const start = subDays(base, 6)
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: selectedDate,
      activeStart: format(start, 'yyyy-MM-dd'),
      activeEnd: selectedDate,
      label: `${format(start, 'yyyy년 MM월 dd일')} ~ ${format(base, 'MM월 dd일')}`,
      cardLabel: '최근 7일 DB',
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
  const [viewMode, setViewMode] = useState<ViewMode>('daily')
  const [selectedDate, setSelectedDate] = useState(today)
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [spends, setSpends] = useState<AdSpend[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null)

  const range = useMemo(() => rangeByMode(viewMode, selectedDate), [viewMode, selectedDate])

  async function load() {
    setLoading(true)
    try {
      const [l, s] = await Promise.all([fetchLeads(undefined, undefined, { includeRawAttribution: true }), fetchAdSpend()])
      setLeads(l)
      setSpends(s)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const journeys = useMemo(() => buildLeadJourneys(leads), [leads])
  const validLeads = useMemo(() => journeys.map(journey => journey.lead), [journeys])
  const activeJourneys = journeys.filter(journey => inRange(journey.lead.date, range.activeStart, range.activeEnd))
  const activeLeads = activeJourneys.map(journey => journey.lead)
  const activeSpends = spends.filter(s => inRange(s.date, range.activeStart, range.activeEnd))
  const paidValidLeads = activeLeads.filter(l => isPaidChannel(l.channel) && (l.dbTier === 'first' || l.dbTier === 'second'))
  const periodSpend = activeSpends.filter(s => isPaidChannel(s.channel)).reduce((a, b) => a + b.amount, 0)
  const totalDB = activeLeads.length
  const avgCPL = paidValidLeads.length > 0 ? Math.round(periodSpend / paidValidLeads.length) : 0

  const channelStats = CHANNEL_ROW_DEFINITIONS.map(definition => {
    const chLeads = activeLeads.filter(definition.matches)
    const db = chLeads.length
    const spend = definition.spendChannel
      ? activeSpends.filter(s => s.channel === definition.spendChannel).reduce((a, b) => a + b.amount, 0)
      : 0
    const detailMap = new Map<string, { count: number; retarget: number; first: number; second: number }>()
    chLeads.forEach(l => {
      const label = isDirectSales(l) ? '직접영업' : safeDetailLabel(l.channel, l.subChannel)
      const current = detailMap.get(label) || { count: 0, retarget: 0, first: 0, second: 0 }
      current.count += 1
      current[l.dbTier as 'retarget' | 'first' | 'second'] += 1
      detailMap.set(label, current)
    })
    const details = Array.from(detailMap.entries())
      .map(([label, counts]) => ({ label, ...counts }))
      .sort((a, b) => b.count - a.count)
    return { ...definition, db, spend, details }
  }).filter(row => row.db > 0 || row.spend > 0)
  const maxDB = Math.max(...channelStats.map(c => c.db), 1)

  const retargetOnly = activeJourneys.filter(journey => journey.stage === 'retarget').length
  const firstOnly = activeJourneys.filter(journey => journey.stage === 'first').length
  const convertedSecond = activeJourneys.filter(journey => journey.secondType === 'estimate_to_consult').length
  const directSecond = activeJourneys.filter(journey => journey.secondType === 'direct_consult').length
  const estimatePool = firstOnly + convertedSecond
  const conversionRate = estimatePool > 0 ? Math.round((convertedSecond / estimatePool) * 100) : 0

  const todayDB = validLeads.filter(l => l.date === today).length
  const yesterday = format(subDays(safeDate(today), 1), 'yyyy-MM-dd')
  const yesterdayDB = validLeads.filter(l => l.date === yesterday).length
  const dailyTotalSummary = useMemo(() => {
    const base = safeDate(selectedDate)
    const days = eachDayOfInterval({ start: startOfMonth(base), end: endOfMonth(base) })
    return days.map(day => {
      const key = format(day, 'yyyy-MM-dd')
      return {
        key,
        day: format(day, 'd일'),
        total: validLeads.filter(lead => lead.date === key).length,
        active: key === selectedDate,
      }
    })
  }, [selectedDate, validLeads])
  const detailPerformanceKeys = new Set<string>()
  activeLeads.filter(lead => isPaidChannel(lead.channel)).forEach(lead => {
    detailPerformanceKeys.add(`${lead.channel}__${safeDetailLabel(lead.channel, lead.subChannel)}`)
  })
  activeSpends.filter(spend => isPaidChannel(spend.channel)).forEach(spend => {
    detailPerformanceKeys.add(`${spend.channel}__${safeDetailLabel(spend.channel, spend.subChannel)}`)
  })
  const detailPerformance = Array.from(detailPerformanceKeys).map(key => {
    const [channel, label] = key.split('__')
    const matchedJourneys = activeJourneys.filter(journey =>
      journey.lead.channel === channel && safeDetailLabel(journey.lead.channel, journey.lead.subChannel) === label
    )
    const second = matchedJourneys.filter(journey => journey.stage === 'second').length
    const first = matchedJourneys.filter(journey => journey.stage === 'first').length
    const converted = matchedJourneys.filter(journey => journey.secondType === 'estimate_to_consult').length
    const spend = activeSpends
      .filter(row => row.channel === channel && safeDetailLabel(row.channel, row.subChannel) === label)
      .reduce((sum, row) => sum + row.amount, 0)
    const validDB = first + second
    const cpl = validDB > 0 ? Math.round(spend / validDB) : 0
    const conversion = first + converted > 0 ? Math.round((converted / (first + converted)) * 100) : 0
    return { key, channel, label, second, validDB, spend, cpl, conversion }
  })
    .filter(row => row.spend > 0 || row.validDB > 0)
    .sort((a, b) => b.validDB - a.validDB || a.cpl - b.cpl || b.spend - a.spend)
    .slice(0, 5)

  const STAT_CARDS = [
    { label: '오늘 DB', value: todayDB, unit: '건', icon: CalendarDays, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: '어제 DB', value: yesterdayDB, unit: '건', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: '누적 DB', value: validLeads.length, unit: '건', icon: Users, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: '선택일 광고비', value: fmtKRW(periodSpend), unit: '원', icon: DollarSign, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: '유효 DB CPL', value: fmtKRW(avgCPL), unit: '원', icon: TrendingDown, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: '1→2 전환율', value: conversionRate, unit: '%', icon: TrendingDown, color: 'text-cyan-600', bg: 'bg-cyan-50' },
  ]

  const inputValue = viewMode === 'daily'
    ? selectedDate
    : viewMode === 'weekly'
      ? selectedDate
    : viewMode === 'monthly'
      ? selectedDate.slice(0, 7)
      : selectedDate.slice(0, 4)

  function handleDateChange(value: string) {
    if (!value) return
    if (viewMode === 'daily' || viewMode === 'weekly') setSelectedDate(value)
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
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
          <div className="flex max-w-full overflow-x-auto bg-white border border-slate-200 rounded-lg p-1 gap-0.5">
            {(['daily','weekly','monthly','yearly'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={clsx('tab-btn shrink-0', viewMode===m && 'active')}>
                {m === 'daily' ? '일별' : m === 'weekly' ? '주별' : m === 'monthly' ? '월별' : '연별'}
              </button>
            ))}
          </div>

          {(viewMode === 'daily' || viewMode === 'weekly') && (
            <input type="date" value={inputValue} onChange={(e) => handleDateChange(e.target.value)} className="h-9 min-w-0 flex-1 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 sm:flex-none" />
          )}
          {viewMode === 'monthly' && (
            <input type="month" value={inputValue} onChange={(e) => handleDateChange(e.target.value)} className="h-9 shrink-0 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700" />
          )}
          {viewMode === 'yearly' && (
            <input type="number" min="2020" max="2035" value={inputValue} onChange={(e) => handleDateChange(e.target.value)} className="h-9 w-24 shrink-0 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700" />
          )}

          <button onClick={() => { setSelectedDate(today); setViewMode('daily') }} className="btn-secondary shrink-0">오늘</button>
          <DataUpdatedAt />
          <button onClick={load} className="btn-secondary shrink-0">
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
        <div className="lg:col-span-2 card p-5 space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-4">
              {viewMode === 'daily' ? '일자별 DB 추이' : viewMode === 'weekly' ? '최근 7일 DB 추이' : viewMode === 'monthly' ? '월별 DB 추이' : '연도별 DB 추이'}
            </p>
            <TimeSeriesChart leads={validLeads} spends={spends} viewMode={viewMode} selectedDate={selectedDate} />
            {viewMode === 'daily' && (
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">일별 최종 DB 합계</p>
                  <span className="text-[11px] text-slate-400">연락처 중복 제거 기준</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 md:grid-cols-10 xl:grid-cols-16">
                  {dailyTotalSummary.map(item => (
                    <div
                      key={item.key}
                      className={clsx(
                        'rounded-lg border px-2 py-1.5 text-center',
                        item.active
                          ? 'border-blue-200 bg-blue-50 shadow-sm'
                          : item.total > 0
                            ? 'border-slate-200 bg-white'
                            : 'border-slate-100 bg-white/60'
                      )}
                    >
                      <div className={clsx('text-[10px] font-medium', item.active ? 'text-blue-600' : 'text-slate-400')}>{item.day}</div>
                      <div className={clsx('mt-0.5 text-sm font-bold', item.total > 0 ? 'text-slate-800' : 'text-slate-300')}>
                        {item.total.toLocaleString()}건
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-5 grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-700">최종 DB 단계 현황</p>
                <span className="text-[11px] text-slate-400">연락처 중복 제거</span>
              </div>
              <div className="space-y-3">
                {[
                  { label: '리타겟만', count: retargetOnly, color: 'bg-violet-500', text: 'text-violet-700', bg: 'bg-violet-50' },
                  { label: '견적만 확인', count: firstOnly, color: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50' },
                  { label: '견적 후 상담', count: convertedSecond, color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
                  { label: '광고에서 바로 상담', count: directSecond, color: 'bg-cyan-500', text: 'text-cyan-700', bg: 'bg-cyan-50' },
                ].map(item => {
                  const pct = totalDB > 0 ? Math.round((item.count / totalDB) * 100) : 0
                  return (
                    <div key={item.label}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className={clsx('rounded-md px-2 py-0.5 font-medium', item.bg, item.text)}>{item.label}</span>
                        <span className="font-semibold text-slate-700">{item.count.toLocaleString()}건 <span className="font-normal text-slate-400">{pct}%</span></span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100">
                        <div className={clsx('h-1.5 rounded-full', item.color)} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="text-slate-500">견적 → 상담 전환율</span>
                <span className="font-bold text-slate-800">{conversionRate}% <span className="font-normal text-slate-400">({convertedSecond}/{estimatePool})</span></span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-700">상세매체 성과 TOP 5</p>
                <span className="text-[11px] text-slate-400">최종 1차+2차 기준</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400">
                      <th className="pb-2 text-left font-medium">상세매체</th>
                      <th className="pb-2 text-right font-medium">광고비</th>
                      <th className="pb-2 text-right font-medium">유효 DB</th>
                      <th className="pb-2 text-right font-medium">CPL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {detailPerformance.map(row => (
                      <tr key={row.key}>
                        <td className="py-2.5 pr-2">
                          <div className="font-medium text-slate-700">{row.label}</div>
                          <div className="text-[10px] text-slate-400">전환 {row.conversion}%</div>
                        </td>
                        <td className="py-2.5 text-right text-slate-500">{fmtKRW(row.spend)}원</td>
                        <td className="py-2.5 text-right font-semibold text-emerald-700">{row.validDB.toLocaleString()}</td>
                        <td className="py-2.5 text-right font-semibold text-slate-700">{row.validDB > 0 ? `${fmtKRW(row.cpl)}원` : '-'}</td>
                      </tr>
                    ))}
                    {!detailPerformance.length && (
                      <tr><td colSpan={4} className="py-10 text-center text-slate-400">표시할 상세매체 데이터가 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-3 overflow-auto max-h-[760px]">
          <p className="text-sm font-semibold text-slate-700">유입채널 현황</p>
          {[
            { key: 'paid', title: '온라인 광고', showTotal: true, rows: channelStats.filter(c => c.group === 'paid') },
            { key: 'organic', title: '온라인 직접·자연유입', rows: channelStats.filter(c => c.group === 'organic') },
            { key: 'external', title: '외부·제휴유입', showTotal: true, rows: channelStats.filter(c => c.group === 'external') },
            { key: 'unclassified', title: '미분류', rows: channelStats.filter(c => c.group === 'unclassified') },
          ].map(group => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center justify-between pt-1 text-[11px] font-semibold text-slate-400">
                <span>{group.title}</span>
                {group.showTotal && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">
                    합계 {group.rows.reduce((sum, row) => sum + row.db, 0).toLocaleString()}건
                  </span>
                )}
              </div>
              {group.rows.map(({ key, label, db, spend, color, details }) => (
                <div key={key} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setExpandedChannel(expandedChannel === key ? null : key)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-1">
                      <div className="flex-1">
                        <ChannelBar label={label} db={db} spend={spend} maxDB={maxDB} color={color} />
                      </div>
                      <ChevronDown size={13} className={clsx('text-slate-400 transition-transform', expandedChannel === key && 'rotate-180')} />
                    </div>
                  </button>
                  {expandedChannel === key && details.length > 0 && (
                    <div className="ml-5 mr-1 mb-2 rounded-lg bg-slate-50 border border-slate-100 p-2 space-y-2">
                      {details.map(d => (
                        <div key={d.label} className="text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">{d.label}</span>
                            <span className="font-semibold text-slate-700">{d.count.toLocaleString()}건</span>
                          </div>
                          <div className="mt-1 flex justify-end gap-1 text-[10px]">
                            <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-600">리타겟 {d.retarget}</span>
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">1차 {d.first}</span>
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-600">2차 {d.second}</span>
                          </div>
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
    </div>
  )
}
