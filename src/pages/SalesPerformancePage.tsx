import { useEffect, useMemo, useState } from 'react'
import { endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { RefreshCw, TrendingUp, Users } from 'lucide-react'
import clsx from 'clsx'
import { fetchLeads, fetchProjects } from '../lib/dataService'
import { baseStage } from '../lib/leadMetrics'
import { buildProjectAttribution, contractedProjects } from '../lib/projectMetrics'
import type { LeadRecord, ProjectRecord } from '../types'
import DataUpdatedAt from '../components/DataUpdatedAt'

const today = format(new Date(), 'yyyy-MM-dd')

function fmtKRW(value: number) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`
  if (value >= 10_000) return `${Math.round(value / 10_000)}만`
  return value.toLocaleString()
}

function monthRange(selectedDate: string) {
  const base = parseISO(selectedDate)
  return {
    start: format(startOfMonth(base), 'yyyy-MM-dd'),
    end: format(endOfMonth(base), 'yyyy-MM-dd'),
    label: format(base, 'yyyy년 MM월'),
  }
}

function previousMonthRange(selectedDate: string) {
  return monthRange(format(subMonths(parseISO(selectedDate), 1), 'yyyy-MM-dd'))
}

function cleanOwner(value?: string) {
  const owner = String(value || '').trim()
  if (!owner || owner === '-' || owner === '시스템') return '미배정'
  return owner
}

function leadSalesOwner(lead: LeadRecord) {
  return cleanOwner((lead as any).salesOwner)
}

function rankTone(index: number, total: number, contracts: number) {
  if (contracts <= 0) return 'bg-red-50/60'
  if (index < 3) return 'bg-emerald-50/70'
  if (index >= Math.max(total - 3, 0)) return 'bg-red-50/60'
  return ''
}

export default function SalesPerformancePage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [selectedDate, setSelectedDate] = useState(today)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [commissionRate, setCommissionRate] = useState(3)

  async function load() {
    setLoading(true)
    setNotice('')
    try {
      const [leadRows, projectRows] = await Promise.all([
        fetchLeads(),
        fetchProjects().catch(() => []),
      ])
      setLeads(leadRows)
      setProjects(projectRows)
      fetchLeads(undefined, undefined, { includeRawAttribution: true })
        .then(enrichedRows => {
          const hasSalesOwners = enrichedRows.some(lead => String((lead as any).salesOwner || '').trim())
          if (hasSalesOwners) setLeads(enrichedRows)
        })
        .catch(() => undefined)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '영업관리 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const range = monthRange(selectedDate)
  const previousRange = previousMonthRange(selectedDate)
  const assignedLeads = useMemo(() => {
    return leads.filter(lead =>
      lead.date >= range.start &&
      lead.date <= range.end &&
      baseStage(lead.dbTier) === 'second'
    )
  }, [leads, range.start, range.end])

  const contracts = useMemo(() => {
    return buildProjectAttribution(
      contractedProjects(projects).filter(project => project.contractDate >= range.start && project.contractDate <= range.end),
      leads
    )
  }, [projects, leads, range.start, range.end])

  const previousContracts = useMemo(() => {
    return buildProjectAttribution(
      contractedProjects(projects).filter(project => project.contractDate >= previousRange.start && project.contractDate <= previousRange.end),
      leads
    )
  }, [projects, leads, previousRange.start, previousRange.end])

  const cumulativeContracts = useMemo(() => {
    return buildProjectAttribution(
      contractedProjects(projects).filter(project => project.contractDate <= range.end),
      leads
    )
  }, [projects, leads, range.end])

  const ownerStats = useMemo(() => {
    const map = new Map<string, {
      owner: string
      assigned: number
      contracts: number
      previousContracts: number
      cumulativeContracts: number
      contractAmount: number
      avgContract: number
      contractRate: number
      commission: number
    }>()

    assignedLeads.forEach(lead => {
      const owner = leadSalesOwner(lead)
      const row = map.get(owner) || { owner, assigned: 0, contracts: 0, previousContracts: 0, cumulativeContracts: 0, contractAmount: 0, avgContract: 0, contractRate: 0, commission: 0 }
      row.assigned += 1
      map.set(owner, row)
    })

    contracts.forEach(project => {
      const owner = cleanOwner(project.attributedSalesOwner || project.salesOwner)
      const row = map.get(owner) || { owner, assigned: 0, contracts: 0, previousContracts: 0, cumulativeContracts: 0, contractAmount: 0, avgContract: 0, contractRate: 0, commission: 0 }
      row.contracts += 1
      row.contractAmount += project.contractAmount
      map.set(owner, row)
    })

    previousContracts.forEach(project => {
      const owner = cleanOwner(project.attributedSalesOwner || project.salesOwner)
      const row = map.get(owner) || { owner, assigned: 0, contracts: 0, previousContracts: 0, cumulativeContracts: 0, contractAmount: 0, avgContract: 0, contractRate: 0, commission: 0 }
      row.previousContracts += 1
      map.set(owner, row)
    })

    cumulativeContracts.forEach(project => {
      const owner = cleanOwner(project.attributedSalesOwner || project.salesOwner)
      const row = map.get(owner) || { owner, assigned: 0, contracts: 0, previousContracts: 0, cumulativeContracts: 0, contractAmount: 0, avgContract: 0, contractRate: 0, commission: 0 }
      row.cumulativeContracts += 1
      map.set(owner, row)
    })

    return Array.from(map.values()).map(row => ({
      ...row,
      avgContract: row.contracts > 0 ? Math.round(row.contractAmount / row.contracts) : 0,
      contractRate: row.assigned > 0 ? (row.contracts / row.assigned) * 100 : 0,
      commission: Math.round(row.contractAmount * (commissionRate / 100)),
    })).sort((a, b) => b.contracts - a.contracts || b.contractAmount - a.contractAmount || b.assigned - a.assigned)
  }, [assignedLeads, contracts, previousContracts, cumulativeContracts, commissionRate])

  const monthlyOwnerRows = useMemo(() => {
    const months = Array.from(new Set(contracts.map(project => project.contractDate.slice(0, 7)))).sort()
    return months.flatMap(month => {
      const rows = ownerStats.map(owner => {
        const ownerContracts = contracts.filter(project => project.contractDate.slice(0, 7) === month && cleanOwner(project.attributedSalesOwner || project.salesOwner) === owner.owner)
        return {
          month,
          owner: owner.owner,
          contracts: ownerContracts.length,
          amount: ownerContracts.reduce((sum, project) => sum + project.contractAmount, 0),
        }
      }).filter(row => row.contracts > 0 || row.amount > 0)
      return rows
    })
  }, [contracts, ownerStats])

  const totalAssigned = assignedLeads.length
  const totalContracts = contracts.length
  const totalAmount = contracts.reduce((sum, project) => sum + project.contractAmount, 0)
  const totalRate = totalAssigned > 0 ? (totalContracts / totalAssigned) * 100 : 0

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">영업관리</h1>
          <p className="mt-0.5 text-xs text-slate-500">{range.label} 계약 KPI · 담당자 성과 · 정산 기준표</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={selectedDate.slice(0, 7)} onChange={event => setSelectedDate(`${event.target.value}-01`)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700" />
          <DataUpdatedAt />
          <button onClick={load} className="btn-secondary"><RefreshCw size={13} className={clsx(loading && 'animate-spin')} /> 새로고침</button>
        </div>
      </div>

      {notice && <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{notice}</div>}

      <div className="grid gap-3 md:grid-cols-5">
        {[
          { label: '배정건수', value: `${totalAssigned.toLocaleString()}건`, sub: '컨설팅리스트 담당자 기준', tone: 'bg-blue-50 text-blue-700', icon: Users },
          { label: '계약건수', value: `${totalContracts.toLocaleString()}건`, sub: '프로젝트 실제 계약 기준', tone: 'bg-emerald-50 text-emerald-700', icon: TrendingUp },
          { label: '계약금액', value: `${fmtKRW(totalAmount)}원`, sub: '계약금액 합계', tone: 'bg-violet-50 text-violet-700', icon: TrendingUp },
          { label: '배정→계약율', value: `${totalRate.toFixed(1)}%`, sub: '계약건수 ÷ 배정건수', tone: 'bg-orange-50 text-orange-700', icon: TrendingUp },
          { label: '평균 계약금액', value: `${totalContracts > 0 ? fmtKRW(Math.round(totalAmount / totalContracts)) : 0}원`, sub: '계약금액 ÷ 계약건수', tone: 'bg-slate-50 text-slate-700', icon: TrendingUp },
        ].map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-800">{card.value}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{card.sub}</p>
                </div>
                <div className={clsx('flex h-9 w-9 items-center justify-center rounded-lg', card.tone)}>
                  <Icon size={16} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">영업담당자별 성과표</p>
            <p className="mt-0.5 text-xs text-slate-400">배정건수는 컨설팅리스트, 계약건수/계약금액은 프로젝트리스트 기준입니다.</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            정산 수수료율
            <input type="number" min="0" step="0.1" value={commissionRate} onChange={event => setCommissionRate(Number(event.target.value) || 0)} className="h-8 w-20 rounded-lg border border-slate-200 px-2 text-right text-sm text-slate-700" />
            %
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500">
                {['순위', '영업담당자', '배정건수', '계약건수(당월)', '계약건수(전월)', '계약건수 누적', '배정→계약율', '계약금액', '평균 계약금액', '정산 수수료'].map(header => <th key={header} className="px-4 py-3 text-right font-semibold first:text-left">{header}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ownerStats.map((row, index) => (
                <tr key={row.owner} className={clsx('hover:bg-slate-50', rankTone(index, ownerStats.length, row.contracts))}>
                  <td className="px-4 py-3 font-semibold text-slate-700">#{index + 1}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{row.owner}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{row.assigned.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{row.contracts.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{row.previousContracts.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-indigo-700">{row.cumulativeContracts.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{row.contractRate.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmtKRW(row.contractAmount)}원</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmtKRW(row.avgContract)}원</td>
                  <td className="px-4 py-3 text-right font-semibold text-indigo-700">{fmtKRW(row.commission)}원</td>
                </tr>
              ))}
              {!ownerStats.length && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400">조회기간 내 영업 성과 데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">계약 발생 리스트</p>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  {['계약일', '고객명', '영업담당자', '매체', '계약금액'].map(header => <th key={header} className="px-3 py-2 text-left font-medium">{header}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {contracts.map(project => (
                  <tr key={`${project.contractDate}_${project.phone}_${project.projectNumber}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-600">{project.contractDate}</td>
                    <td className="px-3 py-2 font-medium text-slate-700">{project.customerName || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{cleanOwner(project.attributedSalesOwner || project.salesOwner)}</td>
                    <td className="px-3 py-2 text-slate-600">{project.attributedSubChannel || '-'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmtKRW(project.contractAmount)}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">월별/담당자별 성과표</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  {['월', '영업담당자', '계약건수', '계약금액'].map(header => <th key={header} className="px-3 py-2 text-right font-medium first:text-left">{header}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monthlyOwnerRows.map(row => (
                  <tr key={`${row.month}_${row.owner}`}>
                    <td className="px-3 py-2 text-slate-600">{row.month}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-700">{row.owner}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">{row.contracts}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmtKRW(row.amount)}원</td>
                  </tr>
                ))}
                {!monthlyOwnerRows.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-400">월별 계약 데이터가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
