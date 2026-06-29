// src/pages/ChannelsPage.tsx
import { useEffect, useState } from 'react'
import { endOfMonth, endOfYear, format, parseISO, startOfMonth, startOfYear, subDays } from 'date-fns'
import { RefreshCw, TrendingUp } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchLeads, fetchAdSpend } from '../lib/dataService'
import type { LeadRecord, AdSpend, ViewMode } from '../types'
import clsx from 'clsx'
import { buildLeadJourneys, isPaidChannel, trafficGroup, type TrafficGroup } from '../lib/leadMetrics'

const CHANNELS = ['naver','google','meta','youtube','viral','kakao_search','kakao_moment','direct','tu_albarich','tu_youtube','tu_danggeun','hugreen_danggeun','hugreen_mail','inbound_call','etc'] as const
const CHANNEL_LABELS: Record<string, string> = {
  naver:'네이버', google:'구글', meta:'메타', youtube:'유튜브', viral:'바이럴', direct:'직접유입',
  kakao_search:'카카오 검색광고', kakao_moment:'카카오모먼트',
  tu_albarich:'TU-알바리치', tu_youtube:'TU-유튜브', tu_danggeun:'TU-당근',
  hugreen_danggeun:'휴그린-당근', hugreen_mail:'휴그린-메일', inbound_call:'인바운드-인입콜', etc:'기타'
}
const CHANNEL_COLORS: Record<string, string> = {
  naver:'#03C75A', google:'#4285F4', meta:'#1877F2', youtube:'#FF0000', viral:'#7C3AED', kakao_search:'#FEE500', kakao_moment:'#111827', direct:'#64748B',
  tu_albarich:'#0EA5E9', tu_youtube:'#EF4444', tu_danggeun:'#F97316',
  hugreen_danggeun:'#22C55E', hugreen_mail:'#14B8A6', inbound_call:'#334155', etc:'#94A3B8'
}
const today = format(new Date(), 'yyyy-MM-dd')
const DETAIL_ORDER = [
  '네이버 SA', '네이버 GFA', '네이버 브랜드검색',
  '구글 검색광고', '구글 디스커버리/GDN', '구글 유튜브',
  '메타', '유튜브', '바이럴', '블로그', '카페', '레뷰',
  '카카오 검색광고', '카카오모먼트',
]

function performanceRange(viewMode: ViewMode, selectedDate: string) {
  const base = parseISO(selectedDate)
  if (viewMode === 'daily') return { start: selectedDate, end: selectedDate, label: `${format(base, 'yyyy년 MM월 dd일')} 일별 기준` }
  if (viewMode === 'weekly') {
    const start = subDays(base, 6)
    return { start: format(start, 'yyyy-MM-dd'), end: selectedDate, label: `${format(start, 'yyyy년 MM월 dd일')} ~ ${format(base, 'MM월 dd일')} 최근 7일 기준` }
  }
  if (viewMode === 'monthly') return { start: format(startOfMonth(base), 'yyyy-MM-dd'), end: format(endOfMonth(base), 'yyyy-MM-dd'), label: `${format(base, 'yyyy년 MM월')} 월별 기준` }
  return { start: format(startOfYear(base), 'yyyy-MM-dd'), end: format(endOfYear(base), 'yyyy-MM-dd'), label: `${format(base, 'yyyy년')} 연별 기준` }
}

function fmtKRW(n: number) {
  if (n >= 100_000_000) return `${(n/100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n/10_000)}만`
  return n.toLocaleString()
}

function detailLabel(ch: string, subChannel?: string) {
  const label = String(subChannel || '').trim()
  const normalized = label.toLowerCase().replace(/[\s_\-\/()\[\].]/g, '')
  if (ch === 'naver' && normalized.includes('gfa')) return '네이버 GFA'
  if (ch === 'naver' && (normalized.includes('브랜드검색') || normalized.includes('brand'))) return '네이버 브랜드검색'
  if (ch === 'naver' && (normalized.includes('sa') || normalized.includes('파워링크'))) return '네이버 SA'
  if (ch === 'google' && (normalized.includes('디맨드') || normalized.includes('demand'))) return '구글 디스커버리/GDN'
  if (ch === 'google' && (normalized.includes('gdn') || normalized.includes('디스커버리') || normalized.includes('discovery'))) return '구글 디스커버리/GDN'
  if (ch === 'google' && (normalized.includes('유튜브') || normalized.includes('youtube'))) return '구글 유튜브'
  if (ch === 'google' && (normalized.includes('검색') || normalized.includes('search') || normalized.includes('sa'))) return '구글 검색광고'
  return label || CHANNEL_LABELS[ch] || '기타'
}

