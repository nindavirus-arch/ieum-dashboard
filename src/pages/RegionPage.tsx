// src/pages/RegionPage.tsx
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { MapPin, RefreshCw, ChevronRight } from 'lucide-react'
import { fetchLeads } from '../lib/dataService'
import type { LeadRecord } from '../types'
import clsx from 'clsx'
import { finalLeads } from '../lib/leadMetrics'

const PROVINCES = [
  '서울','부산','대구','인천','광주','대전','울산','세종',
  '경기','강원','충북','충남','전북','전남','경북','경남','제주'
]

export default function RegionPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))

  async function load() {
    setLoading(true)
    const l = await fetchLeads()
    setLeads(finalLeads(l).filter(lead => lead.date.startsWith(selectedMonth)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  const isThisMonth = selectedMonth === format(new Date(), 'yyyy-MM')
  const monthLabel = isThisMonth ? '이번달 유효 DB 기준' : `${selectedMonth} 유효 DB 기준`

  // Province stats
  const provinceStat = PROVINCES.map(prov => {
    const pl = leads.filter(l => l.region?.includes(prov))
    return {
      prov,
      total: pl.length,
      retarget: pl.filter(l => l.dbTier === 'retarget').length,
      first: pl.filter(l => l.dbTier === 'first').length,
      second: pl.filter(l => l.dbTier === 'second').length,
    }
  }).filter(p => p.total > 0).sort((a, b) => b.total - a.total)

  const maxTotal = Math.max(...provinceStat.map(p => p.total), 1)

  // District stats for selected province
  const districtStats = selected
    ? (() => {
        const pl = leads.filter(l => l.region?.includes(selected))
        const dist = [...new Set(pl.map(l => l.district).filter(Boolean))]
        return dist.map(d => ({
          d,
          total: pl.filter(l => l.district === d).length,
          retarget: pl.filter(l => l.district === d && l.dbTier === 'retarget').length,
          first: pl.filter(l => l.district === d && l.dbTier === 'first').length,
          second: pl.filter(l => l.district === d && l.dbTier === 'second').length,
        })).sort((a, b) => b.total - a.total)
      })()
    : []

  return (
    <div className="p-4 md:p-6 space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">지역별 통계</h1>
          <p className="text-xs text-slate-500 mt-0.5">{monthLabel}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 sm:flex-none"
          />
          <button onClick={() => setSelectedMonth(format(new Date(), 'yyyy-MM'))} className="btn-secondary">이번달</button>
          <button onClick={load} className="btn-secondary shrink-0">
            <RefreshCw size={13} className={clsx(loading && 'animate-spin')} /> 새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Province list */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <MapPin size={13} className="text-blue-500" />
            <p className="text-xs font-semibold text-slate-700">시도별 현황</p>
          </div>
          <div className="divide-y divide-slate-50">
            {provinceStat.map(({ prov, total, retarget, first, second }) => (
              <button
                key={prov}
                onClick={() => setSelected(selected === prov ? null : prov)}
                className={clsx(
                  'w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors',
                  selected === prov && 'bg-blue-50'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{prov}</span>
                    {selected === prov && <ChevronRight size={12} className="text-blue-500" />}
                  </div>
                  <span className="text-sm font-bold text-slate-800">{total}<span className="text-xs text-slate-400 ml-0.5">건</span></span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mb-1.5">
                  <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${Math.round(total/maxTotal*100)}%` }} />
                </div>
                <div className="flex gap-3 text-xs text-slate-400">
                  <span className="text-violet-600">리타겟 {retarget}</span>
                  <span className="text-blue-500">1차 {first}</span>
                  <span className="text-emerald-600">2차 {second}</span>
                </div>
              </button>
            ))}
            {provinceStat.length === 0 && (
              <p className="text-center py-10 text-sm text-slate-400">데이터가 없습니다</p>
            )}
          </div>
        </div>

        {/* District list */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700">
              {selected ? `${selected} 시군구별 현황` : '시도를 선택하면 시군구 현황이 표시됩니다'}
            </p>
          </div>
          {selected ? (
            <div className="divide-y divide-slate-50">
              {districtStats.map(({ d, total, retarget, first, second }) => (
                <div key={d} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-700">{d || '미입력'}</span>
                    <span className="text-sm font-bold text-slate-800">{total}건</span>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-400">
                    <span className="text-violet-600">리타겟 {retarget}</span>
                    <span className="text-blue-500">1차 {first}</span>
                    <span className="text-emerald-600">2차 {second}</span>
                  </div>
                </div>
              ))}
              {districtStats.length === 0 && (
                <p className="text-center py-10 text-sm text-slate-400">시군구 데이터가 없습니다</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-48">
              <p className="text-sm text-slate-300">좌측에서 시도를 선택하세요</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-700">전체 지역 집계</p>
        </div>
        <div className="divide-y divide-slate-50 md:hidden">
          {provinceStat.map(({ prov, total, retarget, first, second }) => {
            const pct = leads.length > 0 ? Math.round(total / leads.length * 100) : 0
            return <div key={prov} className="p-4">
              <div className="flex items-center justify-between"><span className="font-semibold text-slate-700">{prov}</span><span className="font-bold text-slate-800">{total}건 <span className="text-xs font-normal text-slate-400">{pct}%</span></span></div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs"><span className="rounded bg-violet-50 py-1 text-violet-700">리타겟 {retarget}</span><span className="rounded bg-blue-50 py-1 text-blue-700">1차 {first}</span><span className="rounded bg-emerald-50 py-1 text-emerald-700">2차 {second}</span></div>
            </div>
          })}
        </div>
        <table className="hidden w-full text-sm md:table">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="text-left px-4 py-2.5 text-xs font-medium">시도</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium">리타겟</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium">1차 DB</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium">2차 DB</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium">합계</th>
              <th className="px-4 py-2.5 text-xs font-medium">비율</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {provinceStat.map(({ prov, total, retarget, first, second }) => {
              const grandTotal = leads.length
              const pct = grandTotal > 0 ? Math.round(total/grandTotal*100) : 0
              return (
                <tr key={prov} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{prov}</td>
                  <td className="px-4 py-2.5 text-right text-violet-600 text-xs">{retarget}</td>
                  <td className="px-4 py-2.5 text-right text-blue-600 text-xs">{first}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-600 text-xs">{second}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-800">{total}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-400 w-8">{pct}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
