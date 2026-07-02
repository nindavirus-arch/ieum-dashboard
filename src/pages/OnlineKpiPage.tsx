import { useEffect, useMemo, useState } from 'react'
import { endOfMonth, format, getDay, getDaysInMonth, parseISO } from 'date-fns'
import {
  AlertTriangle, CalendarDays, CheckCircle2, DollarSign, Gauge,
  RefreshCw, Settings, Target, TrendingUp, X,
} from 'lucide-react'
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import clsx from 'clsx'
import {
  fetchAdSpend, fetchKpiTargets, fetchLeads, saveKpiTarget,
  type KpiTarget,
} from '../lib/dataService'
import { baseStage, buildLeadJourneys, isPaidChannel, trafficGroup } from '../lib/leadMetrics'
import type { AdSpend, LeadRecord } from '../types'
import { useAuth } from '../contexts/AuthContext'
import DataUpdatedAt from '../components/DataUpdatedAt'

const today = format(new Date(), 'yyyy-MM-dd')
const currentMonth = today.slice(0, 7)
const initialMonth = currentMonth < '2026-07' ? '2026-07' : currentMonth

const CHANNEL_LABELS: Record<string, string> = {
  naver: '네이버',
  google: '구글',
  meta: '메타',
  youtube: '유튜브',
  viral: '바이럴',
  kakao_search: '카카오 검색광고',
  kakao_moment: '카카오모먼트',
  direct: '온라인 직접유입',
  etc: '온라인 기타',
}

const CHANNEL_ORDER = ['naver', 'google', 'meta', 'youtube', 'viral', 'kakao_search', 'kakao_moment', 'direct', 'etc']

type Acquisition = {
  date: string
  channel: string
  subChannel: string
  stage: 'first' | 'second'
}

type ConversionEvent = {
  date: string
  channel: string
  subChannel: string
}

function recordDate(lead: LeadRecord) {
  return String(lead.registeredAt || lead.date || lead.uploadedAt || '').slice(0, 10)
}

function defaultDetail(channel: string) {
  if (channel === 'naver') return '네이버 SA'
  if (channel === 'google') return '구글 검색광고'
  if (channel === 'meta') return '메타'
  if (channel === 'youtube') return '유튜브'
  if (channel === 'viral') return '바이럴'
  if (channel === 'kakao_search') return '카카오 검색광고'
  if (channel === 'kakao_moment') return '카카오모먼트'
  if (channel === 'direct') return '홈페이지 직접유입'
  if (channel === 'etc') return '온라인 기타'
  return '기타'
}

function detailLabel(lead: Pick<LeadRecord, 'channel' | 'subChannel'>) {
  return String(lead.subChannel || '').trim() || defaultDetail(lead.channel)
}

function isOnlineKpiLead(lead: LeadRecord) {
  const group = trafficGroup(lead)
  return group === 'paid' || group === 'organic'
}

