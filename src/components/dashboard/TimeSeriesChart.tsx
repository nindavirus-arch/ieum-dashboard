// src/components/dashboard/TimeSeriesChart.tsx
import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { format, eachDayOfInterval, eachMonthOfInterval, parseISO, startOfMonth, endOfMonth, startOfYear, endOfYear, subYears } from 'date-fns'
import type { LeadRecord, AdSpend, ViewMode } from '../../types'
import { isPaidChannel, trafficGroup } from '../../lib/leadMetrics'

interface Props {
  leads: LeadRecord[]
  spends: AdSpend[]
  viewMode: ViewMode
  selectedDate: string
}

function safeDate(date: string) {
  try {
    const d = parseISO(date)
    if (!Number.isNaN(d.getTime())) return d
  } catch {}
  return new Date()
}

export default function TimeSeriesChart({ leads, spends, viewMode, selectedDate }: Props) {
  const data = useMemo(() => {
    const base = safeDate(selectedDate)

    if (viewMode === 'daily') {
      const days = eachDayOfInterval({ start: startOfMonth(base), end: endOfMonth(base) })
      return days.map(d => {
        const key = format(d, 'yyyy-MM-dd')
        const matched = leads.filter(l => l.date === key)
        const paidDb = matched.filter(l => trafficGroup(l) === 'paid').length
        const organicDb = matched.filter(l => trafficGroup(l) === 'organic').length
        const externalDb = matched.filter(l => trafficGroup(l) === 'external').length
        const unclassifiedDb = matched.filter(l => trafficGroup(l) === 'unclassified').length
        const spend = spends.filter(s => s.date === key && isPaidChannel(s.channel)).reduce((a, b) => a + b.amount, 0)
        return { label: format(d, 'd일'), paidDb, organicDb, externalDb, unclassifiedDb, spend: Math.round(spend / 10000) }
      })
    }

    if (viewMode === 'monthly') {
      const months = eachMonthOfInterval({ start: startOfYear(base), end: endOfYear(base) })
      return months.map(m => {
        const key = format(m, 'yyyy-MM')
        const matched = leads.filter(l => l.date.startsWith(key))
        const paidDb = matched.filter(l => trafficGroup(l) === 'paid').length
        const organicDb = matched.filter(l => trafficGroup(l) === 'organic').length
        const externalDb = matched.filter(l => trafficGroup(l) === 'external').length
        const unclassifiedDb = matched.filter(l => trafficGroup(l) === 'unclassified').length
        const spend = spends.filter(s => s.date.startsWith(key) && isPaidChannel(s.channel)).reduce((a, b) => a + b.amount, 0)
        return { label: format(m, 'MM월'), paidDb, organicDb, externalDb, unclassifiedDb, spend: Math.round(spend / 10000) }
      })
    }

    // yearly: 선택연 기준 최근 5년 추이
    const start = subYears(startOfYear(base), 4)
    const years: Date[] = []
    for (let y = start.getFullYear(); y <= base.getFullYear(); y++) years.push(new Date(y, 0, 1))
    return years.map(yDate => {
      const key = format(yDate, 'yyyy')
      const matched = leads.filter(l => l.date.startsWith(key))
      const paidDb = matched.filter(l => trafficGroup(l) === 'paid').length
      const organicDb = matched.filter(l => trafficGroup(l) === 'organic').length
      const externalDb = matched.filter(l => trafficGroup(l) === 'external').length
      const unclassifiedDb = matched.filter(l => trafficGroup(l) === 'unclassified').length
      const spend = spends.filter(s => s.date.startsWith(key) && isPaidChannel(s.channel)).reduce((a, b) => a + b.amount, 0)
      return { label: format(yDate, 'yyyy년'), paidDb, organicDb, externalDb, unclassifiedDb, spend: Math.round(spend / 10000) }
    })
  }, [leads, spends, viewMode, selectedDate])

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="dbGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="externalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#64748b" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
          formatter={(val: number, name: string) => {
            if (name === 'paidDb') return [`${val}건`, '온라인광고 DB']
            if (name === 'organicDb') return [`${val}건`, '온라인 직접·자연유입']
            if (name === 'externalDb') return [`${val}건`, '외부유입 DB']
            if (name === 'unclassifiedDb') return [`${val}건`, '미분류 DB']
            return [`${val}만원`, '광고비']
          }}
        />
        <Legend
          iconType="circle" iconSize={7}
          formatter={(val) => val === 'paidDb' ? '온라인광고' : val === 'organicDb' ? '온라인 직접·자연' : val === 'externalDb' ? '외부·제휴' : val === 'unclassifiedDb' ? '미분류' : '광고비(만)'}
          wrapperStyle={{ fontSize: 11 }}
        />
        <Area type="monotone" dataKey="paidDb" stroke="#3b82f6" strokeWidth={2} fill="url(#dbGrad)" dot={false} />
        <Area type="monotone" dataKey="organicDb" stroke="#14b8a6" strokeWidth={2} fill="none" dot={false} />
        <Area type="monotone" dataKey="externalDb" stroke="#64748b" strokeWidth={2} fill="url(#externalGrad)" dot={false} />
        <Area type="monotone" dataKey="unclassifiedDb" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="4 4" fill="none" dot={false} />
        <Area type="monotone" dataKey="spend" stroke="#8b5cf6" strokeWidth={2} fill="url(#spendGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
