import { useMemo, useState } from 'react'
import { eachDayOfInterval, endOfMonth, format, parseISO, startOfMonth, subDays } from 'date-fns'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FileDown, Printer, X } from 'lucide-react'
import type { AdSpend } from '../../types'
import type { KpiTarget } from '../../lib/dataService'
import { isPaidChannel } from '../../lib/leadMetrics'

type ReportMode = 'daily' | 'weekly' | 'monthly'

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

type Props = {
  acquisitions: Acquisition[]
  conversions: ConversionEvent[]
  spends: AdSpend[]
  targets: KpiTarget[]
  initialMonth: string
  onClose: () => void
}

const CHANNEL_LABELS: Record<string, string> = {
  naver: '네이버',
  google: '구글',
  meta: '메타',
  youtube: '유튜브',
  viral: '바이럴',
  danggeun: '당근',
  kakao_search: '카카오 검색광고',
  kakao_moment: '카카오모먼트',
  direct: '온라인 직접유입',
  etc: '온라인 기타',
}

const CHANNEL_ORDER = ['naver', 'google', 'meta', 'youtube', 'viral', 'danggeun', 'kakao_search', 'kakao_moment', 'direct', 'etc']

function money(value: number) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억원`
  if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString()}만원`
  return `${Math.round(value).toLocaleString()}원`
}

function rate(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : '0.0%'
}

function groupedDetail(channel: string, subChannel: string) {
  const detail = String(subChannel || '').trim() || CHANNEL_LABELS[channel] || '기타'
  const normalized = detail.toLowerCase().replace(/[\s_\-\/()\[\].]/g, '')
  if (channel === 'google' && (
    normalized.includes('디스커버리')
    || normalized.includes('디맨드')
    || normalized.includes('demand')
    || normalized.includes('discovery')
    || normalized.includes('gdn')
    || normalized.includes('유튜브')
    || normalized.includes('youtube')
  )) {
    return { channel: 'google', subChannel: '구글 디스커버리/GDN·유튜브' }
  }
  return { channel, subChannel: detail }
}