export default function ChannelsPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [spends, setSpends] = useState<AdSpend[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('daily')
  const [selectedDate, setSelectedDate] = useState(today)
  const [channelScope, setChannelScope] = useState<TrafficGroup | 'all'>('paid')
  const [filterChannel, setFilterChannel] = useState<string>('all')

  async function load() {
    setLoading(true)
    const [l, s] = await Promise.all([fetchLeads(undefined, undefined, { includeRawAttribution: true }), fetchAdSpend()])
    setLeads(l); setSpends(s); setLoading(false)
  }

  useEffect(() => { load() }, [])

  const range = performanceRange(viewMode, selectedDate)
  const periodJourneys = buildLeadJourneys(leads).filter(journey => journey.lead.date >= range.start && journey.lead.date <= range.end)
  const periodLeads = periodJourneys.map(journey => journey.lead)
  const periodSpends = spends.filter(spend => spend.date >= range.start && spend.date <= range.end)
  const leadInScope = (lead: LeadRecord) => channelScope === 'all' || trafficGroup(lead) === channelScope
  const scopedChannels = CHANNELS.filter(ch =>
    periodLeads.some(lead => lead.channel === ch && leadInScope(lead)) ||
    periodSpends.some(spend => spend.channel === ch && isPaidChannel(spend.channel) && (channelScope === 'all' || channelScope === 'paid'))
  )
  const visibleChannels = filterChannel === 'all' ? scopedChannels : scopedChannels.filter(ch => ch === filterChannel)

  const baseStats = visibleChannels.map(ch => {
    const chLeads = periodLeads.filter(l => l.channel === ch && leadInScope(l))
    const cFunnel = chLeads.filter(l => l.dbTier === 'retarget').length
    const firstDB = chLeads.filter(l => l.dbTier === 'first').length
    const secondDB = chLeads.filter(l => l.dbTier === 'second').length
    const validDB = firstDB + secondDB
    const spend = isPaidChannel(ch) ? periodSpends.filter(s => s.channel === ch).reduce((a, b) => a + b.amount, 0) : 0
    const cpl = validDB > 0 ? Math.round(spend / validDB) : 0
    const converted = periodJourneys.filter(journey => journey.lead.channel === ch && leadInScope(journey.lead) && journey.secondType === 'estimate_to_consult').length
    const convRate = firstDB + converted > 0 ? ((converted / (firstDB + converted)) * 100).toFixed(1) : '0.0'
    const label = ch === 'direct' && channelScope === 'external'
      ? '직접영업'
      : ch === 'direct'
        ? '홈페이지 직접유입'
        : ch === 'etc' && channelScope === 'organic'
          ? '온라인-기타'
          : ch === 'etc' && channelScope === 'unclassified'
            ? '미분류'
            : CHANNEL_LABELS[ch]
    return { ch, label, color: CHANNEL_COLORS[ch], spend, cFunnel, firstDB, validDB, secondDB, cpl, convRate }
  })

  const totalStatSpend = baseStats.reduce((sum, row) => sum + row.spend, 0)
  const totalStatDB = baseStats.reduce((sum, row) => sum + row.validDB, 0)
  const stats = baseStats.map(row => ({
    ...row,
    efficiency: row.spend > 0 && row.validDB > 0 && totalStatSpend > 0 && totalStatDB > 0
      ? Math.round(((row.validDB / totalStatDB) / (row.spend / totalStatSpend)) * 100)
      : 0,
  }))
  const maxSpend = Math.max(...stats.map(s => s.spend), 1)
  const maxDB = Math.max(...stats.map(s => s.secondDB), 1)
  const visibleJourneys = periodJourneys.filter(journey =>
    leadInScope(journey.lead) && (filterChannel === 'all' || journey.lead.channel === filterChannel)
  )
  const totalConverted = visibleJourneys.filter(journey => journey.secondType === 'estimate_to_consult').length
  const totalFirstOnly = visibleJourneys.filter(journey => journey.stage === 'first').length
  const detailKeys = new Set<string>()
  const channelMatches = (lead: LeadRecord) => leadInScope(lead) && (filterChannel === 'all' || lead.channel === filterChannel)
  periodLeads.filter(channelMatches).forEach(l => detailKeys.add(`${l.channel}__${detailLabel(l.channel, l.subChannel)}`))
  periodSpends.filter(s => (channelScope === 'all' || channelScope === 'paid') && (filterChannel === 'all' || s.channel === filterChannel)).forEach(s => detailKeys.add(`${s.channel}__${detailLabel(s.channel, s.subChannel)}`))
  const detailStats = Array.from(detailKeys).map(key => {
    const [ch, label] = key.split('__')
    const detailLeads = periodLeads.filter(l => l.channel === ch && leadInScope(l) && detailLabel(l.channel, l.subChannel) === label)
    const cFunnel = detailLeads.filter(l => l.dbTier === 'retarget').length
    const firstDB = detailLeads.filter(l => l.dbTier === 'first').length
    const secondDB = detailLeads.filter(l => l.dbTier === 'second').length
    const validDB = firstDB + secondDB
    const spend = isPaidChannel(ch) ? periodSpends
      .filter(s => s.channel === ch && detailLabel(s.channel, s.subChannel) === label)
      .reduce((a, b) => a + b.amount, 0) : 0
    const cpl = validDB > 0 ? Math.round(spend / validDB) : 0
    return { key, ch, channelLabel: CHANNEL_LABELS[ch] || ch, label, color: CHANNEL_COLORS[ch] || '#94A3B8', spend, cFunnel, firstDB, validDB, secondDB, cpl }
  }).filter(r => r.spend > 0 || r.validDB > 0 || r.cFunnel > 0)
    .sort((a, b) => {
      const channelDiff = CHANNELS.indexOf(a.ch as typeof CHANNELS[number]) - CHANNELS.indexOf(b.ch as typeof CHANNELS[number])
      if (channelDiff) return channelDiff
      const aRank = DETAIL_ORDER.indexOf(a.label)
      const bRank = DETAIL_ORDER.indexOf(b.label)
      return (aRank < 0 ? 999 : aRank) - (bRank < 0 ? 999 : bRank) || a.label.localeCompare(b.label)
    })
  const inputValue = viewMode === 'monthly' ? selectedDate.slice(0, 7) : viewMode === 'yearly' ? selectedDate.slice(0, 4) : selectedDate
  function changeDate(value: string) {
    if (!value) return
    if (viewMode === 'monthly') setSelectedDate(`${value}-01`)
    else if (viewMode === 'yearly') setSelectedDate(`${value}-01-01`)
    else setSelectedDate(value)
  }

  return (
    <div className="p-4 md:p-6 space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">매체별 성과</h1>
          <p className="text-xs text-slate-500 mt-0.5">{range.label}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <div className="flex h-9 max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 gap-1">
            {(['daily','weekly','monthly','yearly'] as ViewMode[]).map(mode => <button key={mode} onClick={() => setViewMode(mode)} className={clsx('shrink-0 rounded-md px-3 text-xs font-medium', viewMode === mode ? 'bg-blue-50 text-blue-600' : 'text-slate-500')}>{mode === 'daily' ? '일별' : mode === 'weekly' ? '주별' : mode === 'monthly' ? '월별' : '연별'}</button>)}
          </div>
          <div className="order-last flex h-9 max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 gap-1 lg:order-none">
            {[
              { key: 'paid', label: '온라인광고' },
              { key: 'organic', label: '온라인 직접·자연' },
              { key: 'external', label: '외부·제휴' },
              { key: 'unclassified', label: '미분류' },
              { key: 'all', label: '전체' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setChannelScope(key as TrafficGroup | 'all'); setFilterChannel('all') }}
                className={clsx(
                  'shrink-0 px-3 rounded-md text-xs font-medium transition-colors',
                  channelScope === key ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 sm:flex-none"
          >
            <option value="all">전체 매체</option>
            {scopedChannels.map(ch => <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>)}
          </select>
          {(viewMode === 'daily' || viewMode === 'weekly') && <input type="date" value={inputValue} onChange={event => changeDate(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 sm:flex-none" />}
          {viewMode === 'monthly' && <input type="month" value={inputValue} onChange={event => changeDate(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 sm:flex-none" />}
          {viewMode === 'yearly' && <input type="number" min="2020" max="2035" value={inputValue} onChange={event => changeDate(event.target.value)} className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700" />}
          <button onClick={() => { setSelectedDate(today); setViewMode('daily') }} className="btn-secondary shrink-0">오늘</button>
          <button onClick={load} className="btn-secondary shrink-0">
            <RefreshCw size={13} className={clsx(loading && 'animate-spin')} /> 새로고침
          </button>
        </div>
      </div>

      <div className="card p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">상세매체별 광고비·1차·2차 DB 비교</p>
          <span className="text-[11px] text-slate-400">막대 위 숫자는 선택기간 합계</span>
        </div>
        <div className="w-full overflow-x-auto">
          <div style={{ minWidth: `${Math.max(720, detailStats.length * 115)}px` }}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={detailStats.map(row => ({ ...row, spendMan: Math.round(row.spend / 10000) }))} margin={{ top: 28, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="spend" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="db" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(value: number, name: string) => name === 'spendMan' ? [`${value.toLocaleString()}만원`, '광고비'] : [`${value.toLocaleString()}건`, name === 'firstDB' ? '1차 DB' : '2차 DB']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend formatter={value => value === 'spendMan' ? '광고비(만원)' : value === 'firstDB' ? '1차 DB' : '2차 DB'} wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="spend" dataKey="spendMan" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={30}>
                  <LabelList dataKey="spendMan" position="top" formatter={(value: number) => value > 0 ? `${value}만` : ''} style={{ fontSize: 10, fill: '#7c3aed', fontWeight: 600 }} />
                </Bar>
                <Bar yAxisId="db" dataKey="firstDB" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={30}>
                  <LabelList dataKey="firstDB" position="top" formatter={(value: number) => value > 0 ? `${value}` : ''} style={{ fontSize: 10, fill: '#2563eb', fontWeight: 600 }} />
                </Bar>
                <Bar yAxisId="db" dataKey="secondDB" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={30}>
                  <LabelList dataKey="secondDB" position="top" formatter={(value: number) => value > 0 ? `${value}` : ''} style={{ fontSize: 10, fill: '#059669', fontWeight: 600 }} />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {stats.map(row => <div key={row.ch} className="card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} /><span className="font-semibold text-slate-700">{row.label}</span></div>
            <span className={clsx('rounded-md px-2 py-1 text-xs font-semibold', row.efficiency >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>광고 효율 {row.efficiency > 0 ? `${row.efficiency}%` : '-'}</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-violet-50 px-2 py-2"><div className="text-[10px] text-violet-500">광고비</div><div className="mt-0.5 text-sm font-bold text-violet-700">{fmtKRW(row.spend)}원</div></div>
            <div className="rounded-lg bg-blue-50 px-2 py-2"><div className="text-[10px] text-blue-500">유효 DB</div><div className="mt-0.5 text-sm font-bold text-blue-700">{row.validDB}건</div></div>
            <div className="rounded-lg bg-orange-50 px-2 py-2"><div className="text-[10px] text-orange-500">CPL</div><div className="mt-0.5 text-sm font-bold text-orange-700">{row.validDB > 0 ? `${fmtKRW(row.cpl)}원` : '-'}</div></div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>리타겟 {row.cFunnel} · 1차 {row.firstDB} · 2차 {row.secondDB}</span>
            <span>견적→상담 {row.convRate}%</span>
          </div>
        </div>)}
      </div>

      {/* Table */}
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">매체</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">광고비</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">리타겟</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">1차 DB</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">2차 DB</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">CPL</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">광고 효율</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">견적→상담</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {stats.map(({ ch, label, color, spend, cFunnel, firstDB, secondDB, cpl, convRate, efficiency }) => (
              <tr key={ch} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="font-medium text-slate-700">{label}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800">{fmtKRW(spend)}원</p>
                    <div className="w-full bg-slate-100 rounded-full h-1">
                      <div className="h-1 rounded-full" style={{ width: `${Math.round(spend/maxSpend*100)}%`, backgroundColor: color + 'aa' }} />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right text-slate-600">{cFunnel.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-right text-blue-700 font-medium">{firstDB.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-right">
                  <div className="space-y-1">
                    <p className="font-semibold text-emerald-700">{secondDB.toLocaleString()}</p>
                    <div className="w-full bg-slate-100 rounded-full h-1">
                      <div className="h-1 rounded-full" style={{ width: `${Math.round(secondDB/maxDB*100)}%`, backgroundColor: color }} />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right font-medium text-slate-700">{fmtKRW(cpl)}원</td>
                <td className="px-4 py-3.5 text-right"><span className={clsx('rounded-md px-2 py-1 text-xs font-semibold', efficiency >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>{efficiency > 0 ? `${efficiency}%` : '-'}</span></td>
                <td className="px-4 py-3.5 text-right">
                  <span className={clsx(
                    'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md',
                    Number(convRate) >= 50 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  )}>
                    <TrendingUp size={10} /> {convRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          {/* Total row */}
          <tfoot>
            <tr className="bg-slate-50 border-t border-slate-200">
              <td className="px-4 py-3 text-xs font-bold text-slate-600">합계</td>
              <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">
                {fmtKRW(stats.reduce((a,b)=>a+b.spend,0))}원
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">
                {stats.reduce((a,b)=>a+b.cFunnel,0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">
                {stats.reduce((a,b)=>a+b.firstDB,0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">
                {stats.reduce((a,b)=>a+b.secondDB,0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">
                {(() => {
                  const totalDB = stats.reduce((a,b)=>a+b.validDB,0)
                  const totalSpend = stats.reduce((a,b)=>a+b.spend,0)
                  return totalDB > 0 ? `${fmtKRW(Math.round(totalSpend/totalDB))}원` : '-'
                })()}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">{totalStatSpend > 0 && totalStatDB > 0 ? '100%' : '-'}</td>
              <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">
                {(() => {
                  return totalFirstOnly + totalConverted > 0 ? `${((totalConverted/(totalFirstOnly+totalConverted))*100).toFixed(1)}%` : '-'
                })()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Detail media CPL */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-700">상세매체별 CPL</p>
        </div>
        <div className="divide-y divide-slate-50 md:hidden">
          {detailStats.map(row => <div key={row.key} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-xs text-slate-400">{row.channelLabel}</div><div className="font-semibold text-slate-700">{row.label}</div></div>
              <div className="text-right"><div className="text-[10px] text-slate-400">CPL</div><div className="font-bold text-slate-800">{row.validDB > 0 ? `${fmtKRW(row.cpl)}원` : '-'}</div></div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <div><div className="text-[10px] text-slate-400">광고비</div><div className="font-medium text-slate-700">{fmtKRW(row.spend)}원</div></div>
              <div><div className="text-[10px] text-slate-400">리타겟</div><div className="font-medium text-violet-700">{row.cFunnel}</div></div>
              <div><div className="text-[10px] text-slate-400">1차</div><div className="font-medium text-blue-700">{row.firstDB}</div></div>
              <div><div className="text-[10px] text-slate-400">2차</div><div className="font-medium text-emerald-700">{row.secondDB}</div></div>
            </div>
          </div>)}
          {!detailStats.length && <div className="p-8 text-center text-sm text-slate-400">조회된 상세매체 데이터가 없습니다.</div>}
        </div>
        <div className="hidden overflow-auto md:block">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">매체</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">상세매체</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">광고비</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">리타겟</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">1차 DB</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">2차 DB</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">CPL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {detailStats.map(({ key, channelLabel, label, color, spend, cFunnel, firstDB, secondDB, cpl }) => (
                <tr key={key} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="font-medium text-slate-700">{channelLabel}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{label}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmtKRW(spend)}원</td>
                  <td className="px-4 py-3 text-right text-slate-600">{cFunnel.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-700">{firstDB.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-emerald-700 font-medium">{secondDB.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{firstDB + secondDB > 0 ? `${fmtKRW(cpl)}원` : '-'}</td>
                </tr>
              ))}
              {!detailStats.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">조회된 상세매체 데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Channel cards */}
      <div className="hidden xl:grid xl:grid-cols-7 gap-3">
        {stats.map(({ ch, label, color, spend, validDB, cpl }) => (
          <div key={ch} className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs font-semibold text-slate-700">{label}</span>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">{validDB}<span className="text-xs text-slate-400 ml-1">건</span></p>
              <p className="text-xs text-slate-400 mt-0.5">유효 DB (1차+2차)</p>
            </div>
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <div className="flex justify-between">
                <span className="text-xs text-slate-400">광고비</span>
                <span className="text-xs font-medium text-slate-600">{fmtKRW(spend)}원</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-400">CPL</span>
                <span className="text-xs font-medium text-slate-600">{fmtKRW(cpl)}원</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
