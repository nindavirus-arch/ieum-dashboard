// src/pages/RegionPage.tsx
import { useEffect, useMemo, useState } from 'react'
import { format, subMonths } from 'date-fns'
import { ChevronRight, MapPin, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import clsx from 'clsx'
import DataUpdatedAt from '../components/DataUpdatedAt'
import { fetchConsultingStatusEvents, fetchLeads } from '../lib/dataService'
import { useAutoDataRefresh } from '../lib/appRefresh'
import { finalLeads } from '../lib/leadMetrics'
import { buildVisitMilestones, latestVisitByPhone } from '../lib/visitMetrics'
import type { LeadRecord } from '../types'

const PROVINCES = [
  '서울','부산','대구','인천','광주·전남','대전','울산','세종',
  '경기','강원','충북','충남','전북','경북','경남','제주'
]

function monthKey(date: Date) {
  return format(date, 'yyyy-MM')
}

function previousMonthKey(month: string) {
  return monthKey(subMonths(new Date(`${month}-01T00:00:00`), 1))
}

function matchesProvince(lead: LeadRecord, province: string) {
  const region = String(lead.region || '')
  if (province === '광주·전남') return region.includes('광주') || region.includes('전남')
  return region.includes(province)
}

function districtLabel(lead: LeadRecord, province: string) {
  const district = lead.district || '미입력'
  if (province !== '광주·전남') return district
  const region = String(lead.region || '')
  const prefix = region.includes('광주') ? '광주' : region.includes('전남') ? '전남' : ''
  return prefix ? `${prefix} ${district}` : district
}

function provinceStats(leads: LeadRecord[], thirdLeads: LeadRecord[]) {
  return PROVINCES.map(prov => {
    const rows = leads.filter(lead => matchesProvince(lead, prov))
    const thirdRows = thirdLeads.filter(lead => matchesProvince(lead, prov))
    return {
      prov,
      total: rows.length,
      retarget: rows.filter(lead => lead.dbTier === 'retarget').length,
      first: rows.filter(lead => lead.dbTier === 'first').length,
      second: rows.filter(lead => lead.dbTier === 'second').length,
      third: thirdRows.length,
    }
  }).filter(row => row.total > 0 || row.third > 0).sort((a, b) => b.total - a.total || b.third - a.third)
}

export default function RegionPage() {
  const [allLeads, setAllLeads] = useState<LeadRecord[]>([])
  const [statusEvents, setStatusEvents] = useState<Awaited<ReturnType<typeof fetchConsultingStatusEvents>>>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()))

  async function load() {
    setLoading(true)
    try {
      const [rows, events] = await Promise.all([fetchLeads(), fetchConsultingStatusEvents()])
      setAllLeads(finalLeads(rows))
      setStatusEvents(events)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useAutoDataRefresh(load)
  useEffect(() => { setSelected(null) }, [selectedMonth])

  const prevMonth = previousMonthKey(selectedMonth)
  const monthLeads = useMemo(
    () => allLeads.filter(lead => lead.date.startsWith(selectedMonth)),
    [allLeads, selectedMonth]
  )
  const prevMonthLeads = useMemo(
    () => allLeads.filter(lead => lead.date.startsWith(prevMonth)),
    [allLeads, prevMonth]
  )
  const visitByPhone = useMemo(
    () => latestVisitByPhone(buildVisitMilestones(statusEvents)),
    [statusEvents]
  )
  const monthThirdLeads = useMemo(
    () => allLeads.filter(lead => visitByPhone.get(lead.phone)?.date.startsWith(selectedMonth)),
    [allLeads, selectedMonth, visitByPhone]
  )
  const prevMonthThirdLeads = useMemo(
    () => allLeads.filter(lead => visitByPhone.get(lead.phone)?.date.startsWith(prevMonth)),
    [allLeads, prevMonth, visitByPhone]
  )
  const currentStats = useMemo(() => provinceStats(monthLeads, monthThirdLeads), [monthLeads, monthThirdLeads])
  const previousStats = useMemo(() => provinceStats(prevMonthLeads, prevMonthThirdLeads), [prevMonthLeads, prevMonthThirdLeads])
  const currentMap = useMemo(() => new Map(currentStats.map(row => [row.prov, row])), [currentStats])
  const previousMap = useMemo(() => new Map(previousStats.map(row => [row.prov, row])), [previousStats])
  const maxTotal = Math.max(...currentStats.map(row => row.total), 1)

  const trendStats = useMemo(() => PROVINCES.map(prov => {
    const current = currentMap.get(prov)
    const previous = previousMap.get(prov)?.total || 0
    const total = current?.total || 0
    const diff = total - previous
    const rate = previous > 0 ? Math.round((diff / previous) * 100) : total > 0 ? 100 : 0
    return { prov, total, previous, diff, rate }
  }), [currentMap, previousMap])
  const growthRegions = [...trendStats].filter(row => row.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 5)
  const declineRegions = [...trendStats].filter(row => row.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 5)

  const districtStats = useMemo(() => {
    if (!selected) return []
    const provinceLeads = monthLeads.filter(lead => matchesProvince(lead, selected))
    const provinceThirdLeads = monthThirdLeads.filter(lead => matchesProvince(lead, selected))
    const districts = [...new Set([...provinceLeads, ...provinceThirdLeads].map(lead => districtLabel(lead, selected)))]
    return districts.map(district => {
      const rows = provinceLeads.filter(lead => districtLabel(lead, selected) === district)
      const thirdRows = provinceThirdLeads.filter(lead => districtLabel(lead, selected) === district)
      return {
        district,
        total: rows.length,
        retarget: rows.filter(lead => lead.dbTier === 'retarget').length,
        first: rows.filter(lead => lead.dbTier === 'first').length,
        second: rows.filter(lead => lead.dbTier === 'second').length,
        third: thirdRows.length,
      }
    }).sort((a, b) => b.total - a.total || b.third - a.third)
  }, [monthLeads, monthThirdLeads, selected])

  const isThisMonth = selectedMonth === monthKey(new Date())
  const monthLabel = isThisMonth ? '이번달 최종 DB 기준' : `${selectedMonth} 최종 DB 기준`
  const grandTotal = monthLeads.length

  return (
    <div className="space-y-5 p-4 md:space-y-6 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">지역별 통계</h1>
          <p className="mt-0.5 text-xs text-slate-500">{monthLabel}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 sm:flex-none"
          />
          <button onClick={() => setSelectedMonth(monthKey(new Date()))} className="btn-secondary">이번달</button>
          <DataUpdatedAt />
          <button onClick={load} className="btn-secondary shrink-0">
            <RefreshCw size={13} className={clsx(loading && 'animate-spin')} /> 새로고침
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TrendCard title="전월 대비 증가 지역" icon="up" rows={growthRegions} />
        <TrendCard title="전월 대비 감소 지역" icon="down" rows={declineRegions} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <MapPin size={13} className="text-blue-500" />
            <p className="text-xs font-semibold text-slate-700">시도별 현황</p>
          </div>
          <div className="divide-y divide-slate-50">
            {currentStats.map(({ prov, total, retarget, first, second, third }) => (
              <button
                key={prov}
                onClick={() => setSelected(selected === prov ? null : prov)}
                className={clsx('w-full px-4 py-3 text-left transition-colors hover:bg-slate-50', selected === prov && 'bg-blue-50')}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{prov}</span>
                    {selected === prov && <ChevronRight size={12} className="text-blue-500" />}
                  </div>
                  <span className="text-sm font-bold text-slate-800">{total}<span className="ml-0.5 text-xs text-slate-400">건</span></span>
                </div>
                <div className="mb-1.5 h-1.5 w-full rounded-full bg-slate-100">
                  <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${Math.round(total / maxTotal * 100)}%` }} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                  <span className="text-violet-600">리타겟 {retarget}</span>
                  <span className="text-blue-500">1차 {first}</span>
                  <span className="text-emerald-600">2차 {second}</span>
                  <span className="text-cyan-600">3차 {third}</span>
                </div>
              </button>
            ))}
            {currentStats.length === 0 && <p className="py-10 text-center text-sm text-slate-400">선택 월 데이터가 없습니다.</p>}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold text-slate-700">
              {selected ? `${selected} 시군구별 현황` : '시도를 선택하면 시군구 현황이 표시됩니다'}
            </p>
          </div>
          {selected ? (
            <div className="divide-y divide-slate-50">
              {districtStats.map(({ district, total, retarget, first, second, third }) => (
                <div key={district} className="px-4 py-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{district}</span>
                    <span className="text-sm font-bold text-slate-800">{total}건</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span className="text-violet-600">리타겟 {retarget}</span>
                    <span className="text-blue-500">1차 {first}</span>
                    <span className="text-emerald-600">2차 {second}</span>
                    <span className="text-cyan-600">3차 {third}</span>
                  </div>
                </div>
              ))}
              {districtStats.length === 0 && <p className="py-10 text-center text-sm text-slate-400">시군구 데이터가 없습니다.</p>}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-slate-300">좌측에서 시도를 선택하세요.</p>
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700">전체 지역 집계</p>
            <p className="text-[11px] text-slate-400">3차DB는 방문요청 전환이며 합계에는 중복 반영하지 않습니다.</p>
          </div>
        </div>
        <div className="divide-y divide-slate-50 md:hidden">
          {currentStats.map(({ prov, total, retarget, first, second, third }) => {
            const pct = grandTotal > 0 ? Math.round(total / grandTotal * 100) : 0
            return (
              <div key={prov} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">{prov}</span>
                  <span className="font-bold text-slate-800">{total}건 <span className="text-xs font-normal text-slate-400">{pct}%</span></span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                  <span className="rounded bg-violet-50 py-1 text-violet-700">리타겟 {retarget}</span>
                  <span className="rounded bg-blue-50 py-1 text-blue-700">1차 {first}</span>
                  <span className="rounded bg-emerald-50 py-1 text-emerald-700">2차 {second}</span>
                  <span className="rounded bg-cyan-50 py-1 text-cyan-700">3차 {third}</span>
                </div>
              </div>
            )
          })}
        </div>
        <table className="hidden w-full text-sm md:table">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="px-4 py-2.5 text-left text-xs font-medium">시도</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium">리타겟</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium">1차 DB</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium">2차 DB</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium" title="로켓방문요청 발생 월 기준">3차 DB</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium">합계</th>
              <th className="px-4 py-2.5 text-xs font-medium">비율</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {currentStats.map(({ prov, total, retarget, first, second, third }) => {
              const pct = grandTotal > 0 ? Math.round(total / grandTotal * 100) : 0
              return (
                <tr key={prov} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{prov}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-violet-600">{retarget}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-blue-600">{first}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-emerald-600">{second}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-cyan-600">{third}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-800">{total}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-xs text-slate-400">{pct}%</span>
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

function TrendCard({ title, icon, rows }: {
  title: string
  icon: 'up' | 'down'
  rows: Array<{ prov: string; total: number; previous: number; diff: number; rate: number }>
}) {
  const positive = icon === 'up'
  const Icon = positive ? TrendingUp : TrendingDown
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={14} className={positive ? 'text-emerald-500' : 'text-rose-500'} />
        <p className="text-sm font-semibold text-slate-700">{title}</p>
      </div>
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.prov} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-slate-700">{row.prov}</p>
              <p className="text-xs text-slate-400">전월 {row.previous}건 → 당월 {row.total}건</p>
            </div>
            <div className={clsx('text-right text-sm font-bold', positive ? 'text-emerald-600' : 'text-rose-600')}>
              {row.diff > 0 ? '+' : ''}{row.diff}건
              <p className="text-[11px] font-medium text-slate-400">{row.rate > 0 ? '+' : ''}{row.rate}%</p>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="rounded-lg bg-slate-50 py-6 text-center text-sm text-slate-400">비교할 지역 데이터가 없습니다.</p>}
      </div>
    </div>
  )
}
