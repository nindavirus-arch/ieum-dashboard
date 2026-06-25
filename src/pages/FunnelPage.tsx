// src/pages/FunnelPage.tsx
import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { RefreshCw, ArrowDown } from 'lucide-react'
import { fetchLeads } from '../lib/dataService'
import type { LeadRecord } from '../types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import clsx from 'clsx'

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

function formatRateLabel(numerator: number, denominator: number) {
  if (denominator <= 0) return '-'
  const ratio = numerator / denominator
  if (ratio >= 1) {
    return `${ratio.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}배`
  }
  return `${(ratio * 100).toFixed(1)}%`
}

export default function FunnelPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filterChannel, setFilterChannel] = useState<string>('all')

  async function load() {
    setLoading(true)
    const now = new Date()
    const start = format(startOfMonth(now), 'yyyy-MM-dd')
    const end = format(endOfMonth(now), 'yyyy-MM-dd')
    const l = await fetchLeads(start, end)
    setLeads(l)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = filterChannel === 'all'
    ? leads
    : leads.filter(l => l.channel === filterChannel)

  const retarget = filtered.filter(l => l.dbTier === 'retarget').length
  const first = filtered.filter(l => l.dbTier === 'first').length
  const second = filtered.filter(l => l.dbTier === 'second').length
  const firstReentry = filtered.filter(l => l.dbTier === 'first_reentry').length
  const secondReentry = filtered.filter(l => l.dbTier === 'second_reentry').length
  const firstTotal = first + firstReentry
  const secondTotal = second + secondReentry
  const total = retarget + firstTotal + secondTotal

  const funnelSteps = [
    { label: '리타겟 DB', count: retarget, color: '#7c3aed', light: 'bg-violet-50 border-violet-200 text-violet-700' },
    { label: '1차 DB', count: firstTotal, color: '#2563eb', light: 'bg-blue-50 border-blue-200 text-blue-700' },
    { label: '2차 DB', count: secondTotal, color: '#059669', light: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  ]

  // Channel funnel data
  const channelFunnelData = CHANNELS.map(ch => ({
    name: CHANNEL_LABELS[ch],
    ch,
    retarget: leads.filter(l => l.channel === ch && l.dbTier === 'retarget').length,
    first: leads.filter(l => l.channel === ch && (l.dbTier === 'first' || l.dbTier === 'first_reentry')).length,
    second: leads.filter(l => l.channel === ch && (l.dbTier === 'second' || l.dbTier === 'second_reentry')).length,
    firstReentry: leads.filter(l => l.channel === ch && l.dbTier === 'first_reentry').length,
    secondReentry: leads.filter(l => l.channel === ch && l.dbTier === 'second_reentry').length,
  }))

  // Conversion rates
  const r2f = formatRateLabel(firstTotal, retarget)
  const f2s = formatRateLabel(secondTotal, firstTotal)
  const r2s = formatRateLabel(secondTotal, retarget)

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">퍼널 분석</h1>
          <p className="text-xs text-slate-500 mt-0.5">이번달 DB 전환 흐름</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterChannel}
            onChange={e => setFilterChannel(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">전체 채널</option>
            {CHANNELS.map(ch => <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>)}
          </select>
          <button onClick={load} className="btn-secondary">
            <RefreshCw size={13} className={clsx(loading && 'animate-spin')} /> 새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funnel visual */}
        <div className="card p-6 flex flex-col items-center gap-2">
          <p className="text-xs font-semibold text-slate-600 self-start mb-2">전환 퍼널</p>
          {funnelSteps.map(({ label, count, color, light }, i) => {
            const pct = total > 0 ? Math.round(count / total * 100) : 0
            const width = 100 - (i * 15)
            return (
              <div key={label} className="w-full flex flex-col items-center gap-1">
                {i > 0 && (
                  <div className="flex flex-col items-center gap-0.5 py-1">
                    <ArrowDown size={14} className="text-slate-300" />
                    <span className="text-[10px] text-slate-400">
                      {i === 1 ? `전환율 ${r2f}` : `전환율 ${f2s}`}
                    </span>
                  </div>
                )}
                <div
                  className={clsx('border rounded-xl px-4 py-3 flex items-center justify-between', light)}
                  style={{ width: `${width}%` }}
                >
                  <span className="text-xs font-semibold">{label}</span>
                  <span className="text-sm font-bold">{count}건</span>
                </div>
                <span className="text-[10px] text-slate-400">{pct}%</span>
              </div>
            )
          })}
          <div className="mt-4 pt-4 border-t border-slate-100 w-full space-y-1.5">
            <div className="flex justify-between text-xs text-slate-500">
              <span>전체 → 최종전환</span>
              <span className="font-semibold text-slate-700">{r2s}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>총 DB</span>
              <span className="font-semibold text-slate-700">{total}건</span>
            </div>
          </div>
        </div>

        {/* Channel bar chart */}
        <div className="lg:col-span-2 card p-5">
          <p className="text-xs font-semibold text-slate-600 mb-4">매체별 DB 등급 분포</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={channelFunnelData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(val: number, name: string) => [
                  `${val}건`,
                  name === 'retarget' ? '리타겟' : name === 'first' ? '1차 DB' : '2차 DB'
                ]}
              />
              <Bar dataKey="retarget" stackId="a" fill="#7c3aed" radius={[0,0,0,0]} />
              <Bar dataKey="first" stackId="a" fill="#3b82f6" radius={[0,0,0,0]} />
              <Bar dataKey="second" stackId="a" fill="#10b981" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 justify-center">
            {[
              { label: '리타겟', color: '#7c3aed' },
              { label: '1차 DB', color: '#3b82f6' },
              { label: '2차 DB', color: '#10b981' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-xs text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detailed funnel per channel */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-700">매체별 퍼널 상세</p>
        </div>
        <div className="overflow-auto"><table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="text-left px-4 py-2.5 text-xs font-medium">매체</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-violet-600">리타겟</th>
              <th className="text-center px-2 py-2.5 text-xs font-medium">→</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-blue-600">1차 DB</th>
              <th className="text-center px-2 py-2.5 text-xs font-medium">→</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-emerald-600">2차 DB</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium">합계</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium">최종전환율</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {channelFunnelData.map(({ name, ch, retarget, first, second }) => {
              const tot = retarget + first + second
              const finalRate = formatRateLabel(second, retarget)
              return (
                <tr key={ch} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[ch] }} />
                      <span className="font-medium text-slate-700">{name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-violet-700">{retarget}</td>
                  <td className="px-2 py-3 text-center text-slate-300 text-xs">↓</td>
                  <td className="px-4 py-3 text-right font-medium text-blue-700">{first}</td>
                  <td className="px-2 py-3 text-center text-slate-300 text-xs">↓</td>
                  <td className="px-4 py-3 text-right font-medium text-emerald-700">{second}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-800">{tot}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-xs font-semibold text-slate-700">{finalRate}</span>
                      {retarget > 0 && (
                        <span className="text-[10px] text-slate-400">2차 {second} / C {retarget}</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}
