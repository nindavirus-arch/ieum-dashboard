// src/pages/DashboardPage.tsx
import { useEffect, useMemo, useState } from 'react'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek, parseISO, subDays, subWeeks, subMonths, subYears, eachDayOfInterval } from 'date-fns'
import { Users, DollarSign, TrendingDown, CalendarDays, RefreshCw, ChevronDown } from 'lucide-react'
import { fetchLeads, fetchAdSpend, fetchKpiTargets, type KpiTarget } from '../lib/dataService'
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

function signedPercent(current: number, previous: number) {
  if (previous === 0) return current > 0 ? '+100%' : '0%'
  const value = ((current - previous) / previous) * 100
  return `${value >= 0 ? '+' : ''}${Math.round(value)}%`
}

function signedNumber(current: number, previous: number, unit = '건') {
  const diff = current - previous
  return `${diff >= 0 ? '+' : ''}${diff.toLocaleString()}${unit}`
}

function safeDate(date: string) {
  try {
    const d = parseISO(date)
    if (!Number.isNaN(d.getTime())) return d
  } catch {}
  return new Date()
}

type PeriodPreset = 'selected' | 'rolling' | 'current' | 'previous'

function rangeByMode(viewMode: ViewMode, selectedDate: string, preset: PeriodPreset, customStart: string, customEnd: string) {
  const base = safeDate(selectedDate)
  if (viewMode === 'custom') {
    const start = customStart || selectedDate
    const end = customEnd || customStart || selectedDate
    return {
      start,
      end,
      activeStart: start,
      activeEnd: end,
      label: `${start} ~ ${end} 기준`,
      cardLabel: '선택기간 DB',
    }
  }
  if (viewMode === 'daily') {
    const activeDate = preset === 'previous' ? format(subDays(new Date(), 1), 'yyyy-MM-dd') : selectedDate
    return {
      start: format(startOfMonth(safeDate(activeDate)), 'yyyy-MM-dd'),
      end: format(endOfMonth(safeDate(activeDate)), 'yyyy-MM-dd'),
      activeStart: activeDate,
      activeEnd: activeDate,
      label: `${format(safeDate(activeDate), 'yyyy년 MM월 dd일')} 기준`,
      cardLabel: preset === 'previous' ? '어제 DB' : '오늘 DB',
    }
  }
  if (viewMode === 'weekly') {
    let start = subDays(base, 6)
    let end = base
    if (preset === 'current') {
      start = startOfWeek(new Date(), { weekStartsOn: 1 })
      end = endOfWeek(new Date(), { weekStartsOn: 1 })
    } else if (preset === 'previous') {
      const prev = subWeeks(new Date(), 1)
      start = startOfWeek(prev, { weekStartsOn: 1 })
      end = endOfWeek(prev, { weekStartsOn: 1 })
    }
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
      activeStart: format(start, 'yyyy-MM-dd'),
      activeEnd: format(end, 'yyyy-MM-dd'),
      label: `${format(start, 'yyyy년 MM월 dd일')} ~ ${format(end, 'MM월 dd일')}`,
      cardLabel: preset === 'current' ? '이번주 DB' : preset === 'previous' ? '전주 DB' : '최근 7일 DB',
    }
  }
  if (viewMode === 'monthly') {
    const monthBase = preset === 'previous' ? subMonths(new Date(), 1) : preset === 'current' ? new Date() : base
    return {
      start: format(startOfYear(monthBase), 'yyyy-MM-dd'),
      end: format(endOfYear(monthBase), 'yyyy-MM-dd'),
      activeStart: format(startOfMonth(monthBase), 'yyyy-MM-dd'),
      activeEnd: format(endOfMonth(monthBase), 'yyyy-MM-dd'),
      label: `${format(monthBase, 'yyyy년 MM월')} 기준`,
      cardLabel: preset === 'previous' ? '전월 DB' : '이번달 DB',
    }
  }
  const yearBase = preset === 'previous' ? subYears(new Date(), 1) : preset === 'current' ? new Date() : base
  return {
    start: format(startOfYear(yearBase), 'yyyy-MM-dd'),
    end: format(endOfYear(yearBase), 'yyyy-MM-dd'),
    activeStart: format(startOfYear(yearBase), 'yyyy-MM-dd'),
    activeEnd: format(endOfYear(yearBase), 'yyyy-MM-dd'),
    label: `${format(yearBase, 'yyyy년')} 기준`,
    cardLabel: preset === 'previous' ? '전년도 DB' : '올해 DB',
  }
}

