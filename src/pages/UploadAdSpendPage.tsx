// src/pages/UploadAdSpendPage.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle, DollarSign, FileSpreadsheet, RefreshCw, Save, Upload, X } from 'lucide-react'
import clsx from 'clsx'
import { parseAdSpendExcel, type ParsedAdSpendResult } from '../lib/excelParser'
import { fetchAdSpend, invalidateDataCache, uploadAdSpend } from '../lib/dataService'
import type { AdSpend, Channel } from '../types'

type Stage = 'idle' | 'parsing' | 'preview' | 'uploading' | 'done' | 'error'
type SpendColumnKey = 'naver_sa' | 'naver_gfa' | 'kakao_moment' | 'meta' | 'google_search' | 'google_demand_pmax' | 'danggeun' | 'viral'

const CHANNEL_LABELS: Record<Channel, string> = {
  naver: '네이버',
  google: '구글',
  meta: '메타',
  youtube: '유튜브',
  viral: '바이럴',
  danggeun: '당근',
  direct: '직접유입',
  kakao_search: '카카오 검색광고',
  kakao_moment: '카카오모먼트',
  tu_albarich: 'TU-알바리치',
  tu_youtube: 'TU-유튜브',
  tu_danggeun: 'TU-당근',
  hugreen_danggeun: '휴그린-당근',
  hugreen_mail: '휴그린-메일',
  inbound_call: '인바운드-인입콜',
  etc: '기타',
}