function buildOnlineKpiData(leads: LeadRecord[]) {
  const acquisitions: Acquisition[] = []
  const conversions: ConversionEvent[] = []

  buildLeadJourneys(leads).forEach(journey => {
    const onlineValid = journey.records
      .filter(record => isOnlineKpiLead(record) && baseStage(record.dbTier) !== 'retarget')
      .sort((a, b) => recordDate(a).localeCompare(recordDate(b)))
    const acquired = onlineValid[0]
    if (!acquired) return

    const acquisitionStage = baseStage(acquired.dbTier)
    acquisitions.push({
      date: recordDate(acquired),
      channel: acquired.channel,
      subChannel: detailLabel(acquired),
      stage: acquisitionStage === 'second' ? 'second' : 'first',
    })

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
  const [draftMin, setDraftMin] = useState(40)
  const [draftStretch, setDraftStretch] = useState(60)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setNotice('')
    try {
      const [leadRows, spendRows] = await Promise.all([
        fetchLeads(),
        fetchAdSpend(),
      ])
      setLeads(leadRows)
      setSpends(spendRows)
      try {
        setTargets(await fetchKpiTargets())
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'KPI 목표를 불러오지 못했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const configuredTarget = targets.find(target => target.month === selectedMonth)
  const minDaily = configuredTarget?.minDaily || 40
  const stretchDaily = Math.max(configuredTarget?.stretchDaily || 60, minDaily)
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

  const { acquisitions, conversions } = useMemo(() => buildOnlineKpiData(leads), [leads])
  const monthAcquisitions = acquisitions.filter(row => row.date >= monthStart && row.date <= monthEnd)
  const monthConversions = conversions.filter(row => row.date >= monthStart && row.date <= monthEnd)
  const monthSpends = spends.filter(row => isPaidChannel(row.channel) && row.date >= monthStart && row.date <= monthEnd)
  const totalDb = monthAcquisitions.length
  const attributedDb = monthAcquisitions.filter(row => isPaidChannel(row.channel)).length
  const unattributedOnlineDb = totalDb - attributedDb
  const todayDb = selectedMonth === currentMonth ? acquisitions.filter(row => row.date === today).length : 0
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
      const first = rows.filter(row => row.stage === 'first').length
      const directSecond = rows.filter(row => row.stage === 'second').length
      cumulative += rows.length
      return {
        day: `${day}일`,
        dayNumber: day,
        date,
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
    const keys = new Set<string>()
    monthAcquisitions.forEach(row => keys.add(`${row.channel}__${row.subChannel}`))
    monthSpends.forEach(row => keys.add(`${row.channel}__${String(row.subChannel || '').trim() || defaultDetail(row.channel)}`))
    return Array.from(keys).map(key => {
      const [channel, subChannel] = key.split('__')
      const dbRows = monthAcquisitions.filter(row => row.channel === channel && row.subChannel === subChannel)
      const spend = monthSpends
        .filter(row => row.channel === channel && (String(row.subChannel || '').trim() || defaultDetail(row.channel)) === subChannel)
        .reduce((sum, row) => sum + row.amount, 0)
      const converted = monthConversions.filter(row => row.channel === channel && row.subChannel === subChannel).length
      const attributed = isPaidChannel(channel)
      return {
        key,
        channel,
        channelLabel: CHANNEL_LABELS[channel] || channel,
        subChannel,
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
    detailStats.filter(row => isPaidChannel(row.channel) && row.spend > 0 && row.db === 0).slice(0, 2).forEach(row => {
      result.push({ tone: 'warn', text: `${row.subChannel}: 광고비가 집행됐지만 유효DB가 없습니다.` })
    })
    if (totalDb >= minExpected && elapsedDays > 0) {
      result.push({ tone: 'good', text: `누적 기본 목표보다 ${totalDb - minExpected}건 앞서 있습니다.` })
    } else if (elapsedDays > 0) {
      result.push({ tone: 'warn', text: `누적 기본 목표보다 ${minExpected - totalDb}건 부족합니다.` })
    }
    return result.slice(0, 4)
  }, [dailyData, detailStats, elapsedDays, minDaily, minExpected, selectedMonth, totalDb])

  function openSettings() {
    setDraftMin(minDaily)
    setDraftStretch(stretchDaily)
    setSettingsOpen(true)
  }

  async function saveSettings() {
    if (draftMin <= 0 || draftStretch < draftMin) {
      setNotice('상향 목표는 기본 목표보다 크거나 같아야 합니다.')
      return
    }
    setSaving(true)
    try {
      await saveKpiTarget({
        month: selectedMonth,
        minDaily: Math.round(draftMin),
        stretchDaily: Math.round(draftStretch),
        updatedBy: user?.name || user?.id || '',
      })
      setTargets(current => [
        ...current.filter(target => target.month !== selectedMonth),
        { month: selectedMonth, minDaily: Math.round(draftMin), stretchDaily: Math.round(draftStretch), updatedBy: user?.name || user?.id || '' },
      ])
      setSettingsOpen(false)
      setNotice('KPI 목표가 저장되었습니다.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'KPI 목표 저장에 실패했습니다.')
    } finally {
      setSaving(false)
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={event => setSelectedMonth(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          />
          {user?.role === 'master' && <button onClick={openSettings} className="btn-secondary"><Settings size={14} /> 목표 설정</button>}
          <DataUpdatedAt />
          <button onClick={load} className="btn-secondary"><RefreshCw size={14} className={clsx(loading && 'animate-spin')} /> 새로고침</button>
        </div>
      </div>

      {notice && <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">{notice}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-7">
        <StatCard label="오늘 온라인광고 DB" value={todayDb} suffix="건" sub={`기본 ${minDaily} · 상향 ${stretchDaily}건`} icon={CalendarDays} tone="blue" />
        <StatCard label={`${selectedMonth.slice(5, 7)}월 누적 DB`} value={totalDb} suffix="건" sub={`월 기본 목표 ${minMonthly.toLocaleString()}건`} icon={Target} tone="green" />
        <StatCard label="기본 목표 달성률" value={percent(minMonthly > 0 ? (totalDb / minMonthly) * 100 : 0)} sub={`경과 목표 ${minExpected.toLocaleString()}건`} icon={Gauge} tone="violet" />
        <StatCard label="현재 일평균" value={dailyAverage.toFixed(1)} suffix="건" sub={`월말 예상 ${forecast.toLocaleString()}건`} icon={TrendingUp} tone="cyan" />
        <StatCard label="필요 일평균" value={neededDaily} suffix="건" sub={`남은 ${remainingDays}일 · 기본 목표 기준`} icon={AlertTriangle} tone="orange" />
        <StatCard label="온라인 직접·자연" value={unattributedOnlineDb} suffix="건" sub="총 KPI 포함 · 매체 CPL 제외" icon={Gauge} tone="slate" />
        <StatCard label="광고비 / 매체확인 CPL" value={fmtMoney(totalSpend)} sub={attributedDb > 0 ? `매체확인 DB ${attributedDb}건 · CPL ${fmtMoney(cpl)}` : '매체확인 DB 집계 전'} icon={DollarSign} tone="slate" />
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
            <p className="mt-0.5 text-[11px] text-slate-400">고객이 처음 유효DB가 된 날짜에 한 번만 집계합니다.</p>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyData} margin={{ top: 18, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={daysInMonth > 20 ? 2 : 0} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = { first: '1차 유효DB', directSecond: '바로 상담 2차DB' }
                  return [`${value}건`, labels[name] || name]
                }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend formatter={value => value === 'first' ? '1차 유효DB' : '바로 상담 2차DB'} wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={minDaily} stroke="#10b981" strokeDasharray="5 4" label={{ value: `기본 ${minDaily}`, fontSize: 10, fill: '#059669' }} />
                <ReferenceLine y={stretchDaily} stroke="#3b82f6" strokeDasharray="5 4" label={{ value: `상향 ${stretchDaily}`, fontSize: 10, fill: '#2563eb' }} />
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
          <p className="mt-0.5 text-[11px] text-slate-400">온라인 직접·자연유입은 총 KPI에 포함하되, 매체 미확인으로 CPL에서는 제외합니다. 외부제휴는 포함하지 않습니다.</p>
        </div>
        <div className="divide-y divide-slate-50 md:hidden">
          {detailStats.map(row => (
            <div key={row.key} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[10px] text-slate-400">{row.channelLabel}</p><p className="font-semibold text-slate-700">{row.subChannel}</p></div>
                <div className="text-right"><p className="text-lg font-bold text-slate-800">{row.db}<span className="ml-1 text-xs text-slate-400">건</span></p><p className="text-[10px] text-slate-400">기여율 {percent(row.share)}</p></div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                <div><p className="text-[10px] text-slate-400">1차</p><p className="font-semibold text-blue-700">{row.first}</p></div>
                <div><p className="text-[10px] text-slate-400">바로상담</p><p className="font-semibold text-emerald-700">{row.directSecond}</p></div>
                <div><p className="text-[10px] text-slate-400">광고비</p><p className="font-semibold text-slate-700">{fmtMoney(row.spend)}</p></div>
                <div><p className="text-[10px] text-slate-400">CPL</p><p className="font-semibold text-slate-700">{row.attributed && row.db > 0 ? fmtMoney(row.cpl) : '-'}</p></div>
              </div>
            </div>
          ))}
          {!detailStats.length && <div className="p-10 text-center text-sm text-slate-400">선택한 달의 온라인광고 데이터가 없습니다.</div>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="bg-slate-50 text-xs text-slate-500">
              <th className="px-4 py-3 text-left">매체</th><th className="px-4 py-3 text-left">상세매체</th>
              <th className="px-4 py-3 text-right">1차 유효DB</th><th className="px-4 py-3 text-right">바로 상담 2차</th>
              <th className="px-4 py-3 text-right">신규 DB 합계</th><th className="px-4 py-3 text-right">상담 전환</th>
              <th className="px-4 py-3 text-right">기여율</th><th className="px-4 py-3 text-right">광고비</th><th className="px-4 py-3 text-right">CPL</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {detailStats.map(row => <tr key={row.key} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 font-medium text-slate-700">{row.channelLabel}</td>
                <td className="px-4 py-3 text-slate-600">{row.subChannel}</td>
                <td className="px-4 py-3 text-right font-semibold text-blue-700">{row.first}</td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-700">{row.directSecond}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-800">{row.db}</td>
                <td className="px-4 py-3 text-right text-slate-600">{row.converted}</td>
                <td className="px-4 py-3 text-right text-slate-600">{percent(row.share)}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-700">{fmtMoney(row.spend)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{row.attributed && row.db > 0 ? fmtMoney(row.cpl) : '-'}</td>
              </tr>)}
              {!detailStats.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">선택한 달의 온라인광고 데이터가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div><h2 className="font-bold text-slate-800">월별 KPI 목표 설정</h2><p className="mt-1 text-xs text-slate-400">{selectedMonth.replace('-', '년 ')}월</p></div>
              <button onClick={() => setSettingsOpen(false)} aria-label="닫기"><X size={18} /></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-slate-500">일일 기본 목표
                <input type="number" min={1} value={draftMin} onChange={event => setDraftMin(Number(event.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs text-slate-500">일일 상향 목표
                <input type="number" min={draftMin} value={draftStretch} onChange={event => setDraftStretch(Number(event.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">
              월 기본 목표 {(draftMin * daysInMonth).toLocaleString()}건 · 월 상향 목표 {(draftStretch * daysInMonth).toLocaleString()}건
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setSettingsOpen(false)} className="btn-secondary">취소</button>
              <button onClick={saveSettings} disabled={saving} className="btn-primary">{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