export default function OnlineKpiReport({ acquisitions, conversions, spends, targets, initialMonth, onClose }: Props) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [mode, setMode] = useState<ReportMode>('monthly')
  const [selectedDate, setSelectedDate] = useState(initialMonth === today.slice(0, 7) ? today : `${initialMonth}-01`)
  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const generatedAt = format(new Date(), 'yyyy-MM-dd HH:mm:ss')

  const range = useMemo(() => {
    if (mode === 'daily') return { start: selectedDate, end: selectedDate, label: format(parseISO(selectedDate), 'yyyy년 MM월 dd일') }
    if (mode === 'weekly') {
      const start = format(subDays(parseISO(selectedDate), 6), 'yyyy-MM-dd')
      return { start, end: selectedDate, label: `${start} ~ ${selectedDate} (최근 7일)` }
    }
    const base = parseISO(`${selectedMonth}-01`)
    return {
      start: format(startOfMonth(base), 'yyyy-MM-dd'),
      end: format(endOfMonth(base), 'yyyy-MM-dd'),
      label: format(base, 'yyyy년 MM월'),
    }
  }, [mode, selectedDate, selectedMonth])

  const period = useMemo(() => {
    const rows = acquisitions.filter(row => row.date >= range.start && row.date <= range.end)
    const conversionRows = conversions.filter(row => row.date >= range.start && row.date <= range.end)
    const spendRows = spends.filter(row => isPaidChannel(row.channel) && row.date >= range.start && row.date <= range.end)
    const days = eachDayOfInterval({ start: parseISO(range.start), end: parseISO(range.end) })
    const targetMonth = range.end.slice(0, 7)
    const target = targets.find(row => row.month === targetMonth)
    const minDaily = target?.minDaily || 40
    const stretchDaily = Math.max(target?.stretchDaily || 60, minDaily)
    const minTarget = minDaily * days.length
    const stretchTarget = stretchDaily * days.length
    const paidDb = rows.filter(row => isPaidChannel(row.channel)).length
    const organicDb = rows.length - paidDb
    const totalSpend = spendRows.reduce((sum, row) => sum + row.amount, 0)

    const groupedAcquisitions = rows.map(row => ({ ...row, ...groupedDetail(row.channel, row.subChannel) }))
    const groupedConversions = conversionRows.map(row => ({ ...row, ...groupedDetail(row.channel, row.subChannel) }))
    const groupedSpends = spendRows.map(row => ({ ...row, ...groupedDetail(row.channel, row.subChannel || '') }))
    const keys = new Set<string>()
    groupedAcquisitions.forEach(row => keys.add(`${row.channel}__${row.subChannel}`))
    groupedSpends.forEach(row => keys.add(`${row.channel}__${row.subChannel}`))
    const details = Array.from(keys).map(key => {
      const [channel, subChannel] = key.split('__')
      const dbRows = groupedAcquisitions.filter(row => row.channel === channel && row.subChannel === subChannel)
      const detailSpend = groupedSpends
        .filter(row => row.channel === channel && row.subChannel === subChannel)
        .reduce((sum, row) => sum + row.amount, 0)
      const converted = groupedConversions.filter(row => row.channel === channel && row.subChannel === subChannel).length
      const attributed = isPaidChannel(channel)
      return {
        key,
        channel,
        channelLabel: CHANNEL_LABELS[channel] || channel,
        subChannel,
        first: dbRows.filter(row => row.stage === 'first').length,
        second: dbRows.filter(row => row.stage === 'second').length,
        db: dbRows.length,
        converted,
        spend: detailSpend,
        attributed,
        cpl: attributed && dbRows.length > 0 ? Math.round(detailSpend / dbRows.length) : 0,
        share: rows.length > 0 ? (dbRows.length / rows.length) * 100 : 0,
      }
    }).sort((a, b) => {
      const channelDiff = CHANNEL_ORDER.indexOf(a.channel) - CHANNEL_ORDER.indexOf(b.channel)
      return channelDiff || b.db - a.db || b.spend - a.spend
    })

    const trend = days.map(day => {
      const date = format(day, 'yyyy-MM-dd')
      const dateRows = rows.filter(row => row.date === date)
      return {
        date,
        label: mode === 'daily' ? format(day, 'MM/dd') : format(day, 'MM/dd'),
        first: dateRows.filter(row => row.stage === 'first').length,
        second: dateRows.filter(row => row.stage === 'second').length,
        spend: spendRows.filter(row => row.date === date).reduce((sum, row) => sum + row.amount, 0),
      }
    })

    return {
      rows,
      details,
      trend,
      minDaily,
      stretchDaily,
      minTarget,
      stretchTarget,
      paidDb,
      organicDb,
      totalSpend,
      cpl: paidDb > 0 ? Math.round(totalSpend / paidDb) : 0,
      conversionCount: conversionRows.length,
    }
  }, [acquisitions, conversions, mode, range.end, range.start, spends, targets])

  const bestVolume = period.details.filter(row => row.attributed).sort((a, b) => b.db - a.db)[0]
  const bestCpl = period.details.filter(row => row.attributed && row.db > 0 && row.spend > 0).sort((a, b) => a.cpl - b.cpl)[0]
  const targetRate = period.minTarget > 0 ? (period.rows.length / period.minTarget) * 100 : 0

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-900/70 p-3 md:p-6">
      <div className="no-print sticky top-0 z-10 mx-auto mb-4 flex max-w-[1120px] flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3 shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            {([
              ['daily', '일별'],
              ['weekly', '주별'],
              ['monthly', '월별'],
            ] as const).map(([value, label]) => (
              <button key={value} onClick={() => setMode(value)} className={`tab-btn ${mode === value ? 'active' : ''}`}>{label}</button>
            ))}
          </div>
          {mode === 'monthly'
            ? <input type="month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            : <input type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />}
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="btn-primary"><Printer size={15} /> PDF 저장</button>
          <button onClick={onClose} className="btn-secondary"><X size={15} /> 닫기</button>
        </div>
      </div>

      <main className="kpi-report-print-root mx-auto max-w-[1120px] space-y-5">
        <section className="report-sheet rounded-lg bg-white p-8 shadow-xl">
          <header className="flex items-start justify-between border-b border-slate-200 pb-5">
            <div>
              <div className="mb-2 flex items-center gap-2 text-blue-600"><FileDown size={18} /><span className="text-xs font-semibold">IEUM AD PERFORMANCE REPORT</span></div>
              <h1 className="text-2xl font-bold text-slate-900">온라인광고 KPI 리포트</h1>
              <p className="mt-2 text-sm text-slate-500">{range.label}</p>
            </div>
            <div className="text-right text-xs leading-5 text-slate-400">
              <p>창호마스터 이음 대시보드</p>
              <p>생성일시 {generatedAt}</p>
            </div>
          </header>

          <div className="mt-6 grid grid-cols-6 gap-3">
            {[
              ['총 KPI DB', `${period.rows.length.toLocaleString()}건`, `기본 목표 ${period.minTarget.toLocaleString()}건`],
              ['목표 달성률', rate(targetRate), `상향 목표 ${period.stretchTarget.toLocaleString()}건`],
              ['매체확인 DB', `${period.paidDb.toLocaleString()}건`, 'CPL 산정 대상'],
              ['온라인 직접·자연', `${period.organicDb.toLocaleString()}건`, 'KPI 포함·CPL 제외'],
              ['광고비', money(period.totalSpend), `기간 ${period.trend.length}일`],
              ['CPL', period.paidDb > 0 ? money(period.cpl) : '-', '광고비 ÷ 매체확인 DB'],
            ].map(([label, value, sub]) => (
              <div key={label} className="rounded-lg border border-slate-200 p-4">
                <p className="text-[11px] text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
                <p className="mt-2 text-[10px] text-slate-400">{sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div><h2 className="text-sm font-bold text-slate-800">일자별 DB·광고비 추이</h2><p className="mt-1 text-[11px] text-slate-400">1차·바로상담 2차 DB와 일 광고비를 함께 표시합니다.</p></div>
              <span className="text-[11px] text-slate-400">기본 일 목표 {period.minDaily}건 · 상향 {period.stretchDaily}건</span>
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={period.trend} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis yAxisId="db" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis yAxisId="spend" orientation="right" tick={{ fontSize: 10, fill: '#8b5cf6' }} tickFormatter={value => `${Math.round(value / 10000)}만`} />
                  <Tooltip formatter={(value: number, name: string) => [name === 'spend' ? money(value) : `${value}건`, name === 'first' ? '1차 DB' : name === 'second' ? '바로상담 2차' : '광고비']} />
                  <Legend formatter={value => value === 'first' ? '1차 DB' : value === 'second' ? '바로상담 2차' : '광고비'} />
                  <Bar yAxisId="db" dataKey="first" stackId="db" fill="#3b82f6" maxBarSize={30} />
                  <Bar yAxisId="db" dataKey="second" stackId="db" fill="#10b981" maxBarSize={30} />
                  <Line yAxisId="spend" type="monotone" dataKey="spend" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-[11px] text-slate-400">목표 평가</p>
              <p className={`mt-1 text-sm font-semibold ${targetRate >= 100 ? 'text-emerald-700' : 'text-red-600'}`}>
                {targetRate >= 100 ? `기본 목표 대비 ${Math.round(targetRate - 100)}% 초과` : `기본 목표 대비 ${period.minTarget - period.rows.length}건 부족`}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-[11px] text-slate-400">DB 기여 1위</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{bestVolume ? `${bestVolume.subChannel} · ${bestVolume.db}건` : '집계 전'}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-[11px] text-slate-400">최저 CPL</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{bestCpl ? `${bestCpl.subChannel} · ${money(bestCpl.cpl)}` : '집계 전'}</p>
            </div>
          </div>
        </section>

        <section className="report-sheet rounded-lg bg-white p-8 shadow-xl">
          <header className="flex items-end justify-between border-b border-slate-200 pb-4">
            <div><h2 className="text-xl font-bold text-slate-900">상세매체별 성과</h2><p className="mt-1 text-xs text-slate-500">{range.label} · 온라인광고 및 온라인 직접·자연유입</p></div>
            <p className="text-[10px] text-slate-400">구글 디스커버리/GDN·유튜브 통합 CPL 적용</p>
          </header>
          <table className="mt-5 w-full table-fixed text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-slate-500">
                <th className="w-[12%] px-3 py-2 text-left">매체</th>
                <th className="w-[22%] px-3 py-2 text-left">상세매체</th>
                <th className="px-2 py-2 text-right">1차</th>
                <th className="px-2 py-2 text-right">바로상담</th>
                <th className="px-2 py-2 text-right">DB 합계</th>
                <th className="px-2 py-2 text-right">상담전환</th>
                <th className="px-2 py-2 text-right">기여율</th>
                <th className="w-[13%] px-3 py-2 text-right">광고비</th>
                <th className="w-[12%] px-3 py-2 text-right">CPL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {period.details.map(row => (
                <tr key={row.key}>
                  <td className="px-3 py-2.5 font-medium text-slate-700">{row.channelLabel}</td>
                  <td className="px-3 py-2.5 text-slate-600">{row.subChannel}</td>
                  <td className="px-2 py-2.5 text-right text-blue-700">{row.first}</td>
                  <td className="px-2 py-2.5 text-right text-emerald-700">{row.second}</td>
                  <td className="px-2 py-2.5 text-right font-bold text-slate-900">{row.db}</td>
                  <td className="px-2 py-2.5 text-right text-slate-600">{row.converted}</td>
                  <td className="px-2 py-2.5 text-right text-slate-600">{rate(row.share)}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-700">{money(row.spend)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{row.attributed && row.db > 0 ? money(row.cpl) : '-'}</td>
                </tr>
              ))}
              {!period.details.length && <tr><td colSpan={9} className="py-16 text-center text-slate-400">선택 기간의 집계 데이터가 없습니다.</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-800">
                <td colSpan={2} className="px-3 py-3">합계</td>
                <td className="px-2 py-3 text-right">{period.rows.filter(row => row.stage === 'first').length}</td>
                <td className="px-2 py-3 text-right">{period.rows.filter(row => row.stage === 'second').length}</td>
                <td className="px-2 py-3 text-right">{period.rows.length}</td>
                <td className="px-2 py-3 text-right">{period.conversionCount}</td>
                <td className="px-2 py-3 text-right">100%</td>
                <td className="px-3 py-3 text-right">{money(period.totalSpend)}</td>
                <td className="px-3 py-3 text-right">{period.paidDb > 0 ? money(period.cpl) : '-'}</td>
              </tr>
            </tfoot>
          </table>
          <div className="mt-6 grid grid-cols-2 gap-4 text-[10px] leading-5 text-slate-500">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="font-semibold text-slate-700">집계 기준</p>
              <p className="mt-1">총 KPI DB는 온라인광고와 온라인 직접·자연유입을 포함하며 연락처 기준으로 중복 제거합니다. 외부·제휴유입은 제외합니다.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="font-semibold text-slate-700">CPL 기준</p>
              <p className="mt-1">매체확인 광고비 ÷ 매체확인 1차·2차 DB로 계산합니다. 온라인 직접·자연유입은 총 KPI에는 포함하지만 CPL에서는 제외합니다.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