const SPEND_COLUMNS: Array<{
  key: SpendColumnKey
  label: string
  channel: Channel
  subChannel: string
  aliases: string[]
}> = [
  { key: 'naver_sa', label: '네이버 SA', channel: 'naver', subChannel: '네이버 SA', aliases: ['네이버 SA', '네이버SA', 'NAVER SA'] },
  { key: 'naver_gfa', label: '네이버 GFA', channel: 'naver', subChannel: '네이버 GFA', aliases: ['네이버 GFA', '네이버GFA', 'NAVER GFA'] },
  { key: 'kakao_moment', label: '카카오모먼트', channel: 'kakao_moment', subChannel: '카카오모먼트', aliases: ['카카오모먼트', '카카오 모먼트', 'kakao_moment'] },
  { key: 'meta', label: '메타', channel: 'meta', subChannel: '메타', aliases: ['메타', 'META', '페이스북', '인스타그램'] },
  { key: 'google_search', label: '구글 검색광고', channel: 'google', subChannel: '구글 검색광고', aliases: ['구글 검색광고', '구글검색광고', 'Google Search'] },
  { key: 'google_demand_pmax', label: '구글 디맨드젠+피맥스', channel: 'google', subChannel: '구글 디맨드젠+피맥스', aliases: ['구글 디맨드젠+피맥스', '구글 디맨드젠', '구글 디스커버리/GDN', '구글 디스커버리', '구글 GDN', '피맥스', 'P-MAX', 'PMAX'] },
  { key: 'danggeun', label: '당근마켓', channel: 'danggeun', subChannel: '당근', aliases: ['당근', '당근마켓', '당근 광고'] },
  { key: 'viral', label: '바이럴', channel: 'viral', subChannel: '바이럴', aliases: ['바이럴', '블로그', '최적블', '준최블'] },
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function thisYear() {
  return new Date().getFullYear()
}

function thisMonth() {
  return new Date().getMonth() + 1
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function monthDates(year: number, month: number) {
  const current = today()
  const currentYear = Number(current.slice(0, 4))
  const currentMonth = Number(current.slice(5, 7))
  const lastDay = year === currentYear && month === currentMonth ? Number(current.slice(8, 10)) : daysInMonth(year, month)
  return Array.from({ length: lastDay }, (_, index) => `${year}-${pad2(month)}-${pad2(index + 1)}`)
}

function parseAmount(value: string | number) {
  return Number(String(value || '').replace(/[^0-9]/g, '')) || 0
}

function fmtKRW(value: number) {
  return `${Math.round(value).toLocaleString()}원`
}

function fmtInput(value: number) {
  return value > 0 ? String(Math.round(value)) : ''
}

function normalizeLabel(value?: string) {
  return String(value || '').replace(/\s+/g, '').toLowerCase()
}

function columnForSpend(row: AdSpend) {
  const sub = normalizeLabel(row.subChannel)
  const channel = row.channel
  return SPEND_COLUMNS.find(column => {
    if (column.channel !== channel) return false
    return column.aliases.some(alias => normalizeLabel(alias) === sub) || normalizeLabel(column.subChannel) === sub
  })
}

function emptyDayValues(): Record<SpendColumnKey, string> {
  return SPEND_COLUMNS.reduce((acc, column) => {
    acc[column.key] = ''
    return acc
  }, {} as Record<SpendColumnKey, string>)
}

export default function UploadAdSpendPage() {
  const [stage, setStage] = useState<Stage>('idle')
  const [result, setResult] = useState<ParsedAdSpendResult | null>(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [spends, setSpends] = useState<AdSpend[]>([])
  const [loading, setLoading] = useState(true)
  const [savingDate, setSavingDate] = useState('')
  const [editingDate, setEditingDate] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Record<SpendColumnKey, string>>>({})
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [year, setYear] = useState(thisYear())
  const [month, setMonth] = useState(thisMonth())
  const inputRef = useRef<HTMLInputElement>(null)

  const dates = useMemo(() => monthDates(year, month), [year, month])
  const monthStart = `${year}-${pad2(month)}-01`
  const monthEnd = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`

  async function load(force = false) {
    setLoading(true)
    try {
      if (force) invalidateDataCache()
      setSpends(await fetchAdSpend(monthStart, monthEnd))
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '광고비를 불러오지 못했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(false) }, [monthStart, monthEnd])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const tableValues = useMemo(() => {
    const values: Record<string, Record<SpendColumnKey, number>> = {}
    dates.forEach(date => {
      values[date] = SPEND_COLUMNS.reduce((acc, column) => {
        acc[column.key] = 0
        return acc
      }, {} as Record<SpendColumnKey, number>)
    })

    spends.forEach(row => {
      if (!values[row.date]) return
      const column = columnForSpend(row)
      if (!column) return
      values[row.date][column.key] += row.amount
    })
    return values
  }, [dates, spends])

  const monthColumnTotals = useMemo(() => {
    return SPEND_COLUMNS.reduce((acc, column) => {
      acc[column.key] = dates.reduce((sum, date) => sum + (tableValues[date]?.[column.key] || 0), 0)
      return acc
    }, {} as Record<SpendColumnKey, number>)
  }, [dates, tableValues])

  const monthTotal = Object.values(monthColumnTotals).reduce((sum, value) => sum + value, 0)

  function beginEdit(date: string) {
    setEditingDate(date)
    setDrafts(prev => ({
      ...prev,
      [date]: SPEND_COLUMNS.reduce((acc, column) => {
        acc[column.key] = fmtInput(tableValues[date]?.[column.key] || 0)
        return acc
      }, {} as Record<SpendColumnKey, string>),
    }))
  }

  function setDraft(date: string, key: SpendColumnKey, value: string) {
    setDrafts(prev => ({
      ...prev,
      [date]: {
        ...(prev[date] || emptyDayValues()),
        [key]: value,
      },
    }))
  }

  function dayTotal(date: string, useDraft = false) {
    if (useDraft && drafts[date]) {
      return SPEND_COLUMNS.reduce((sum, column) => sum + parseAmount(drafts[date][column.key]), 0)
    }
    return SPEND_COLUMNS.reduce((sum, column) => sum + (tableValues[date]?.[column.key] || 0), 0)
  }

  async function saveDay(date: string) {
    const draft = drafts[date] || emptyDayValues()
    const records = SPEND_COLUMNS.map(column => ({
      date,
      channel: column.channel,
      subChannel: column.subChannel,
      campaign: `${year}년 ${pad2(month)}월 광고비`,
      amount: parseAmount(draft[column.key]),
      memo: '일자별 광고비 관리표',
      registrant: '시스템',
    }))

    setSavingDate(date)
    try {
      await uploadAdSpend(records, { replaceExisting: true })
      setNotice({ type: 'success', text: `${date} 광고비가 적용되었습니다.` })
      setEditingDate('')
      setDrafts(prev => {
        const next = { ...prev }
        delete next[date]
        return next
      })
      await load(true)
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '광고비 저장에 실패했습니다.' })
    } finally {
      setSavingDate('')
    }
  }

  async function handleFile(file: File) {
    setStage('parsing')
    try {
      const parsed = await parseAdSpendExcel(file)
      setResult(parsed)
      setStage('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStage('error')
    }
  }

  async function handleUpload(replaceExisting = false) {
    if (!result) return
    setStage('uploading')
    try {
      await uploadAdSpend(result.records, { replaceExisting })
      await load(true)
      setStage('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStage('error')
    }
  }

  function reset() {
    setStage('idle')
    setResult(null)
    setError('')
  }

  const totalSpend = result?.records.reduce((sum, row) => sum + row.amount, 0) ?? 0

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">광고비 업로드</h1>
          <p className="mt-0.5 text-xs text-slate-500">엑셀 업로드와 일자별 상세매체 광고비 수정을 관리합니다.</p>
        </div>
        <button onClick={() => load(true)} className="btn-secondary" disabled={loading}>
          <RefreshCw size={13} className={clsx(loading && 'animate-spin')} /> 새로고침
        </button>
      </div>

      {notice && (
        <div className={clsx('fixed right-4 top-4 z-[70] min-w-[280px] rounded-lg border px-4 py-3 text-sm shadow-lg', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700')}>
          {notice.text}
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">일자별 광고비 관리</p>
            <p className="mt-1 text-xs text-slate-400">월을 선택하면 1일부터 현재일 또는 월말까지 상세매체별 광고비를 가로형으로 수정합니다.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex">
            <label className="space-y-1 text-xs text-slate-500">
              년도
              <select value={year} onChange={event => setYear(Number(event.target.value))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                {Array.from({ length: 5 }, (_, index) => thisYear() - 2 + index).map(value => <option key={value} value={value}>{value}년</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-500">
              월
              <select value={month} onChange={event => setMonth(Number(event.target.value))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                {Array.from({ length: 12 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{pad2(value)}월</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[1220px] w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
              <tr>
                <th className="w-[90px] px-3 py-3 text-left font-semibold">날짜</th>
                {SPEND_COLUMNS.map(column => <th key={column.key} className="min-w-[130px] px-2 py-3 text-right font-semibold">{column.label}</th>)}
                <th className="min-w-[120px] px-3 py-3 text-right font-semibold">합계</th>
                <th className="w-[120px] px-3 py-3 text-center font-semibold">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {dates.map(date => {
                const editing = editingDate === date
                const total = dayTotal(date, editing)
                return (
                  <tr key={date} className={clsx('hover:bg-slate-50/70', editing && 'bg-blue-50/40')}>
                    <td className="px-3 py-2 font-medium text-slate-700">{Number(date.slice(8, 10))}일</td>
                    {SPEND_COLUMNS.map(column => {
                      const value = editing ? drafts[date]?.[column.key] || '' : fmtKRW(tableValues[date]?.[column.key] || 0)
                      return (
                        <td key={column.key} className="px-2 py-2 text-right">
                          {editing ? (
                            <input
                              inputMode="numeric"
                              value={value}
                              onChange={event => setDraft(date, column.key, event.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-xs focus:border-blue-400 focus:outline-none"
                              placeholder="0"
                            />
                          ) : (
                            <span className={clsx('font-medium', tableValues[date]?.[column.key] ? 'text-slate-700' : 'text-slate-300')}>{value}</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right font-bold text-slate-800">{fmtKRW(total)}</td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <div className="flex justify-center gap-1">
                          <button onClick={() => saveDay(date)} disabled={savingDate === date} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                            <Save size={12} /> 적용
                          </button>
                          <button onClick={() => setEditingDate('')} className="rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-500">취소</button>
                        </div>
                      ) : (
                        <button onClick={() => beginEdit(date)} className="mx-auto block rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">수정</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 text-slate-700">
              <tr>
                <td className="px-3 py-3 font-bold">월 합계</td>
                {SPEND_COLUMNS.map(column => <td key={column.key} className="px-2 py-3 text-right font-bold">{fmtKRW(monthColumnTotals[column.key])}</td>)}
                <td className="px-3 py-3 text-right font-extrabold text-blue-700">{fmtKRW(monthTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {(stage === 'idle' || stage === 'parsing') && (
        <div
          onDragOver={event => { event.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={event => { event.preventDefault(); setDragOver(false); const file = event.dataTransfer.files[0]; if (file) handleFile(file) }}
          onClick={() => inputRef.current?.click()}
          className={clsx('card flex cursor-pointer flex-col items-center gap-4 border-2 border-dashed p-10 transition-colors', dragOver ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50')}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) handleFile(file) }} />
          {stage === 'parsing' ? (
            <>
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
              <p className="text-sm text-slate-500">파일 분석 중...</p>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50">
                <FileSpreadsheet size={22} className="text-violet-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">광고비 엑셀 파일 업로드</p>
                <p className="mt-1 text-xs text-slate-400">.xlsx, .xls, .csv 지원</p>
              </div>
            </>
          )}
        </div>
      )}

      {stage === 'preview' && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="card border-violet-100 bg-violet-50 p-4">
              <p className="text-xs font-medium text-violet-500">총 광고비</p>
              <p className="mt-1 text-xl font-bold text-violet-700">{fmtKRW(totalSpend)}</p>
            </div>
            <div className="card border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-medium text-blue-500">레코드 수</p>
              <p className="mt-1 text-xl font-bold text-blue-700">{result.records.length}건</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-medium text-slate-500">업로드 방식</p>
              <p className="mt-1 text-sm font-bold text-slate-700">추가 저장 또는 같은 날짜+매체 교체</p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-semibold text-slate-600">미리보기 상위 15건</p>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-3 py-2 text-left font-medium">날짜</th>
                  <th className="px-3 py-2 text-left font-medium">매체</th>
                  <th className="px-3 py-2 text-left font-medium">상세매체</th>
                  <th className="px-3 py-2 text-right font-medium">광고비</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {result.records.slice(0, 15).map((row, index) => (
                  <tr key={`${row.date}_${row.channel}_${row.subChannel}_${index}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-600">{row.date}</td>
                    <td className="px-3 py-2"><span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-600">{CHANNEL_LABELS[row.channel]}</span></td>
                    <td className="px-3 py-2 text-slate-600">{row.subChannel || '-'}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-700">{fmtKRW(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={() => handleUpload(false)} className="btn-primary"><Upload size={14} /> {result.records.length}건 추가 저장</button>
            <button onClick={() => handleUpload(true)} className="btn-secondary">같은 날짜+매체 기존 광고비 교체</button>
            <button onClick={reset} className="btn-secondary"><X size={14} /> 취소</button>
          </div>
        </div>
      )}

      {stage === 'uploading' && (
        <div className="card flex flex-col items-center gap-4 p-12">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-sm text-slate-600">저장 중...</p>
        </div>
      )}

      {stage === 'done' && (
        <div className="card flex flex-col items-center gap-4 p-12">
          <CheckCircle size={40} className="text-emerald-500" />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">저장 완료</p>
            <p className="mt-1 text-xs text-slate-400">대시보드와 CPL 계산에 반영됩니다.</p>
          </div>
          <button onClick={reset} className="btn-secondary">새 파일 업로드</button>
        </div>
      )}

      {stage === 'error' && (
        <div className="card flex flex-col items-center gap-3 p-8">
          <AlertCircle size={32} className="text-red-500" />
          <p className="text-sm font-medium text-slate-700">오류가 발생했습니다</p>
          <p className="rounded-lg bg-red-50 px-3 py-2 font-mono text-xs text-red-500">{error}</p>
          <button onClick={reset} className="btn-secondary">다시 시도</button>
        </div>
      )}

      <div className="card p-5 text-xs text-slate-500">
        <p className="font-semibold text-slate-600">저장 기준</p>
        <p className="mt-1">일자별 관리표의 적용 버튼은 해당 날짜의 상세매체 광고비를 AD_SPEND에 저장합니다. 오른쪽 합계와 월 합계는 화면 계산값이며 별도로 저장하지 않습니다.</p>
      </div>
    </div>
  )
}
