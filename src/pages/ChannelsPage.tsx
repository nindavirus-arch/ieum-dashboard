// src/pages/ChannelsPage.tsx
import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { RefreshCw, TrendingUp } from 'lucide-react'
import { fetchLeads, fetchAdSpend } from '../lib/dataService'
import type { LeadRecord, AdSpend } from '../types'
import clsx from 'clsx'

const CHANNELS = ['naver','google','meta','youtube','viral','direct','tu_albarich','tu_youtube','tu_danggeun','hugreen_danggeun','hugreen_mail','inbound_call','etc'] as const
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

function fmtKRW(n: number) {
  if (n >= 100_000_000) return `${(n/100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n/10_000)}만`
  return n.toLocaleString()
}

export default function ChannelsPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [spends, setSpends] = useState<AdSpend[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const now = new Date()
    const start = format(startOfMonth(now), 'yyyy-MM-dd')
    const end = format(endOfMonth(now), 'yyyy-MM-dd')
    const [l, s] = await Promise.all([fetchLeads(start, end), fetchAdSpend(start, end)])
    setLeads(l); setSpends(s); setLoading(false)
  }

  useEffect(() => { load() }, [])

  const stats = CHANNELS.map(ch => {
    const chLeads = leads.filter(l => l.channel === ch)
    const validDB = chLeads.filter(l => l.status !== 'invalid' && l.status !== 'test' && l.status !== 'duplicate').length
    const cFunnel = chLeads.length
    const spend = spends.filter(s => s.channel === ch).reduce((a, b) => a + b.amount, 0)
    const cpl = validDB > 0 ? Math.round(spend / validDB) : 0
    const convRate = cFunnel > 0 ? ((validDB / cFunnel) * 100).toFixed(1) : '0.0'
    return { ch, label: CHANNEL_LABELS[ch], color: CHANNEL_COLORS[ch], spend, cFunnel, validDB, cpl, convRate }
  })

  const maxSpend = Math.max(...stats.map(s => s.spend), 1)
  const maxDB = Math.max(...stats.map(s => s.validDB), 1)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">매체별 성과</h1>
          <p className="text-xs text-slate-500 mt-0.5">이번달 기준</p>
        </div>
        <button onClick={load} className="btn-secondary">
          <RefreshCw size={13} className={clsx(loading && 'animate-spin')} /> 새로고침
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">매체</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">광고비</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">C퍼널</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">유효 DB</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">CPL</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">전환율</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {stats.map(({ ch, label, color, spend, cFunnel, validDB, cpl, convRate }) => (
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
                <td className="px-4 py-3.5 text-right">
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800">{validDB.toLocaleString()}</p>
                    <div className="w-full bg-slate-100 rounded-full h-1">
                      <div className="h-1 rounded-full" style={{ width: `${Math.round(validDB/maxDB*100)}%`, backgroundColor: color }} />
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
                {stats.reduce((a,b)=>a+b.validDB,0).toLocaleString()}
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
                  const totalDB = stats.reduce((a,b)=>a+b.validDB,0)
                  const totalFunnel = stats.reduce((a,b)=>a+b.cFunnel,0)
                  return totalFunnel > 0 ? `${((totalDB/totalFunnel)*100).toFixed(1)}%` : '-'
                })()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Channel cards */}
      <div className="grid grid-cols-7 gap-3">
        {stats.map(({ ch, label, color, spend, validDB, cpl }) => (
          <div key={ch} className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs font-semibold text-slate-700">{label}</span>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">{validDB}<span className="text-xs text-slate-400 ml-1">건</span></p>
              <p className="text-xs text-slate-400 mt-0.5">유효 DB</p>
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
