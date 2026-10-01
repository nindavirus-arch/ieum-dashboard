import { useEffect, useMemo, useState } from 'react'
import { eachDayOfInterval, endOfMonth, endOfWeek, format, getDay, getDaysInMonth, parseISO, startOfWeek, subMonths } from 'date-fns'
import {
  AlertTriangle, CalendarDays, CheckCircle2, DollarSign, FileDown, FileSpreadsheet, Gauge,
  RefreshCw, Settings, Target, TrendingUp, X,
} from 'lucide-react'
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import clsx from 'clsx'
import {
  fetchAdSpend, fetchKpiTargets, fetchLeads, invalidateDataCache, saveKpiTarget,
  type KpiTarget,
} from '../lib/dataService'
import { baseStage, buildLeadJourneys, isPaidChannel, trafficGroup } from '../lib/leadMetrics'
import type { AdSpend, LeadRecord } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { useAutoDataRefresh } from '../lib/appRefresh'
import DataUpdatedAt from '../components/DataUpdatedAt'
import { normalizeDate } from '../lib/excelParser'
import OnlineKpiReport from '../components/kpi/OnlineKpiReport'
import { DEFAULT_KPI_MIN_DAILY, DEFAULT_KPI_STRETCH_DAILY } from '../lib/kpiDefaults'

const today = format(new Date(), 'yyyy-MM-dd')
const currentMonth = today.slice(0, 7)
const initialMonth = currentMonth < '2026-07' ? '2026-07' : currentMonth

const CHANNEL_LABELS: Record<string, string> = {
  naver: '네이버',
  google: '구글',
  meta: '메타',
  youtube: '유튜브',
  viral: '바이럴',
  danggeun: '당근',
  kakao_search: '카카오 검색광고',
  kakao_moment: '카카오모먼트',
  chatgpt: 'Chat-GPT',
  direct: '온라인 직접유입',
  etc: '온라인 기타',
}

const CHANNEL_ORDER = ['naver', 'google', 'meta', 'youtube', 'viral', 'danggeun', 'kakao_search', 'kakao_moment', 'chatgpt', 'direct', 'etc']

type Acquisition = {
  date: string
  channel: string
  subChannel: string
  stage: 'retarget' | 'first' | 'second'
}

type ConversionEvent = {
  date: string
  channel: string
  subChannel: string
}

function recordDate(lead: LeadRecord) {
  const fallback = /^\d{4}-\d{2}-\d{2}$/.test(lead.date)
    ? new Date(`${lead.date}T00:00:00`)
    : new Date(lead.uploadedAt)
  return normalizeDate(lead.registeredAt || lead.date || lead.uploadedAt, fallback)
}

function defaultDetail(channel: string) {
  if (channel === 'naver') return '네이버 SA'
  if (channel === 'google') return '구글 검색광고'
  if (channel === 'meta') return '메타'
  if (channel === 'youtube') return '유튜브'
  if (channel === 'viral') return '바이럴'
  if (channel === 'danggeun') return '당근'
  if (channel === 'kakao_search') return '카카오 검색광고'
  if (channel === 'kakao_moment') return '카카오모먼트'
  if (channel === 'chatgpt') return 'Chat-GPT'
  if (channel === 'direct') return '홈페이지 직접유입'
  if (channel === 'etc') return '온라인 기타'
  return '기타'
}

function detailLabel(lead: Pick<LeadRecord, 'channel' | 'subChannel'>) {
  return String(lead.subChannel || '').trim() || defaultDetail(lead.channel)
}

function kpiDetailGroup(channel: string, subChannel: string) {
  const detail = String(subChannel || '').trim() || defaultDetail(channel)
  const normalized = detail.toLowerCase().replace(/[\s_\-\/()\[\].]/g, '')
  if (channel === 'naver') {
    if (normalized.includes('gfa')) return { channel: 'naver', subChannel: '네이버 GFA' }
    if (normalized.includes('브랜드검색') || normalized.includes('brand')) return { channel: 'naver', subChannel: '네이버 브랜드검색' }
    if (normalized.includes('sa') || normalized.includes('파워링크')) return { channel: 'naver', subChannel: '네이버 SA' }
  }
  const isGoogleDisplayOrYoutube = channel === 'google' && (
    normalized.includes('디스커버리')
    || normalized.includes('디맨드')
    || normalized.includes('demand')
    || normalized.includes('discovery')
    || normalized.includes('gdn')
    || normalized.includes('유튜브')
    || normalized.includes('youtube')
  )
  if (isGoogleDisplayOrYoutube) {
    return { channel: 'google', subChannel: '구글 디스커버리/GDN·유튜브' }
  }
  return { channel, subChannel: detail }
}

function isOnlineKpiLead(lead: LeadRecord) {
  const group = trafficGroup(lead)
  return group === 'paid' || group === 'organic'
}

function buildOnlineKpiData(leads: LeadRecord[], includeRetarget: boolean) {
  const acquisitions: Acquisition[] = []
  const conversions: ConversionEvent[] = []

  buildLeadJourneys(leads).forEach(journey => {
    // Dashboard and KPI must count the same final, deduplicated lead on the
    // date its current stage was received. An earlier first-stage date would
    // otherwise make today's KPI smaller when that lead converts to second.
    const acquired = journey.lead
    const acquisitionStage = baseStage(acquired.dbTier)
    if (!isOnlineKpiLead(acquired) || (!includeRetarget && acquisitionStage === 'retarget')) return

    acquisitions.push({
      date: acquired.date,
      channel: acquired.channel,
      subChannel: detailLabel(acquired),
      stage: acquisitionStage,
    })

    const onlineValid = journey.records
      .filter(record => isOnlineKpiLead(record) && baseStage(record.dbTier) !== 'retarget')
      .sort((a, b) => recordDate(a).localeCompare(recordDate(b)))

    const firstRecord = onlineValid.find(record => baseStage(record.dbTier) === 'first')
    if (!firstRecord) return
    const firstDate = recordDate(firstRecord)
    const secondRecord = journey.records
      .filter(record => baseStage(record.dbTier) === 'second' && recordDate(record) >= firstDate)
      .sort((a, b) => recordDate(a).localeCompare(recordDate(b)))[0]
    if (!secondRecord) return
    conversions.push({
      date: recordDate(secondRecord),
      channel: firstRecord.channel,
      subChannel: detailLabel(firstRecord),
    })
  })

  return { acquisitions, conversions }
}

function fmtMoney(value: number) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억원`
  if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString()}만원`
  return `${Math.round(value).toLocaleString()}원`
}

function fmtCpl(value: number) {
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}만원`
  return `${Math.round(value).toLocaleString()}원`
}

function percent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${value.toFixed(1)}%`
}

