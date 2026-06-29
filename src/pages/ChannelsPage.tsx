// src/pages/ChannelsPage.tsx
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { RefreshCw, TrendingUp } from 'lucide-react'
import { fetchLeads, fetchAdSpend } from '../lib/dataService'
import type { LeadRecord, AdSpend } from '../types'
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

function fmtKRW(n: number) {
  if (n >= 100_000_000) return `${(n/100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n/10_000)}만`
  return n.toLocaleString()
}

function detailLabel(ch: string, subChannel?: string) {
  const label = String(subChannel || '').trim()
  const normalized = label.toLowerCase().replace(/[\s_\-\/()\[\].]/g, '')
  if (ch === 'google' && (normalized.includes('디맨드') || normalized.includes('demand'))) return '구글 디스커버리/GDN'
  return label || CHANNEL_LABELS[ch] || '기타'
}

export default function ChannelsPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [spends, setSpends] = useState<AdSpend[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [channelScope, setChannelScope] = useState<TrafficGroup | 'all'>('paid')
  const [filterChannel, setFilterChannel] = useState<string>('all')

  async function load() {
    setLoading(true)
    const [l, s] = await Promise.all([fetchLeads(undefined, undefined, { includeRawAttribution: true }), fetchAdSpend()])
    setLeads(l); setSpends(s); setLoading(false)
  }

  useEffect(() => { load() }, [])

  const monthJourneys = buildLeadJourneys(leads).filter(journey => journey.lead.date.startsWith(selectedMonth))
  const monthLeads = monthJourneys.map(journey => journey.lead)
  const monthSpends = spends.filter(spend => spend.date.startsWith(selectedMonth))
  const leadInScope = (lead: LeadRecord) => channelScope === 'all' || trafficGroup(lead) === channelScope
  const scopedChannels = CHANNELS.filter(ch =>
    monthLeads.some(lead => lead.channel === ch && leadInScope(lead)) ||
    monthSpends.some(spend => spend.channel === ch && isPaidChannel(spend.channel) && (channelScope === 'all' || channelScope === 'paid'))
  )
  const visibleChannels = filterChannel === 'all' ? scopedChannels : scopedChannels.filter(ch => ch === filterChannel)

  const stats = visibleChannels.map(ch => {
    const chLeads = monthLeads.filter(l => l.channel === ch && leadInScope(l))
    const cFunnel = chLeads.filter(l => l.dbTier === 'retarget').length
    const firstDB = chLeads.filter(l => l.dbTier === 'first').length
    const secondDB = chLeads.filter(l => l.dbTier === 'second').length
    const validDB = firstDB + secondDB
    const spend = isPaidChannel(ch) ? monthSpends.filter(s => s.channel === ch).reduce((a, b) => a + b.amount, 0) : 0
    const cpl = validDB > 0 ? Math.round(spend / validDB) : 0
    const converted = monthJourneys.filter(journey => journey.lead.channel === ch && leadInScope(journey.lead) && journey.secondType === 'estimate_to_consult').length
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

  const maxSpend = Math.max(...stats.map(s => s.spend), 1)
  const maxDB = Math.max(...stats.map(s => s.secondDB), 1)
  const visibleJourneys = monthJourneys.filter(journey =>
    leadInScope(journey.lead) && (filterChannel === 'all' || journey.lead.channel === filterChannel)
  )
  const totalConverted = visibleJourneys.filter(journey => journey.secondType === 'estimate_to_consult').length
  const totalFirstOnly = visibleJourneys.filter(journey => journey.stage === 'first').length
  const detailKeys = new Set<string>()
  const channelMatches = (lead: LeadRecord) => leadInScope(lead) && (filterChannel === 'all' || lead.channel === filterChannel)
  monthLeads.filter(channelMatches).forEach(l => detailKeys.add(`${l.channel}__${detailLabel(l.channel, l.subChannel)}`))
  monthSpends.filter(s => (channelScope === 'all' || channelScope === 'paid') && (filterChannel === 'all' || s.channel === filterChannel)).forEach(s => detailKeys.add(`${s.channel}__${detailLabel(s.channel, s.subChannel)}`))
  const detailStats = Array.from(detailKeys).map(key => {
    const [ch, label] = key.split('__')
    const detailLeads = monthLeads.filter(l => l.channel === ch && leadInScope(l) && detailLabel(l.channel, l.subChannel) === label)
    const cFunnel = detailLeads.filter(l => l.dbTier === 'retarget').length
    const firstDB = detailLeads.filter(l => l.dbTier === 'first').length
    const secondDB = detailLeads.filter(l => l.dbTier === 'second').length
    const validDB = firstDB + secondDB
    const spend = isPaidChannel(ch) ? monthSpends
      .filter(s => s.channel === ch && detailLabel(s.channel, s.subChannel) === label)
      .reduce((a, b) => a + b.amount, 0) : 0
    const cpl = validDB > 0 ? Math.round(spend / validDB) : 0
    return { key, ch, channelLabel: CHANNEL_LABELS[ch] || ch, label, color: CHANNEL_COLORS[ch] || '#94A3B8', spend, cFunnel, firstDB, validDB, secondDB, cpl }
  }).filter(r => r.spend > 0 || r.validDB > 0 || r.cFunnel > 0)
    .sort((a, b) => b.spend - a.spend || b.validDB - a.validDB)
  const isThisMonth = selectedMonth === format(new Date(), 'yyyy-MM')
  const monthLabel = isThisMonth ? '이번달 기준' : `${selectedMonth} 기준`

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">매체별 성과</h1>
          <p className="text-xs text-slate-500 mt-0.5">{monthLabel}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex h-9 max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 gap-1">
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
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            <option value="all">전체 매체</option>
            {scopedChannels.map(ch => <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>)}
          </select>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
          />
          <button onClick={() => setSelectedMonth(format(new Date(), 'yyyy-MM'))} className="btn-secondary">이번달</button>
          <button onClick={load} className="btn-secondary">
            <RefreshCw size={13} className={clsx(loading && 'animate-spin')} /> 새로고침
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">매체</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">광고비</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">리타겟</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">1차 DB</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">2차 DB</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">CPL</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">견적→상담</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {stats.map(({ ch, label, color, spend, cFunnel, firstDB, secondDB, cpl, convRate }) => (
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
        <div className="overflow-auto">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
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