function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end
}

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('daily')
  const [selectedDate, setSelectedDate] = useState(today)
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('selected')
  const [customStart, setCustomStart] = useState(today)
  const [customEnd, setCustomEnd] = useState(today)
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [spends, setSpends] = useState<AdSpend[]>([])
  const [targets, setTargets] = useState<KpiTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null)
  const [openChannelGroups, setOpenChannelGroups] = useState<Record<string, boolean>>({ paid: true, organic: false, external: false, unclassified: true })

  const range = useMemo(() => rangeByMode(viewMode, selectedDate, periodPreset, customStart, customEnd), [viewMode, selectedDate, periodPreset, customStart, customEnd])

  async function load() {
    setLoading(true)
    try {
      const [l, s, t] = await Promise.all([
        fetchLeads(undefined, undefined, { includeRawAttribution: true }),
        fetchAdSpend(),
        fetchKpiTargets().catch(() => [] as KpiTarget[]),
      ])
      setLeads(l)
      setSpends(s)
      setTargets(t)
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

  const yesterday = format(subDays(safeDate(today), 1), 'yyyy-MM-dd')
  const dbCard = useMemo(() => {
    const countRange = (start: string, end: string) => validLeads.filter(l => inRange(l.date, start, end)).length
    const activeCount = countRange(range.activeStart, range.activeEnd)
    let primaryLabel = range.cardLabel
    let compareStart = range.activeStart
    let compareEnd = range.activeEnd
    let compareLabel = '이전 기간 DB'

    if (viewMode === 'daily') {
      const previousDay = format(subDays(safeDate(range.activeStart), 1), 'yyyy-MM-dd')
      compareStart = previousDay
      compareEnd = previousDay
      primaryLabel = range.activeStart === today ? '오늘 DB' : range.activeStart === yesterday ? '어제 DB' : '선택일 DB'
      compareLabel = range.activeStart === today ? '어제 DB' : '전일 DB'
    } else if (viewMode === 'weekly') {
      const activeStart = safeDate(range.activeStart)
      const activeDays = eachDayOfInterval({ start: activeStart, end: safeDate(range.activeEnd) }).length
      compareEnd = format(subDays(activeStart, 1), 'yyyy-MM-dd')
      compareStart = format(subDays(activeStart, activeDays), 'yyyy-MM-dd')
      primaryLabel = periodPreset === 'current' ? '이번주 DB' : periodPreset === 'previous' ? '저번주 DB' : periodPreset === 'selected' ? '선택 7일 DB' : '최근 7일 DB'
      compareLabel = periodPreset === 'previous' ? '전전주 DB' : '저번주 DB'
    } else if (viewMode === 'monthly') {
      const prevMonth = subMonths(safeDate(range.activeStart), 1)
      compareStart = format(startOfMonth(prevMonth), 'yyyy-MM-dd')
      compareEnd = format(endOfMonth(prevMonth), 'yyyy-MM-dd')
      primaryLabel = periodPreset === 'previous' ? '저번달 DB' : periodPreset === 'selected' ? '선택월 DB' : '이번달 DB'
      compareLabel = periodPreset === 'previous' ? '전전월 DB' : '저번달 DB'
    } else if (viewMode === 'yearly') {
      const prevYear = subYears(safeDate(range.activeStart), 1)
      compareStart = format(startOfYear(prevYear), 'yyyy-MM-dd')
      compareEnd = format(endOfYear(prevYear), 'yyyy-MM-dd')
      primaryLabel = periodPreset === 'previous' ? '전년도 DB' : periodPreset === 'selected' ? '선택년도 DB' : '이번년도 DB'
      compareLabel = periodPreset === 'previous' ? '전전년도 DB' : '전년도 DB'
    } else {
      const activeStart = safeDate(range.activeStart)
      const activeDays = eachDayOfInterval({ start: activeStart, end: safeDate(range.activeEnd) }).length
      compareEnd = format(subDays(activeStart, 1), 'yyyy-MM-dd')
      compareStart = format(subDays(activeStart, activeDays), 'yyyy-MM-dd')
      primaryLabel = '선택기간 DB'
      compareLabel = '이전 동일기간 DB'
    }

    return {
      primaryLabel,
      primaryValue: activeCount,
      compareLabel,
      compareValue: countRange(compareStart, compareEnd),
      compareStart,
      compareEnd,
    }
  }, [periodPreset, range.activeEnd, range.activeStart, range.cardLabel, validLeads, viewMode, yesterday])
  const compareLeads = validLeads.filter(l => inRange(l.date, dbCard.compareStart, dbCard.compareEnd))
  const compareSpends = spends.filter(s => inRange(s.date, dbCard.compareStart, dbCard.compareEnd))
  const compareSpend = compareSpends.filter(s => isPaidChannel(s.channel)).reduce((a, b) => a + b.amount, 0)
  const comparePaidValidLeads = compareLeads.filter(l => isPaidChannel(l.channel) && (l.dbTier === 'first' || l.dbTier === 'second'))
  const compareCpl = comparePaidValidLeads.length > 0 ? Math.round(compareSpend / comparePaidValidLeads.length) : 0
  const periodDays = eachDayOfInterval({ start: safeDate(range.activeStart), end: safeDate(range.activeEnd) }).length
  const activeTarget = targets.find(target => target.month === range.activeEnd.slice(0, 7))
  const minDailyTarget = activeTarget?.minDaily || 40
  const stretchDailyTarget = Math.max(activeTarget?.stretchDaily || 60, minDailyTarget)
  const periodMinTarget = minDailyTarget * periodDays
  const periodStretchTarget = stretchDailyTarget * periodDays
  const targetRate = periodMinTarget > 0 ? Math.round((totalDB / periodMinTarget) * 100) : 0
  const targetStatus = totalDB >= periodStretchTarget ? '상향 목표 이상' : totalDB >= periodMinTarget ? '기본 목표 달성' : `기본 목표 ${Math.max(periodMinTarget - totalDB, 0).toLocaleString()}건 부족`
  const unclassifiedCount = channelStats.find(row => row.key === 'unclassified')?.db || 0
  const cplDiff = avgCPL - compareCpl
  const insightItems = [
    {
      tone: totalDB >= periodMinTarget ? 'good' : 'warn',
      text: `목표 진행: ${targetStatus} (${targetRate}%)`,
    },
    {
      tone: cplDiff <= 0 ? 'good' : 'warn',
      text: compareCpl > 0
        ? `CPL: 이전 기간 대비 ${cplDiff <= 0 ? Math.abs(cplDiff).toLocaleString() + '원 개선' : cplDiff.toLocaleString() + '원 상승'}`
        : `CPL: 이전 기간 비교 데이터 없음`,
    },
    ...(unclassifiedCount > 0 ? [{ tone: 'warn' as const, text: `미분류 ${unclassifiedCount.toLocaleString()}건: 매체 매핑 확인 필요` }] : []),
  ].slice(0, 3)

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
    {
      label: dbCard.primaryLabel,
      value: dbCard.primaryValue,
      unit: '건',
      sub: `${dbCard.compareLabel} 대비 ${signedNumber(dbCard.primaryValue, dbCard.compareValue)} · ${signedPercent(dbCard.primaryValue, dbCard.compareValue)}`,
      title: '연락처 중복 제거 후 선택기간의 최종 DB 수량입니다.',
      icon: CalendarDays,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: dbCard.compareLabel,
      value: dbCard.compareValue,
      unit: '건',
      sub: `${dbCard.compareStart} ~ ${dbCard.compareEnd}`,
      title: '선택기간과 비교하는 직전 동일 기간의 DB 수량입니다.',
      icon: Users,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: '누적 DB',
      value: validLeads.length,
      unit: '건',
      sub: '전체 기간 연락처 중복 제거',
      title: '삭제/중복/테스트 상태를 제외한 전체 누적 최종 DB입니다.',
      icon: Users,
      color: 'text-teal-600',
      bg: 'bg-teal-50',
    },
    {
      label: viewMode === 'daily' ? '선택일 광고비' : '선택기간 광고비',
      value: fmtKRW(periodSpend),
      unit: '원',
      sub: `이전 기간 대비 ${signedNumber(Math.round(periodSpend / 10_000), Math.round(compareSpend / 10_000), '만')}`,
      title: '선택기간에 등록된 온라인 광고 매체 광고비 합계입니다.',
      icon: DollarSign,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: '유효 DB CPL',
      value: fmtKRW(avgCPL),
      unit: '원',
      sub: compareCpl > 0 ? `이전 CPL ${fmtKRW(compareCpl)}원` : '이전 CPL 비교 없음',
      title: '온라인 광고비 ÷ 온라인 광고 유효 DB(최종 1차+2차)로 계산합니다.',
      icon: TrendingDown,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      label: '1→2 전환율',
      value: conversionRate,
      unit: '%',
      sub: `견적 후 상담 ${convertedSecond}/${estimatePool || 0}`,
      title: '견적만 확인한 고객 중 상담신청까지 이어진 비율입니다. 광고에서 바로 상담한 건은 별도 단계로 봅니다.',
      icon: TrendingDown,
      color: 'text-cyan-600',
      bg: 'bg-cyan-50',
    },
  ]

  const inputValue = viewMode === 'daily'
    ? selectedDate
    : viewMode === 'weekly'
      ? selectedDate
    : viewMode === 'monthly'
      ? selectedDate.slice(0, 7)
      : viewMode === 'yearly'
        ? selectedDate.slice(0, 4)
        : selectedDate

  function handleDateChange(value: string) {
    if (!value) return
    setPeriodPreset('selected')
    if (viewMode === 'daily' || viewMode === 'weekly') setSelectedDate(value)
    else if (viewMode === 'monthly') setSelectedDate(`${value}-01`)
    else if (viewMode === 'yearly') setSelectedDate(`${value}-01-01`)
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
            {(['daily','weekly','monthly','yearly','custom'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => { setViewMode(m); setPeriodPreset(m === 'daily' ? 'selected' : 'rolling') }} className={clsx('tab-btn shrink-0', viewMode===m && 'active')}>
                {m === 'daily' ? '일별' : m === 'weekly' ? '주별' : m === 'monthly' ? '월별' : m === 'yearly' ? '연별' : '기간별'}
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
          {viewMode === 'custom' && (
            <>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9 min-w-0 flex-1 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 sm:flex-none" />
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9 min-w-0 flex-1 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 sm:flex-none" />
            </>
          )}

          {viewMode === 'daily' && (
            <div className="flex rounded-lg border border-slate-200 bg-white p-1">
              <button onClick={() => { setSelectedDate(today); setPeriodPreset('selected') }} className="tab-btn">오늘</button>
              <button onClick={() => { setSelectedDate(format(subDays(new Date(), 1), 'yyyy-MM-dd')); setPeriodPreset('previous') }} className="tab-btn">어제</button>
            </div>
          )}
          {viewMode === 'weekly' && (
            <div className="flex rounded-lg border border-slate-200 bg-white p-1">
              <button onClick={() => { setSelectedDate(today); setPeriodPreset('rolling') }} className={clsx('tab-btn', periodPreset === 'rolling' && 'active')}>최근 7일</button>
              <button onClick={() => { setSelectedDate(today); setPeriodPreset('current') }} className={clsx('tab-btn', periodPreset === 'current' && 'active')}>이번주</button>
              <button onClick={() => { setSelectedDate(format(subWeeks(new Date(), 1), 'yyyy-MM-dd')); setPeriodPreset('previous') }} className={clsx('tab-btn', periodPreset === 'previous' && 'active')}>전주</button>
            </div>
          )}
          {viewMode === 'monthly' && (
            <div className="flex rounded-lg border border-slate-200 bg-white p-1">
              <button onClick={() => { setSelectedDate(today); setPeriodPreset('current') }} className={clsx('tab-btn', periodPreset === 'current' && 'active')}>이번달</button>
              <button onClick={() => { setSelectedDate(format(subMonths(new Date(), 1), 'yyyy-MM-dd')); setPeriodPreset('previous') }} className={clsx('tab-btn', periodPreset === 'previous' && 'active')}>전월</button>
            </div>
          )}
          {viewMode === 'yearly' && (
            <div className="flex rounded-lg border border-slate-200 bg-white p-1">
              <button onClick={() => { setSelectedDate(today); setPeriodPreset('current') }} className={clsx('tab-btn', periodPreset === 'current' && 'active')}>올해</button>
              <button onClick={() => { setSelectedDate(format(subYears(new Date(), 1), 'yyyy-MM-dd')); setPeriodPreset('previous') }} className={clsx('tab-btn', periodPreset === 'previous' && 'active')}>전년도</button>
            </div>
          )}

          <button onClick={() => { setSelectedDate(today); setViewMode('daily'); setPeriodPreset('selected') }} className="btn-secondary shrink-0">오늘</button>
          <DataUpdatedAt />
          <button onClick={load} className="btn-secondary shrink-0">
            <RefreshCw size={13} className={clsx(loading && 'animate-spin')} /> 새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {STAT_CARDS.map(({ label, value, unit, sub, title, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card" title={title}>
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
            <p className="mt-2 min-h-4 truncate text-[11px] text-slate-400">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">선택기간 목표 진행률</p>
              <p className="mt-1 text-xs text-slate-400">
                기본 {periodMinTarget.toLocaleString()}건 · 상향 {periodStretchTarget.toLocaleString()}건 · 일 목표 {minDailyTarget}~{stretchDailyTarget}건
              </p>
            </div>
            <span className={clsx(
              'w-fit rounded-md px-2.5 py-1 text-xs font-semibold',
              totalDB >= periodStretchTarget ? 'bg-blue-50 text-blue-700' : totalDB >= periodMinTarget ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            )}>{targetStatus}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={clsx('h-full rounded-full', totalDB >= periodStretchTarget ? 'bg-blue-500' : totalDB >= periodMinTarget ? 'bg-emerald-500' : 'bg-red-400')} style={{ width: `${Math.min(targetRate, 100)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>0</span><span>기본 목표 100%</span></div>
        </div>
        <div className="card p-4">
          <p className="text-sm font-semibold text-slate-700">오늘 확인할 것</p>
          <div className="mt-3 space-y-2">
            {insightItems.map((item, index) => (
              <div key={`${item.text}_${index}`} className={clsx(
                'rounded-lg border px-3 py-2 text-xs leading-5',
                item.tone === 'good' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-red-100 bg-red-50 text-red-700'
              )}>{item.text}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-5 space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-4">
              {viewMode === 'daily' ? '일자별 DB 추이' : viewMode === 'weekly' ? '주별 DB 추이' : viewMode === 'monthly' ? '월별 DB 추이' : viewMode === 'yearly' ? '연도별 DB 추이' : '기간별 DB 추이'}
            </p>
            <TimeSeriesChart leads={validLeads} spends={spends} viewMode={viewMode} selectedDate={selectedDate} startDate={range.activeStart} endDate={range.activeEnd} />
            {viewMode === 'daily' && (
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">일별 최종 DB 합계</p>
                  <span className="text-[11px] text-slate-400">연락처 중복 제거 기준</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 md:grid-cols-10 xl:grid-cols-16">
                  {dailyTotalSummary.map(item => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setSelectedDate(item.key)
                        setViewMode('daily')
                      }}
                      title={`${item.key} 유입채널 현황 보기`}
                      className={clsx(
                        'rounded-lg border px-2 py-1.5 text-center transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100',
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
                    </button>
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
            { key: 'paid', title: '온라인 광고', rows: channelStats.filter(c => c.group === 'paid') },
            { key: 'organic', title: '온라인 직접·자연유입', rows: channelStats.filter(c => c.group === 'organic') },
            { key: 'external', title: '외부·제휴유입', rows: channelStats.filter(c => c.group === 'external') },
            { key: 'unclassified', title: '미분류', rows: channelStats.filter(c => c.group === 'unclassified') },
          ].map(group => {
            const groupTotal = group.rows.reduce((sum, row) => sum + row.db, 0)
            const groupOpen = openChannelGroups[group.key] ?? false
            return (
            <div key={group.key} className="space-y-2">
              <button
                type="button"
                onClick={() => setOpenChannelGroups(current => ({ ...current, [group.key]: !groupOpen }))}
                className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-[11px] font-semibold text-slate-400 hover:bg-slate-50"
              >
                <span>{group.title}</span>
                <span className={clsx('flex items-center gap-1 rounded-md px-2 py-0.5', group.key === 'unclassified' && groupTotal > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600')}>
                  합계 {groupTotal.toLocaleString()}건
                  <ChevronDown size={12} className={clsx('transition-transform', groupOpen && 'rotate-180')} />
                </span>
              </button>
              {groupOpen && group.rows.map(({ key, label, db, spend, color, details }) => (
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
          )})}
        </div>
      </div>
    </div>
  )
}