function StatCard({ label, value, suffix, sub, icon: Icon, tone = 'blue' }: {
  label: string
  value: string | number
  suffix?: string
  sub: string
  icon: typeof Target
  tone?: 'blue' | 'green' | 'violet' | 'orange' | 'cyan' | 'slate'
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
    orange: 'bg-orange-50 text-orange-600',
    cyan: 'bg-cyan-50 text-cyan-600',
    slate: 'bg-slate-100 text-slate-600',
  }
  return (
    <div className="card min-w-0 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1.5 truncate text-xl font-bold text-slate-800">{value}<span className="ml-1 text-xs font-medium text-slate-400">{suffix}</span></p>
        </div>
        <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tones[tone])}><Icon size={16} /></span>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-slate-400">{sub}</p>
    </div>
  )
}

export default function OnlineKpiPage() {
  const { user } = useAuth()
  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [spends, setSpends] = useState<AdSpend[]>([])
  const [targets, setTargets] = useState<KpiTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [excelExportOpen, setExcelExportOpen] = useState(false)
  const [excelStartMonth, setExcelStartMonth] = useState(selectedMonth)
  const [excelEndMonth, setExcelEndMonth] = useState(selectedMonth)
  const [draftMin, setDraftMin] = useState(DEFAULT_KPI_MIN_DAILY)
  const [draftStretch, setDraftStretch] = useState(DEFAULT_KPI_STRETCH_DAILY)
  const [draftTargetCpl, setDraftTargetCpl] = useState(30_000)
  const [saving, setSaving] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [includeRetarget, setIncludeRetarget] = useState(false)

  async function load(force = false) {
    setLoading(true)
    setNotice('')
    try {
      if (force) invalidateDataCache()
      const [leadResult, spendResult, targetResult] = await Promise.allSettled([
        fetchLeads(),
        fetchAdSpend(),
        fetchKpiTargets()
          .then(value => ({ value, error: null as unknown }))
          .catch(error => ({ value: null, error })),
      ])
      if (leadResult.status === 'fulfilled') setLeads(leadResult.value)
      if (spendResult.status === 'fulfilled') setSpends(spendResult.value)
      if (targetResult.status === 'fulfilled') {
        if (targetResult.value.value) setTargets(targetResult.value.value)
        else if (targetResult.value.error) setNotice(targetResult.value.error instanceof Error ? targetResult.value.error.message : 'KPI 목표를 불러오지 못했습니다.')
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'KPI 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useAutoDataRefresh(load)

  const configuredTarget = targets.find(target => target.month === selectedMonth)
  const minDaily = configuredTarget?.minDaily || DEFAULT_KPI_MIN_DAILY
  const stretchDaily = Math.max(configuredTarget?.stretchDaily || DEFAULT_KPI_STRETCH_DAILY, minDaily)
  const targetCpl = configuredTarget?.targetCpl || 0
  const monthDate = parseISO(`${selectedMonth}-01`)
  const daysInMonth = getDaysInMonth(monthDate)
  const monthStart = `${selectedMonth}-01`
  const monthEnd = format(endOfMonth(monthDate), 'yyyy-MM-dd')
  const elapsedDays = selectedMonth < currentMonth
    ? daysInMonth
    : selectedMonth > currentMonth
      ? 0
      : Math.min(Number(today.slice(8, 10)), daysInMonth)
  const remainingDays = Math.max(daysInMonth - elapsedDays, 0)

  const { acquisitions, conversions } = useMemo(() => buildOnlineKpiData(leads, includeRetarget), [includeRetarget, leads])
  const monthAcquisitions = acquisitions.filter(row => row.date >= monthStart && row.date <= monthEnd)
  const monthConversions = conversions.filter(row => row.date >= monthStart && row.date <= monthEnd)
  const monthSpends = spends.filter(row => isPaidChannel(row.channel) && row.date >= monthStart && row.date <= monthEnd)
  const totalDb = monthAcquisitions.length
  const attributedDb = monthAcquisitions.filter(row => isPaidChannel(row.channel)).length
  const unattributedOnlineDb = totalDb - attributedDb
  const todayRows = selectedMonth === currentMonth ? acquisitions.filter(row => row.date === today) : []
  const todayPaidDb = todayRows.filter(row => isPaidChannel(row.channel)).length
  const todayOrganicDb = todayRows.length - todayPaidDb
  const todayDb = todayRows.length
  const totalSpend = monthSpends.reduce((sum, row) => sum + row.amount, 0)
  const cpl = attributedDb > 0 ? Math.round(totalSpend / attributedDb) : 0
  const minMonthly = minDaily * daysInMonth
  const stretchMonthly = stretchDaily * daysInMonth
  const minExpected = minDaily * elapsedDays
  const stretchExpected = stretchDaily * elapsedDays
  const dailyAverage = elapsedDays > 0 ? totalDb / elapsedDays : 0
  const forecast = elapsedDays > 0 ? Math.round(dailyAverage * daysInMonth) : 0
  const neededDaily = remainingDays > 0 ? Math.max(0, Math.ceil((minMonthly - totalDb) / remainingDays)) : 0

  const dailyData = useMemo(() => {
    let cumulative = 0
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1
      const date = `${selectedMonth}-${String(day).padStart(2, '0')}`
      const rows = monthAcquisitions.filter(row => row.date === date)
      const spend = monthSpends.filter(row => row.date === date).reduce((sum, row) => sum + row.amount, 0)
      const retarget = rows.filter(row => row.stage === 'retarget').length
      const first = rows.filter(row => row.stage === 'first').length
      const directSecond = rows.filter(row => row.stage === 'second').length
      cumulative += rows.length
      return {
        day: `${day}일`,
        dayNumber: day,
        date,
        retarget,
        first,
        directSecond,
        db: rows.length,
        spend,
        cumulative,
        minCumulative: minDaily * day,
        stretchCumulative: stretchDaily * day,
      }
    })
  }, [daysInMonth, minDaily, monthAcquisitions, monthSpends, selectedMonth, stretchDaily])

  const detailStats = useMemo(() => {
    const groupedAcquisitions = monthAcquisitions.map(row => ({ ...row, ...kpiDetailGroup(row.channel, row.subChannel) }))
    const groupedConversions = monthConversions.map(row => ({ ...row, ...kpiDetailGroup(row.channel, row.subChannel) }))
    const groupedSpends = monthSpends.map(row => ({
      ...row,
      ...kpiDetailGroup(row.channel, String(row.subChannel || '').trim() || defaultDetail(row.channel)),
    }))
    const keys = new Set<string>()
    groupedAcquisitions.forEach(row => keys.add(`${row.channel}__${row.subChannel}`))
    groupedSpends.forEach(row => keys.add(`${row.channel}__${row.subChannel}`))
    return Array.from(keys).map(key => {
      const [channel, subChannel] = key.split('__')
      const dbRows = groupedAcquisitions.filter(row => row.channel === channel && row.subChannel === subChannel)
      const spend = groupedSpends
        .filter(row => row.channel === channel && row.subChannel === subChannel)
        .reduce((sum, row) => sum + row.amount, 0)
      const converted = groupedConversions.filter(row => row.channel === channel && row.subChannel === subChannel).length
      const attributed = isPaidChannel(channel)
      return {
        key,
        channel,
        channelLabel: CHANNEL_LABELS[channel] || channel,
        subChannel,
        retarget: dbRows.filter(row => row.stage === 'retarget').length,
        first: dbRows.filter(row => row.stage === 'first').length,
        directSecond: dbRows.filter(row => row.stage === 'second').length,
        db: dbRows.length,
        converted,
        attributed,
        spend,
        cpl: attributed && dbRows.length > 0 ? Math.round(spend / dbRows.length) : 0,
        share: totalDb > 0 ? (dbRows.length / totalDb) * 100 : 0,
      }
    }).sort((a, b) => {
      const channelDiff = CHANNEL_ORDER.indexOf(a.channel) - CHANNEL_ORDER.indexOf(b.channel)
      return channelDiff || b.db - a.db || b.spend - a.spend
    })
  }, [monthAcquisitions, monthConversions, monthSpends, totalDb])

  const alerts = useMemo(() => {
    if (elapsedDays === 0) return [{ tone: 'ready', text: `${selectedMonth.slice(5, 7)}월 목표가 설정되었습니다. 집계 시작 전입니다.` }]
    const elapsedRows = dailyData.slice(0, elapsedDays)
    const result: { tone: 'warn' | 'good' | 'ready'; text: string }[] = []
    const last = elapsedRows[elapsedRows.length - 1]
    const lastTwo = elapsedRows.slice(-2)
    if (selectedMonth === currentMonth && last && last.db < minDaily) {
      result.push({ tone: 'warn', text: `오늘 DB가 기본 목표보다 ${minDaily - last.db}건 부족합니다.` })
    }
    if (lastTwo.length === 2 && lastTwo.every(row => row.db < minDaily)) {
      result.push({ tone: 'warn', text: '최근 2일 연속 기본 목표에 미달했습니다.' })
    }
    if (targetCpl > 0 && attributedDb > 0) {
      result.push(cpl <= targetCpl
        ? { tone: 'good', text: `CPL ${fmtCpl(cpl)}로 목표 ${fmtCpl(targetCpl)} 이내입니다.` }
        : { tone: 'warn', text: `CPL이 목표보다 ${(cpl - targetCpl).toLocaleString()}원 높습니다.` })
    }
    detailStats.filter(row => isPaidChannel(row.channel) && row.spend > 0 && row.db === 0).slice(0, 2).forEach(row => {
      result.push({ tone: 'warn', text: `${row.subChannel}: 광고비가 집행됐지만 유효DB가 없습니다.` })
    })
    if (totalDb >= minExpected && elapsedDays > 0) {
      result.push({ tone: 'good', text: `누적 기본 목표보다 ${totalDb - minExpected}건 앞서 있습니다.` })
    } else if (elapsedDays > 0) {
      result.push({ tone: 'warn', text: `누적 기본 목표보다 ${minExpected - totalDb}건 부족합니다.` })
    }
    return result.slice(0, 4)
  }, [attributedDb, cpl, dailyData, detailStats, elapsedDays, minDaily, minExpected, selectedMonth, targetCpl, totalDb])

  function openSettings() {
    setDraftMin(minDaily)
    setDraftStretch(stretchDaily)
    setDraftTargetCpl(targetCpl || 30_000)
    setSettingsOpen(true)
  }

  async function saveSettings() {
    if (draftMin <= 0 || draftStretch < draftMin || draftTargetCpl <= 0) {
      setNotice('DB 목표와 CPL 목표를 확인해주세요. 상향 목표는 기본 목표보다 크거나 같아야 합니다.')
      return
    }
    setSaving(true)
    try {
      await saveKpiTarget({
        month: selectedMonth,
        minDaily: Math.round(draftMin),
        stretchDaily: Math.round(draftStretch),
        targetCpl: Math.round(draftTargetCpl),
        updatedBy: user?.name || user?.id || '',
      })
      setTargets(current => [
        ...current.filter(target => target.month !== selectedMonth),
        { month: selectedMonth, minDaily: Math.round(draftMin), stretchDaily: Math.round(draftStretch), targetCpl: Math.round(draftTargetCpl), updatedBy: user?.name || user?.id || '' },
      ])
      setSettingsOpen(false)
      setNotice('KPI 목표가 저장되었습니다.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'KPI 목표 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function openExcelExport() {
    setExcelStartMonth(selectedMonth)
    setExcelEndMonth(selectedMonth)
    setExcelExportOpen(true)
  }

  function setExcelQuickRange(monthCount: number) {
    const end = parseISO(`${excelEndMonth}-01`)
    setExcelStartMonth(format(subMonths(end, monthCount - 1), 'yyyy-MM'))
  }

  async function downloadExcel() {
    if (!/^\d{4}-\d{2}$/.test(excelStartMonth) || !/^\d{4}-\d{2}$/.test(excelEndMonth) || excelStartMonth > excelEndMonth) {
      setNotice('엑셀 집계 시작월과 종료월을 확인해주세요.')
      return
    }
    setExportingExcel(true)
    setNotice('')
    try {
      const XLSX = await import('xlsx')
      const generatedAt = format(new Date(), 'yyyy-MM-dd HH:mm:ss')
      const exportStart = `${excelStartMonth}-01`
      const exportEnd = format(endOfMonth(parseISO(`${excelEndMonth}-01`)), 'yyyy-MM-dd')
      const rangeAcquisitions = acquisitions.filter(row => row.date >= exportStart && row.date <= exportEnd)
      const rangeConversions = conversions.filter(row => row.date >= exportStart && row.date <= exportEnd)
      const rangeSpends = spends.filter(row => isPaidChannel(row.channel) && row.date >= exportStart && row.date <= exportEnd)
      const targetForMonth = (month: string) => {
        const configured = targets.find(row => row.month === month)
        const base = configured?.minDaily || DEFAULT_KPI_MIN_DAILY
        return {
          minDaily: base,
          stretchDaily: Math.max(configured?.stretchDaily || DEFAULT_KPI_STRETCH_DAILY, base),
          targetCpl: configured?.targetCpl || 0,
        }
      }
      const days = eachDayOfInterval({ start: parseISO(exportStart), end: parseISO(exportEnd) })
      let cumulative = 0
      let cumulativeMin = 0
      let cumulativeStretch = 0
      const dailyMetrics = days.map(day => {
        const date = format(day, 'yyyy-MM-dd')
        const dateAcquisitions = rangeAcquisitions.filter(row => row.date === date)
        const dateSpends = rangeSpends.filter(row => row.date === date)
        const monthTarget = targetForMonth(date.slice(0, 7))
        const paidDb = dateAcquisitions.filter(row => isPaidChannel(row.channel)).length
        const spend = dateSpends.reduce((sum, row) => sum + row.amount, 0)
        const db = dateAcquisitions.length
        const future = date > today
        cumulative += db
        cumulativeMin += monthTarget.minDaily
        cumulativeStretch += monthTarget.stretchDaily
        return {
          date,
          retarget: dateAcquisitions.filter(row => row.stage === 'retarget').length,
          first: dateAcquisitions.filter(row => row.stage === 'first').length,
          directSecond: dateAcquisitions.filter(row => row.stage === 'second').length,
          db,
          paidDb,
          organicDb: db - paidDb,
          conversions: rangeConversions.filter(row => row.date === date).length,
          spend,
          cpl: paidDb > 0 ? Math.round(spend / paidDb) : null,
          ...monthTarget,
          cumulative,
          cumulativeMin,
          cumulativeStretch,
          future,
          status: future ? '집계 전' : db >= monthTarget.stretchDaily ? '상향 목표 달성' : db >= monthTarget.minDaily ? '기본 목표 달성' : '기본 목표 미달',
          cplStatus: future ? '집계 전' : monthTarget.targetCpl <= 0 ? '목표 미설정' : paidDb <= 0 ? '집계 전' : Math.round(spend / paidDb) <= monthTarget.targetCpl ? '달성' : '미달',
        }
      })
      const dailyRows = dailyMetrics.map(row => ({
        '날짜': row.date,
        '요일': ['일', '월', '화', '수', '목', '금', '토'][getDay(parseISO(row.date))],
        'DB 목표 상태': row.status,
        'CPL 목표 상태': row.cplStatus,
        '리타겟': row.retarget,
        '1차 유효DB': row.first,
        '바로 상담 2차DB': row.directSecond,
        '일일 DB 합계': row.db,
        '매체확인 DB': row.paidDb,
        '온라인 직접·자연 DB': row.organicDb,
        '상담 전환': row.conversions,
        '일 광고비': row.spend,
        '일 CPL': row.cpl,
        '일 기본 목표': row.minDaily,
        '일 상향 목표': row.stretchDaily,
        '목표 CPL': row.targetCpl || null,
        '실제 누적 DB': row.cumulative,
        '누적 기본 목표': row.cumulativeMin,
        '누적 상향 목표': row.cumulativeStretch,
      }))

      const aggregateRows = (rows: typeof dailyMetrics) => ({
        retarget: rows.reduce((sum, row) => sum + row.retarget, 0),
        first: rows.reduce((sum, row) => sum + row.first, 0),
        directSecond: rows.reduce((sum, row) => sum + row.directSecond, 0),
        db: rows.reduce((sum, row) => sum + row.db, 0),
        paidDb: rows.reduce((sum, row) => sum + row.paidDb, 0),
        organicDb: rows.reduce((sum, row) => sum + row.organicDb, 0),
        conversions: rows.reduce((sum, row) => sum + row.conversions, 0),
        spend: rows.reduce((sum, row) => sum + row.spend, 0),
        fullMinTarget: rows.reduce((sum, row) => sum + row.minDaily, 0),
        fullStretchTarget: rows.reduce((sum, row) => sum + row.stretchDaily, 0),
        elapsedMinTarget: rows.filter(row => !row.future).reduce((sum, row) => sum + row.minDaily, 0),
        elapsedDays: rows.filter(row => !row.future).length,
      })
      const periodStatus = (actual: number, minTarget: number, stretchTarget: number, elapsedCount: number) => elapsedCount === 0
        ? '집계 전'
        : actual >= stretchTarget ? '상향 목표 달성' : actual >= minTarget ? '기본 목표 달성' : '기본 목표 미달'
      const cplTargetSummary = (rows: typeof dailyMetrics) => {
        const values = Array.from(new Set(rows.map(row => row.targetCpl).filter(Boolean)))
        return { value: values.length === 1 ? values[0] : null, label: values.length === 0 ? '목표 미설정' : values.length === 1 ? `${values[0].toLocaleString()}원` : '월별 상이' }
      }

      const weekGroups = new Map<string, typeof dailyMetrics>()
      dailyMetrics.forEach(row => {
        const key = format(startOfWeek(parseISO(row.date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
        weekGroups.set(key, [...(weekGroups.get(key) || []), row])
      })
      const weeklyRows = Array.from(weekGroups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([weekKey, rows], index) => {
        const totals = aggregateRows(rows)
        const target = cplTargetSummary(rows)
        const actualCpl = totals.paidDb > 0 ? Math.round(totals.spend / totals.paidDb) : null
        const weekEnd = format(endOfWeek(parseISO(weekKey), { weekStartsOn: 1 }), 'yyyy-MM-dd')
        const elapsedStretch = rows.filter(row => !row.future).reduce((sum, row) => sum + row.stretchDaily, 0)
        return {
          '주차': `${index + 1}주차`,
          '주 시작일': rows[0].date,
          '주 종료일': rows[rows.length - 1].date < weekEnd ? rows[rows.length - 1].date : weekEnd,
          '포함 일수': rows.length,
          '경과 일수': totals.elapsedDays,
          '리타겟': totals.retarget,
          '1차 유효DB': totals.first,
          '바로 상담 2차DB': totals.directSecond,
          '주간 DB 합계': totals.db,
          '매체확인 DB': totals.paidDb,
          '온라인 직접·자연 DB': totals.organicDb,
          '상담 전환': totals.conversions,
          '주 광고비': totals.spend,
          '주 CPL': actualCpl,
          '경과 기본 목표': totals.elapsedMinTarget,
          '전체 기본 목표': totals.fullMinTarget,
          '목표 CPL': target.value,
          '목표 CPL 기준': target.label,
          'DB 목표 상태': periodStatus(totals.db, totals.elapsedMinTarget, elapsedStretch, totals.elapsedDays),
          'CPL 목표 상태': target.value === null ? target.label : actualCpl === null ? '집계 전' : actualCpl <= target.value ? '달성' : '미달',
        }
      })

      const monthGroups = new Map<string, typeof dailyMetrics>()
      dailyMetrics.forEach(row => monthGroups.set(row.date.slice(0, 7), [...(monthGroups.get(row.date.slice(0, 7)) || []), row]))
      const monthlyRows = Array.from(monthGroups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, rows]) => {
        const totals = aggregateRows(rows)
        const monthTarget = targetForMonth(month)
        const actualCpl = totals.paidDb > 0 ? Math.round(totals.spend / totals.paidDb) : null
        const elapsedStretch = rows.filter(row => !row.future).reduce((sum, row) => sum + row.stretchDaily, 0)
        const average = totals.elapsedDays > 0 ? totals.db / totals.elapsedDays : 0
        return {
          '기준월': month,
          '경과 일수': totals.elapsedDays,
          '월 전체 일수': rows.length,
          '리타겟': totals.retarget,
          '1차 유효DB': totals.first,
          '바로 상담 2차DB': totals.directSecond,
          '월 DB 합계': totals.db,
          '매체확인 DB': totals.paidDb,
          '온라인 직접·자연 DB': totals.organicDb,
          '상담 전환': totals.conversions,
          '월 광고비': totals.spend,
          '월 CPL': actualCpl,
          '일평균 DB': Number(average.toFixed(1)),
          '월말 예상 DB': totals.elapsedDays > 0 ? Math.round(average * rows.length) : 0,
          '경과 기본 목표': totals.elapsedMinTarget,
          '월 기본 목표': totals.fullMinTarget,
          '월 상향 목표': totals.fullStretchTarget,
          '목표 CPL': monthTarget.targetCpl || null,
          'DB 목표 달성률': totals.elapsedMinTarget > 0 ? totals.db / totals.elapsedMinTarget : 0,
          'DB 목표 상태': periodStatus(totals.db, totals.elapsedMinTarget, elapsedStretch, totals.elapsedDays),
          'CPL 목표 상태': monthTarget.targetCpl <= 0 ? '목표 미설정' : actualCpl === null ? '집계 전' : actualCpl <= monthTarget.targetCpl ? '달성' : '미달',
        }
      })

      const groupedAcquisitions = rangeAcquisitions.map(row => ({ ...row, ...kpiDetailGroup(row.channel, row.subChannel) }))
      const groupedConversions = rangeConversions.map(row => ({ ...row, ...kpiDetailGroup(row.channel, row.subChannel) }))
      const groupedSpends = rangeSpends.map(row => ({ ...row, ...kpiDetailGroup(row.channel, String(row.subChannel || '').trim() || defaultDetail(row.channel)) }))
      const detailKeys = new Set<string>()
      groupedAcquisitions.forEach(row => detailKeys.add(`${row.channel}__${row.subChannel}`))
      groupedSpends.forEach(row => detailKeys.add(`${row.channel}__${row.subChannel}`))
      const detailRows: Record<string, string | number | null>[] = Array.from(detailKeys).map(key => {
        const [channel, subChannel] = key.split('__')
        const dbRows = groupedAcquisitions.filter(row => row.channel === channel && row.subChannel === subChannel)
        const spend = groupedSpends.filter(row => row.channel === channel && row.subChannel === subChannel).reduce((sum, row) => sum + row.amount, 0)
        const paid = isPaidChannel(channel)
        const converted = groupedConversions.filter(row => row.channel === channel && row.subChannel === subChannel).length
        return {
          '매체': CHANNEL_LABELS[channel] || channel,
          '상세매체': subChannel,
          '리타겟': dbRows.filter(row => row.stage === 'retarget').length,
          '1차 유효DB': dbRows.filter(row => row.stage === 'first').length,
          '바로 상담 2차DB': dbRows.filter(row => row.stage === 'second').length,
          '신규 DB 합계': dbRows.length,
          '상담 전환': converted,
          '상담 전환율': dbRows.length > 0 ? converted / dbRows.length : null,
          'DB 기여율': rangeAcquisitions.length > 0 ? dbRows.length / rangeAcquisitions.length : 0,
          '광고비': spend,
          'CPL': paid && dbRows.length > 0 ? Math.round(spend / dbRows.length) : null,
        }
      }).sort((a, b) => Number(b['신규 DB 합계']) - Number(a['신규 DB 합계']))

      const rangeTotals = aggregateRows(dailyMetrics)
      const rangeCpl = rangeTotals.paidDb > 0 ? Math.round(rangeTotals.spend / rangeTotals.paidDb) : null
      detailRows.push({
        '매체': '합계', '상세매체': '', '리타겟': rangeTotals.retarget, '1차 유효DB': rangeTotals.first,
        '바로 상담 2차DB': rangeTotals.directSecond, '신규 DB 합계': rangeTotals.db, '상담 전환': rangeTotals.conversions,
        '상담 전환율': rangeTotals.db > 0 ? rangeTotals.conversions / rangeTotals.db : null, 'DB 기여율': rangeTotals.db > 0 ? 1 : 0,
        '광고비': rangeTotals.spend, 'CPL': rangeCpl,
      })
      const targetCplValues = Array.from(new Set(monthlyRows.map(row => row['목표 CPL']).filter(value => typeof value === 'number' && value > 0)))
      const configuredCplMonths = monthlyRows.filter(row => typeof row['목표 CPL'] === 'number' && Number(row['목표 CPL']) > 0)
      const achievedCplMonths = configuredCplMonths.filter(row => row['CPL 목표 상태'] === '달성').length
      const summaryRows = [{
        '집계 시작일': exportStart,
        '집계 종료일': exportEnd,
        '리타겟 포함 여부': includeRetarget ? '포함' : '제외',
        '전체 일수': dailyMetrics.length,
        '경과 일수': rangeTotals.elapsedDays,
        '총 KPI DB': rangeTotals.db,
        '매체확인 DB': rangeTotals.paidDb,
        '온라인 직접·자연 DB': rangeTotals.organicDb,
        '리타겟 DB': rangeTotals.retarget,
        '1차 유효DB': rangeTotals.first,
        '바로 상담 2차DB': rangeTotals.directSecond,
        '상담 전환 건수': rangeTotals.conversions,
        '경과 기본 목표': rangeTotals.elapsedMinTarget,
        '전체 기본 목표': rangeTotals.fullMinTarget,
        '전체 상향 목표': rangeTotals.fullStretchTarget,
        '경과 목표 달성률': rangeTotals.elapsedMinTarget > 0 ? rangeTotals.db / rangeTotals.elapsedMinTarget : 0,
        '경과 일평균 DB': rangeTotals.elapsedDays > 0 ? Number((rangeTotals.db / rangeTotals.elapsedDays).toFixed(1)) : 0,
        '총 광고비': rangeTotals.spend,
        '기간 CPL': rangeCpl,
        '기간 목표 CPL': targetCplValues.length === 1 ? Number(targetCplValues[0]) : targetCplValues.length > 1 ? '월별 상이' : null,
        'CPL 목표 달성 월': configuredCplMonths.length > 0 ? `${achievedCplMonths}/${configuredCplMonths.length}` : '목표 미설정',
        '생성일시': generatedAt,
      }]
      const criteriaRows = [
        { '항목': '대상 기간', '집계 기준': `${exportStart} ~ ${exportEnd}` },
        { '항목': '일별 집계', '집계 기준': '선택기간의 날짜별 실적과 해당 월의 DB·CPL 목표를 표시합니다.' },
        { '항목': '주별 집계', '집계 기준': '월요일~일요일 기준입니다. 선택기간의 첫째·마지막 주는 실제 포함 일수만 집계합니다.' },
        { '항목': '월별 집계', '집계 기준': '각 월에 저장된 DB 목표와 CPL 목표를 적용합니다. 현재월은 오늘까지 경과 목표로 평가합니다.' },
        { '항목': '총 KPI DB', '집계 기준': '온라인광고와 온라인 직접·자연유입을 포함하고 외부·제휴유입은 제외합니다.' },
        { '항목': '중복 기준', '집계 기준': '연락처 기준 최종 고객 여정으로 중복 제거하며 KPI 화면과 동일한 건수를 사용합니다.' },
        { '항목': '리타겟', '집계 기준': `다운로드 시점 설정: ${includeRetarget ? '포함' : '제외'}` },
        { '항목': 'CPL', '집계 기준': '각 일·주·월·기간의 총 광고비 ÷ 같은 기간 매체확인 DB로 다시 계산하며 하위 CPL을 평균하지 않습니다.' },
        { '항목': 'CPL 목표', '집계 기준': '실제 CPL이 해당 월의 목표 CPL 이하이면 달성입니다. 여러 월 목표가 다르면 기간요약은 월별 상이로 표시합니다.' },
        { '항목': '상담 전환율', '집계 기준': '동일 기간 상담 전환 건수 ÷ 동일 기간 신규 DB이며 고객 코호트 전환율과는 다를 수 있습니다.' },
        { '항목': '금액 단위', '집계 기준': '원' },
        { '항목': '생성일시', '집계 기준': generatedAt },
      ]

      const workbook = XLSX.utils.book_new()
      const sheets = [
        ['기간요약', summaryRows], ['일별집계', dailyRows], ['주별집계', weeklyRows], ['월별집계', monthlyRows],
        ['상세매체', detailRows], ['집계기준', criteriaRows],
      ] as const
      const setColumnFormat = (sheet: any, header: string, cellFormat: string) => {
        if (!sheet['!ref']) return
        const range = XLSX.utils.decode_range(sheet['!ref'])
        let column = -1
        for (let col = range.s.c; col <= range.e.c; col += 1) {
          if (sheet[XLSX.utils.encode_cell({ r: 0, c: col })]?.v === header) column = col
        }
        if (column < 0) return
        for (let row = 1; row <= range.e.r; row += 1) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })]
          if (cell && typeof cell.v === 'number') cell.z = cellFormat
        }
      }
      sheets.forEach(([name, rows]) => {
        const sheet = XLSX.utils.json_to_sheet(rows as any[])
        const headers = Object.keys((rows as any[])[0] || {})
        sheet['!cols'] = headers.map(header => ({ wch: name === '집계기준' && header === '집계 기준' ? 95 : Math.max(12, Math.min(24, header.length * 2 + 2)) }))
        if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] }
        ;['경과 목표 달성률', 'DB 목표 달성률', '상담 전환율', 'DB 기여율'].forEach(header => setColumnFormat(sheet, header, '0.0%'))
        ;['총 광고비', '기간 CPL', '기간 목표 CPL', '일 광고비', '일 CPL', '목표 CPL', '주 광고비', '주 CPL', '월 광고비', '월 CPL', '광고비', 'CPL'].forEach(header => setColumnFormat(sheet, header, '#,##0'))
        XLSX.utils.book_append_sheet(workbook, sheet, name)
      })
      XLSX.writeFile(workbook, `온라인광고_KPI_${excelStartMonth}_${excelEndMonth}_${includeRetarget ? '리타겟포함' : '리타겟제외'}.xlsx`, { compression: true })
      setExcelExportOpen(false)
    } catch (error) {
      setNotice(error instanceof Error ? `엑셀 생성 실패: ${error.message}` : '엑셀 생성에 실패했습니다.')
    } finally {
      setExportingExcel(false)
    }
  }

  const progress = minExpected > 0 ? Math.min((totalDb / minExpected) * 100, 130) : 0
  const progressTone = elapsedDays === 0 ? 'bg-slate-300' : totalDb >= stretchExpected ? 'bg-blue-500' : totalDb >= minExpected ? 'bg-emerald-500' : 'bg-red-400'
  const calendarOffset = getDay(monthDate)

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">온라인광고 KPI</h1>
          <p className="mt-0.5 text-xs text-slate-500">온라인광고와 온라인 직접·자연유입을 포함하고 외부제휴는 제외합니다.</p>
          <label className="mt-2 inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={includeRetarget}
              onChange={event => setIncludeRetarget(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            리타겟 포함
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={event => setSelectedMonth(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          />
          <button onClick={openExcelExport} disabled={exportingExcel || loading} className="btn-secondary">
            <FileSpreadsheet size={14} /> {exportingExcel ? '엑셀 생성 중...' : '엑셀 다운로드'}
          </button>
          <button onClick={() => setReportOpen(true)} className="btn-secondary"><FileDown size={14} /> PDF 리포트</button>
          {user?.role === 'master' && <button onClick={openSettings} className="btn-secondary"><Settings size={14} /> 목표 설정</button>}
          <DataUpdatedAt />
          <button onClick={() => load(true)} className="btn-secondary"><RefreshCw size={14} className={clsx(loading && 'animate-spin')} /> 새로고침</button>
        </div>
      </div>

      {notice && <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">{notice}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-7">
        <StatCard
          label="오늘 온라인 DB"
          value={todayDb}
          suffix="건"
          sub={`광고 ${todayPaidDb} · 직접·자연 ${todayOrganicDb} · 목표 ${minDaily}~${stretchDaily}건${includeRetarget ? ' · 리타겟 포함' : ''}`}
          icon={CalendarDays}
          tone="blue"
        />
        <StatCard label={`${selectedMonth.slice(5, 7)}월 누적 DB`} value={totalDb} suffix="건" sub={`월 기본 목표 ${minMonthly.toLocaleString()}건`} icon={Target} tone="green" />
        <StatCard label="기본 목표 달성률" value={percent(minMonthly > 0 ? (totalDb / minMonthly) * 100 : 0)} sub={`경과 목표 ${minExpected.toLocaleString()}건`} icon={Gauge} tone="violet" />
        <StatCard label="현재 일평균" value={dailyAverage.toFixed(1)} suffix="건" sub={`월말 예상 ${forecast.toLocaleString()}건`} icon={TrendingUp} tone="cyan" />
        <StatCard label="필요 일평균" value={neededDaily} suffix="건" sub={`남은 ${remainingDays}일 · 기본 목표 기준`} icon={AlertTriangle} tone="orange" />
        <StatCard label="온라인 직접·자연" value={unattributedOnlineDb} suffix="건" sub="총 KPI 포함 · 매체 CPL 제외" icon={Gauge} tone="slate" />
        <StatCard label="광고비 / 매체확인 CPL" value={fmtMoney(totalSpend)} sub={attributedDb > 0 ? `매체확인 DB ${attributedDb}건 · CPL ${fmtCpl(cpl)}${targetCpl > 0 ? ` · 목표 ${fmtCpl(targetCpl)}` : ' · 목표 미설정'}` : `매체확인 DB 집계 전${targetCpl > 0 ? ` · 목표 ${fmtCpl(targetCpl)}` : ''}`} icon={DollarSign} tone="slate" />
      </div>

      <div className="card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">누적 목표 진행상태</p>
            <p className="mt-1 text-xs text-slate-400">
              실제 {totalDb.toLocaleString()}건 · 경과 기본 {minExpected.toLocaleString()}건 · 경과 상향 {stretchExpected.toLocaleString()}건
            </p>
          </div>
          <span className={clsx(
            'w-fit rounded-md px-2.5 py-1 text-xs font-semibold',
            elapsedDays === 0 ? 'bg-slate-100 text-slate-500' : totalDb >= stretchExpected ? 'bg-blue-50 text-blue-700' : totalDb >= minExpected ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
          )}>
            {elapsedDays === 0 ? '집계 시작 전' : totalDb >= stretchExpected ? '상향 목표 이상' : totalDb >= minExpected ? '기본 목표 달성' : '기본 목표 미달'}
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={clsx('h-full rounded-full transition-all', progressTone)} style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>0</span><span>기본 목표 100%</span></div>
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.8fr)]">
        <div className="card min-w-0 p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-slate-700">일별 온라인광고 DB</p>
            <p className="mt-0.5 text-[11px] text-slate-400">고객이 처음 유효DB가 된 날짜에 한 번만 집계합니다.{includeRetarget ? ' 리타겟도 포함 중입니다.' : ''}</p>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyData} margin={{ top: 18, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={daysInMonth > 20 ? 2 : 0} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = { retarget: '리타겟', first: '1차 유효DB', directSecond: '바로 상담 2차DB' }
                  return [`${value}건`, labels[name] || name]
                }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend formatter={value => value === 'retarget' ? '리타겟' : value === 'first' ? '1차 유효DB' : '바로 상담 2차DB'} wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={minDaily} stroke="#10b981" strokeDasharray="5 4" label={{ value: `기본 ${minDaily}`, fontSize: 10, fill: '#059669' }} />
                <ReferenceLine y={stretchDaily} stroke="#3b82f6" strokeDasharray="5 4" label={{ value: `상향 ${stretchDaily}`, fontSize: 10, fill: '#2563eb' }} />
                {includeRetarget && <Bar dataKey="retarget" stackId="db" fill="#8b5cf6" radius={[3, 3, 0, 0]} maxBarSize={26} />}
                <Bar dataKey="first" stackId="db" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Bar dataKey="directSecond" stackId="db" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={26} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-slate-700">운영 알림</p>
            <p className="mt-0.5 text-[11px] text-slate-400">목표 미달과 매체 이상 징후를 확인합니다.</p>
          </div>
          <div className="space-y-2">
            {alerts.map((alert, index) => (
              <div key={`${alert.text}_${index}`} className={clsx(
                'flex items-start gap-2 rounded-lg border px-3 py-3 text-xs leading-5',
                alert.tone === 'warn' ? 'border-red-100 bg-red-50 text-red-700' : alert.tone === 'good' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-blue-100 bg-blue-50 text-blue-700'
              )}>
                {alert.tone === 'warn' ? <AlertTriangle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0" />}
                <span>{alert.text}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex justify-between text-xs"><span className="text-slate-400">이번 달 상담 전환</span><span className="font-semibold text-slate-700">{monthConversions.length}건</span></div>
            <div className="mt-2 flex justify-between text-xs"><span className="text-slate-400">상향 목표 달성률</span><span className="font-semibold text-slate-700">{percent(stretchMonthly > 0 ? (totalDb / stretchMonthly) * 100 : 0)}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.8fr)]">
        <div className="card min-w-0 p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-slate-700">누적 실적과 목표선</p>
            <p className="mt-0.5 text-[11px] text-slate-400">경과일 기준으로 목표 대비 속도를 확인합니다.</p>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyData} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={2} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = { cumulative: '실제 누적', minCumulative: '기본 목표', stretchCumulative: '상향 목표' }
                  return [`${value.toLocaleString()}건`, labels[name] || name]
                }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend formatter={value => value === 'cumulative' ? '실제 누적' : value === 'minCumulative' ? '기본 목표' : '상향 목표'} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="cumulative" stroke="#0f172a" strokeWidth={3} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="minCumulative" stroke="#10b981" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                <Line type="monotone" dataKey="stretchCumulative" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-slate-700">일별 달성 달력</p>
            <p className="mt-0.5 text-[11px] text-slate-400">빨강 미달 · 초록 기본 · 파랑 상향</p>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400">
            {['일','월','화','수','목','금','토'].map(day => <div key={day} className="py-1">{day}</div>)}
            {Array.from({ length: calendarOffset }).map((_, index) => <div key={`blank_${index}`} />)}
            {dailyData.map(row => {
              const future = selectedMonth > currentMonth || (selectedMonth === currentMonth && row.date > today)
              return (
                <div key={row.date} className={clsx(
                  'flex aspect-square min-h-10 flex-col items-center justify-center rounded-md border text-[10px]',
                  future ? 'border-slate-100 bg-slate-50 text-slate-300' :
                    row.db >= stretchDaily ? 'border-blue-200 bg-blue-50 text-blue-700' :
                      row.db >= minDaily ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                        'border-red-100 bg-red-50 text-red-600'
                )}>
                  <span>{row.dayNumber}</span>
                  {!future && <strong className="text-xs">{row.db}</strong>}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-700">온라인광고 상세매체 기여도</p>
          <p className="mt-0.5 text-[11px] text-slate-400">온라인 직접·자연유입은 총 KPI에 포함하되, 매체 미확인으로 CPL에서는 제외합니다. 외부제휴는 포함하지 않습니다.{includeRetarget ? ' 리타겟 포함 기준입니다.' : ' 리타겟 제외 기준입니다.'}</p>
        </div>
        <div className="divide-y divide-slate-50 md:hidden">
          {detailStats.map(row => (
            <div key={row.key} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[10px] text-slate-400">{row.channelLabel}</p><p className="font-semibold text-slate-700">{row.subChannel}</p></div>
                <div className="text-right"><p className="text-lg font-bold text-slate-800">{row.db}<span className="ml-1 text-xs text-slate-400">건</span></p><p className="text-[10px] text-slate-400">기여율 {percent(row.share)}</p></div>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">
                <div><p className="text-[10px] text-slate-400">리타겟</p><p className="font-semibold text-violet-700">{row.retarget}</p></div>
                <div><p className="text-[10px] text-slate-400">1차</p><p className="font-semibold text-blue-700">{row.first}</p></div>
                <div><p className="text-[10px] text-slate-400">바로상담</p><p className="font-semibold text-emerald-700">{row.directSecond}</p></div>
                <div><p className="text-[10px] text-slate-400">광고비</p><p className="font-semibold text-slate-700">{fmtMoney(row.spend)}</p></div>
                <div><p className="text-[10px] text-slate-400">CPL</p><p className="font-semibold text-slate-700">{row.attributed && row.db > 0 ? fmtCpl(row.cpl) : '-'}</p></div>
              </div>
            </div>
          ))}
          {!detailStats.length && <div className="p-10 text-center text-sm text-slate-400">선택한 달의 온라인광고 데이터가 없습니다.</div>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="bg-slate-50 text-xs text-slate-500">
              <th className="px-4 py-3 text-left">매체</th><th className="px-4 py-3 text-left">상세매체</th>
              <th className="px-4 py-3 text-right">리타겟</th><th className="px-4 py-3 text-right">1차 유효DB</th><th className="px-4 py-3 text-right">바로 상담 2차</th>
              <th className="px-4 py-3 text-right">신규 DB 합계</th><th className="px-4 py-3 text-right">상담 전환</th>
              <th className="px-4 py-3 text-right">기여율</th><th className="px-4 py-3 text-right">광고비</th><th className="px-4 py-3 text-right">CPL</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {detailStats.map(row => <tr key={row.key} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 font-medium text-slate-700">{row.channelLabel}</td>
                <td className="px-4 py-3 text-slate-600">{row.subChannel}</td>
                <td className="px-4 py-3 text-right font-semibold text-violet-700">{row.retarget}</td>
                <td className="px-4 py-3 text-right font-semibold text-blue-700">{row.first}</td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-700">{row.directSecond}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-800">{row.db}</td>
                <td className="px-4 py-3 text-right text-slate-600">{row.converted}</td>
                <td className="px-4 py-3 text-right text-slate-600">{percent(row.share)}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-700">{fmtMoney(row.spend)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{row.attributed && row.db > 0 ? fmtCpl(row.cpl) : '-'}</td>
              </tr>)}
              {!detailStats.length && <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">선택한 달의 온라인광고 데이터가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {excelExportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-800">KPI 엑셀 다운로드</h2>
                <p className="mt-1 text-xs text-slate-400">선택기간의 일별·주별·월별 집계를 한 파일로 생성합니다.</p>
              </div>
              <button onClick={() => setExcelExportOpen(false)} aria-label="닫기"><X size={18} /></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-slate-500">시작월
                <input type="month" value={excelStartMonth} max={excelEndMonth} onChange={event => setExcelStartMonth(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs text-slate-500">종료월
                <input type="month" value={excelEndMonth} min={excelStartMonth} onChange={event => setExcelEndMonth(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[1, 3, 6, 12].map(months => (
                <button key={months} type="button" onClick={() => setExcelQuickRange(months)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  최근 {months}개월
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
              <p>생성 시트: 기간요약 · 일별집계 · 주별집계 · 월별집계 · 상세매체 · 집계기준</p>
              <p>리타겟: {includeRetarget ? '포함' : '제외'} · 주차 기준: 월요일~일요일</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setExcelExportOpen(false)} className="btn-secondary">취소</button>
              <button onClick={downloadExcel} disabled={exportingExcel} className="btn-primary">
                <FileSpreadsheet size={14} /> {exportingExcel ? '생성 중...' : '엑셀 생성'}
              </button>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div><h2 className="font-bold text-slate-800">월별 KPI 목표 설정</h2><p className="mt-1 text-xs text-slate-400">{selectedMonth.replace('-', '년 ')}월</p></div>
              <button onClick={() => setSettingsOpen(false)} aria-label="닫기"><X size={18} /></button>
            </div>
            <div className="mt-5">
              <p className="text-xs font-semibold text-slate-700">KPI DB 목표</p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs text-slate-500">일일 기본 DB
                  <input type="number" min={1} value={draftMin} onChange={event => setDraftMin(Number(event.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1 text-xs text-slate-500">일일 상향 DB
                  <input type="number" min={draftMin} value={draftStretch} onChange={event => setDraftStretch(Number(event.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
              </div>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-700">KPI CPL 목표</p>
              <label className="mt-2 block space-y-1 text-xs text-slate-500">목표 CPL 금액
                <div className="relative">
                  <input type="number" min={1} step={1000} value={draftTargetCpl} onChange={event => setDraftTargetCpl(Number(event.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-9 text-sm" />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">원</span>
                </div>
              </label>
              <p className="mt-2 text-[11px] text-slate-400">실제 CPL이 목표 금액 이하이면 달성으로 판단합니다.</p>
            </div>
            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">
              월 기본 {(draftMin * daysInMonth).toLocaleString()}건 · 월 상향 {(draftStretch * daysInMonth).toLocaleString()}건 · 목표 CPL {Math.round(draftTargetCpl).toLocaleString()}원
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setSettingsOpen(false)} className="btn-secondary">취소</button>
              <button onClick={saveSettings} disabled={saving} className="btn-primary">{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
      {reportOpen && (
        <OnlineKpiReport
          acquisitions={acquisitions}
          conversions={conversions}
          spends={spends}
          targets={targets}
          initialMonth={selectedMonth}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  )
}
