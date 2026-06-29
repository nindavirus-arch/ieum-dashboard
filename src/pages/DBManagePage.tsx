// src/pages/DBManagePage.tsx
import { useEffect, useMemo, useState } from 'react'
import { format, startOfMonth, endOfMonth, subDays, startOfYear, endOfYear } from 'date-fns'
import { RefreshCw, Search, Pencil, Plus, X, Save, ChevronDown, History, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { createManualLead, fetchLeads, fetchMappings, updateLeadAttribution, type MappingRow } from '../lib/dataService'
import type { Channel, DBTier, LeadRecord } from '../types'
import { buildLeadJourneys } from '../lib/leadMetrics'

const CHANNELS: Channel[] = ['naver', 'google', 'meta', 'youtube', 'viral', 'kakao_search', 'kakao_moment', 'direct', 'tu_albarich', 'tu_youtube', 'tu_danggeun', 'hugreen_danggeun', 'hugreen_mail', 'inbound_call', 'etc']
const CHANNEL_LABELS: Record<Channel, string> = {
  naver: '네이버', google: '구글', meta: '메타', youtube: '유튜브', viral: '바이럴', direct: '직접유입',
  kakao_search: '카카오 검색광고', kakao_moment: '카카오모먼트',
  tu_albarich: 'TU-알바리치', tu_youtube: 'TU-유튜브', tu_danggeun: 'TU-당근',
  hugreen_danggeun: '휴그린-당근', hugreen_mail: '휴그린-메일', inbound_call: '인바운드-인입콜', etc: '기타'
}
const STAGES: DBTier[] = ['retarget', 'first', 'second', 'first_reentry', 'second_reentry']
const STAGE_LABELS: Record<DBTier, string> = {
  retarget: '리타겟DB', first: '1차DB', second: '2차DB', first_reentry: '1차 재인입', second_reentry: '2차 재인입'
}
const CONSULT_RESULTS = ['단순문의', '방문배정', '부분시공', '견적중', '부재중', '중복']

const BRAND_KEYS = [
  { label: 'KCC', keys: ['kcc', 'KCC'] },
  { label: 'LX', keys: ['lx', 'LX', 'zin', 'ZIN'] },
  { label: '휴그린', keys: ['hugreen', '휴그린'] },
  { label: '한샘', keys: ['hanssem', '한샘'] },
  { label: '홈씨씨', keys: ['homecc', '홈씨씨', 'homeCC'] },
  { label: '재현하늘창', keys: ['jh', '재현하늘창', 'jaehyun'] },
]

type QuoteRow = { brand: string; price: string }

function today() { return format(new Date(), 'yyyy-MM-dd') }
function thisMonth() { return format(new Date(), 'yyyy-MM') }
function thisYear() { return format(new Date(), 'yyyy') }
function dateRange(period: string, selectedDate: string, selectedMonth: string, selectedYear: string) {
  const now = new Date()
  if (period === 'today') return { start: today(), end: today(), label: '오늘' }
  if (period === '7d') return { start: format(subDays(now, 6), 'yyyy-MM-dd'), end: today(), label: '최근 7일' }
  if (period === 'month') { const d = new Date(`${selectedMonth}-01T00:00:00`); return { start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd'), label: selectedMonth } }
  if (period === 'year') { const d = new Date(`${selectedYear}-01-01T00:00:00`); return { start: format(startOfYear(d), 'yyyy-MM-dd'), end: format(endOfYear(d), 'yyyy-MM-dd'), label: selectedYear } }
  if (period === 'day') return { start: selectedDate, end: selectedDate, label: selectedDate }
  return { start: undefined, end: undefined, label: '전체' }
}
function stageBadge(stage: DBTier) {
  if (stage === 'second' || stage === 'second_reentry') return 'bg-emerald-50 text-emerald-700 border-emerald-100'
  if (stage === 'first' || stage === 'first_reentry') return 'bg-blue-50 text-blue-700 border-blue-100'
  return 'bg-violet-50 text-violet-700 border-violet-100'
}
function uniq(arr: string[]) { return Array.from(new Set(arr.filter(Boolean))) }
function fmtDateTime(row: LeadRecord) {
  const v = String((row as any).registeredAt || row.uploadedAt || row.date || '')
  if (!v) return '-'
  const cleaned = v.replace('T', ' ').replace('Z', '')
  const compact = cleaned.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{1,2})/)
  if (compact) return `${compact[1]} ${compact[2].padStart(2, '0')}:${compact[3].padStart(2, '0')}`
  if (cleaned.length >= 16) return cleaned.slice(0, 16)
  return `${row.date}${cleaned && cleaned !== row.date ? ' ' + cleaned : ''}`.trim()
}
function sortTime(row: LeadRecord) {
  const display = fmtDateTime(row)
  const normalized = display.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{1,2}).*$/, (_, d, h, m) => `${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  const parsed = new Date(normalized.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}
function normalizeMoney(v: unknown) {
  const raw = String(v ?? '').replace(/,/g, '').trim()
  if (!raw || raw === '0') return ''
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  // 기존 params는 만원 단위인 경우가 많아 숫자만 보기 좋게 표시
  return `${n.toLocaleString()}만원`
}
function decodeParams(row: LeadRecord) {
  const params = String((row as any).params || '')
  if (!params) return ''
  try { return decodeURIComponent(params.replace(/\+/g, ' ')) } catch { return params }
}
function parseQueryLike(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!text) return out
  const q = text.includes('?') ? text.split('?').slice(1).join('?') : text
  q.split(/[&\n]/).forEach(part => {
    const [k, ...rest] = part.split('=')
    if (!k || rest.length === 0) return
    out[k.trim()] = rest.join('=').trim()
  })
  return out
}
function quoteRows(row: LeadRecord): QuoteRow[] {
  const decoded = decodeParams(row)
  if (!decoded) return []
  let obj: Record<string, any> = {}
  try {
    const maybeJson = decoded.trim()
    if (maybeJson.startsWith('{')) obj = JSON.parse(maybeJson)
  } catch {}
  obj = { ...parseQueryLike(decoded), ...obj }

  // 쿼리/JSON으로 못 읽은 경우 정규식으로 브랜드=가격만 추출
  BRAND_KEYS.forEach(({ keys }) => {
    keys.forEach(k => {
      if (obj[k] !== undefined) return
      const re = new RegExp(`${k}\\s*[:=]\\s*([0-9,]+)`, 'i')
      const m = decoded.match(re)
      if (m) obj[k] = m[1]
    })
  })

  return BRAND_KEYS.map(({ label, keys }) => {
    const foundKey = keys.find(k => obj[k] !== undefined && String(obj[k]).trim() !== '')
    return foundKey ? { brand: label, price: normalizeMoney(obj[foundKey]) } : null
  }).filter((r): r is QuoteRow => !!r && !!r.price)
}
function shortAddress(row: LeadRecord) {
  const addr = String((row as any).address || '')
  const building = String((row as any).building || '')
  if (addr && building && !addr.includes(building)) return `${addr} ${building}`
  return addr || building || '-'
}

function mediaLabel(row: LeadRecord) {
  if (row.channel === 'tu_albarich' || row.channel === 'tu_youtube' || row.channel === 'tu_danggeun') return 'TU'
  if (row.channel === 'hugreen_danggeun' || row.channel === 'hugreen_mail') return '휴그린'
  if (row.channel === 'inbound_call') return '인바운드'
  return CHANNEL_LABELS[row.channel]
}

function detailLabel(row: LeadRecord) {
  if (row.channel === 'tu_albarich') return '알바리치'
  if (row.channel === 'tu_youtube') return '유튜브'
  if (row.channel === 'tu_danggeun') return '당근'
  if (row.channel === 'hugreen_danggeun') return '당근'
  if (row.channel === 'hugreen_mail') return '메일'
  if (row.channel === 'inbound_call') return '인입콜'
  return row.subChannel || '-'
}

function QuotePanel({ rows }: { rows: QuoteRow[] }) {
  if (!rows.length) return null
  return <div className="mt-2 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 max-w-[360px]">
    <div className="grid grid-cols-2 bg-white text-[11px] font-semibold text-slate-500 border-b border-slate-100">
      <div className="px-3 py-2">브랜드</div>
      <div className="px-3 py-2 text-right">견적가</div>
    </div>
    {rows.map(r => <div key={r.brand} className="grid grid-cols-2 text-xs border-b border-slate-100 last:border-b-0">
      <div className="px-3 py-2 text-slate-600">{r.brand}</div>
      <div className="px-3 py-2 text-right font-semibold text-slate-800">{r.price}</div>
    </div>)}
  </div>
}

function StageHistoryPanel({ rows }: { rows: LeadRecord[] }) {
  if (!rows.length) return null
  return <div className="mt-2 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 min-w-[280px]">
    {[...rows].sort((a, b) => sortTime(b) - sortTime(a)).map((row, index) => (
      <div key={`${row.phone}_${row.dbTier}_${row.date}_${index}`} className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0">
        <div>
          <div className="text-[11px] text-slate-500">{fmtDateTime(row)}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{mediaLabel(row)} · {detailLabel(row)}</div>
        </div>
        <span className={clsx('shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium', stageBadge(row.dbTier))}>{STAGE_LABELS[row.dbTier]}</span>
      </div>
    ))}
  </div>
}

export default function DBManagePage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [mappings, setMappings] = useState<MappingRow[]>([])
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState<'all' | 'history' | DBTier>('all')
  const [period, setPeriod] = useState<'today' | '7d' | 'month' | 'year' | 'day' | 'all'>('month')
  const [selectedDate, setSelectedDate] = useState(today())
  const [selectedMonth, setSelectedMonth] = useState(thisMonth())
  const [selectedYear, setSelectedYear] = useState(thisYear())
  const [channel, setChannel] = useState<'all' | Channel>('all')
  const [operatorFilter, setOperatorFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [keyword, setKeyword] = useState('')
  const [editing, setEditing] = useState<LeadRecord | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [openQuote, setOpenQuote] = useState<string>('')
  const [openHistory, setOpenHistory] = useState<string>('')
  const [openStageHistory, setOpenStageHistory] = useState<string>('')
  const range = dateRange(period, selectedDate, selectedMonth, selectedYear)

  async function load() {
    setLoading(true)
    try {
      const [l, m] = await Promise.all([fetchLeads(undefined, undefined, { includeRawMeta: true }), fetchMappings()])
      setLeads(l)
      setMappings(m)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const subChannelOptions = useMemo(() => {
    const fromMap = mappings.map(m => m.subChannel)
    const base = ['네이버 SA', '네이버 GFA', '네이버 브랜드검색', '구글 검색광고', '구글 디맨드젠', '구글 디스커버리/GDN', '메타', '유튜브', '블로그', '카페', '레뷰', '박람회', '카카오 검색광고', '카카오모먼트', '휴그린본사', 'TU', '홈페이지 직접유입', '인바운드콜', '직접영업', '기타']
    return uniq([...fromMap, ...base])
  }, [mappings])

  const operatorOptions = useMemo(() => uniq(leads.map(l => String((l as any).operator || '').trim())).sort(), [leads])
  const journeys = useMemo(() => buildLeadJourneys(leads), [leads])
  const currentLeads = useMemo(() => journeys.map(journey => ({ ...journey.lead, dbTier: journey.finalTier })), [journeys])
  const inSelectedRange = (lead: LeadRecord) => (!range.start || lead.date >= range.start) && (!range.end || lead.date <= range.end)
  const currentPeriodLeads = currentLeads.filter(inSelectedRange)
  const rawPeriodLeads = leads.filter(inSelectedRange)
  const displayLeads = stage === 'history' ? rawPeriodLeads : currentPeriodLeads
  const previousByPhone = useMemo(() => {
    const map = new Map<string, LeadRecord[]>()
    journeys.forEach(journey => {
      const finalTime = sortTime(journey.lead)
      let finalSkipped = false
      const previous = journey.records.filter(record => {
        const isFinal = !finalSkipped && record.dbTier === journey.finalTier && record.date === journey.lead.date && sortTime(record) === finalTime
        if (isFinal) finalSkipped = true
        return !isFinal
      })
      if (previous.length) map.set(journey.lead.phone, previous)
    })
    return map
  }, [journeys])

  const filtered = displayLeads
    .filter(l => stage === 'all' || stage === 'history' ? true : l.dbTier === stage)
    .filter(l => channel === 'all' ? true : l.channel === channel)
    .filter(l => operatorFilter === 'all' ? true : String((l as any).operator || '').trim() === operatorFilter)
    .filter(l => {
      const q = keyword.replace(/[^0-9a-zA-Z가-힣]/g, '').toLowerCase()
      if (!q) return true
      const hay = `${l.name}${l.phone}${l.rawPhone}${l.region}${l.district}${(l as any).source_raw}${l.subChannel}${l.channel}${(l as any).memo}${(l as any).operator}${(l as any).consultationResult}${shortAddress(l)}`.replace(/[^0-9a-zA-Z가-힣]/g, '').toLowerCase()
      return hay.includes(q)
    })
    .sort((a, b) => sortOrder === 'desc' ? sortTime(b) - sortTime(a) : sortTime(a) - sortTime(b))

  const counts: Record<string, number> = { all: currentPeriodLeads.length, history: rawPeriodLeads.length }
  STAGES.forEach(s => counts[s] = currentPeriodLeads.filter(l => l.dbTier === s).length)
  async function saveEdit(row: LeadRecord, next: any) {
    setSaving(true)
    setNotice(null)
    try {
      await updateLeadAttribution({ phone: row.phone, stage: row.dbTier, date: row.date, ...next })
      setEditing(null)
      await load()
      setNotice({ type: 'success', text: 'DB 정보가 수정되었습니다.' })
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'DB 수정에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }
  async function deleteLead(row: LeadRecord) {
    if (!window.confirm(`${row.name || row.phone || '선택한 DB'}를 삭제 처리할까요?`)) return
    setSaving(true)
    setNotice(null)
    try {
      await updateLeadAttribution({
        phone: row.phone,
        stage: row.dbTier,
        date: row.date,
        channel: row.channel,
        subChannel: row.subChannel || '',
        sourceRaw: (row as any).source_raw || '',
        consultationResult: (row as any).consultationResult || '',
        memo: (row as any).memo || '',
        operator: (row as any).operator || '',
        status: 'deleted',
      })
      await load()
      setNotice({ type: 'success', text: '삭제되었습니다.' })
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '삭제 처리에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }
  async function saveManual(form: any) { setSaving(true); try { await createManualLead(form); setManualOpen(false); await load() } finally { setSaving(false) } }

  return <div className="p-4 md:p-6 space-y-5">
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4"><div><h1 className="text-lg font-bold text-slate-800">DB관리</h1><p className="text-xs text-slate-500 mt-0.5">DB 리스트 조회, 상담결과/유입경로 수정, 인바운드 수기등록을 관리합니다.</p></div><div className="flex gap-2"><button onClick={() => setManualOpen(true)} className="btn-primary"><Plus size={14}/> 수기등록</button><button onClick={load} className="btn-secondary"><RefreshCw size={13} className={clsx(loading && 'animate-spin')} /> 새로고침</button></div></div>
    {notice && <div className={clsx('rounded-lg border px-4 py-3 text-sm', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700')}>{notice.text}</div>}
    <div className="card p-4 space-y-4"><div className="flex flex-wrap items-center gap-2">{[
      ['all','현재 상담대상',counts.all],
      ...STAGES.map(s => [s, STAGE_LABELS[s], counts[s]]),
      ['history','전체 원본 이력',counts.history],
    ].map(([v,label,count]) => <button key={String(v)} onClick={() => setStage(v as any)} className={clsx('tab-btn', stage === v && 'active', v === 'history' && stage !== 'history' && 'text-slate-500')}>{label} <span className="opacity-70">{Number(count).toLocaleString()}</span></button>)}</div><div className="grid grid-cols-1 md:grid-cols-12 gap-3"><select value={period} onChange={e => setPeriod(e.target.value as any)} className="md:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"><option value="today">오늘</option><option value="7d">최근 7일</option><option value="day">일자 선택</option><option value="month">월별</option><option value="year">연별</option><option value="all">전체</option></select>{period === 'day' && <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="md:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" />}{period === 'month' && <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="md:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" />}{period === 'year' && <input type="number" min="2024" max="2030" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="md:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" />}<select value={channel} onChange={e => setChannel(e.target.value as any)} className="md:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"><option value="all">전체 매체</option>{CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}</select><select value={operatorFilter} onChange={e => setOperatorFilter(e.target.value)} className="md:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"><option value="all">전체 작업자</option>{operatorOptions.map(o => <option key={o} value={o}>{o}</option>)}</select><select value={sortOrder} onChange={e => setSortOrder(e.target.value as 'desc' | 'asc')} className="md:col-span-1 rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"><option value="desc">최신순</option><option value="asc">오래된순</option></select><div className="md:col-span-2 relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="이름/연락처/지역/상담결과/메모 검색" className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm" /></div><div className="md:col-span-1 flex items-center md:justify-end text-xs text-slate-500">{range.label} · {filtered.length.toLocaleString()}건</div></div></div>
    <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
      <b>상담대상 기준</b> 기본 탭은 연락처별 최종 단계 한 건만 표시합니다. 이전 단계는 고객 행에서 확인하고, 모든 단계 행은 전체 원본 이력 탭에서 볼 수 있습니다.
    </div>

    <div className="space-y-3 md:hidden">
      {filtered.map((l, idx) => {
        const key = `${l.phone}_${l.dbTier}_${l.date}_${idx}`
        const quotes = quoteRows(l)
        const history = String((l as any).changeHistory || '')
        const previousRows = stage === 'history' ? [] : (previousByPhone.get(l.phone) || [])
        return <div key={key} className="card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3"><div><div className="text-[11px] text-slate-400">DB 유입/신청일시</div><div className="text-xs text-slate-500">{fmtDateTime(l)}</div><div className="font-semibold text-slate-800 mt-1">{l.name || '-'}</div><div className="text-sm text-slate-500">{l.phone || '-'}</div></div><span className={clsx('px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap', stageBadge(l.dbTier))}>{STAGE_LABELS[l.dbTier]}</span></div>
          {(l as any).memo && <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800"><b>메모</b> {(l as any).memo}</div>}
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600"><div><b>지역</b><br/>{l.region} {l.district}</div><div><b>상담결과</b><br/>{(l as any).consultationResult || '-'}</div><div className="col-span-2"><b>주소</b><br/>{shortAddress(l)}</div><div><b>매체</b><br/>{mediaLabel(l)}</div><div><b>상세매체</b><br/>{detailLabel(l)}</div><div><b>작업자</b><br/>{(l as any).operator || '-'}</div><div><b>상태</b><br/>{l.status || 'valid'}</div></div>
          {quotes.length > 0 && <div><button onClick={() => setOpenQuote(openQuote === key ? '' : key)} className="inline-flex items-center gap-1 text-blue-600 text-sm font-medium"><ChevronDown size={14} className={clsx(openQuote === key && 'rotate-180')} /> 외부창 견적</button>{openQuote === key && <QuotePanel rows={quotes} />}</div>}
          {previousRows.length > 0 && <div><button onClick={() => setOpenStageHistory(openStageHistory === key ? '' : key)} className="inline-flex items-center gap-1 text-slate-600 text-sm font-medium"><History size={13}/> 이전 단계 이력 {previousRows.length}건</button>{openStageHistory === key && <StageHistoryPanel rows={previousRows} />}</div>}
          {history && <div><button onClick={() => setOpenHistory(openHistory === key ? '' : key)} className="inline-flex items-center gap-1 text-slate-500 text-sm font-medium"><History size={13}/> 수정이력</button>{openHistory === key && <pre className="mt-2 p-2 rounded-lg bg-slate-50 text-slate-500 whitespace-pre-wrap text-xs">{history}</pre>}</div>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setEditing(l)} className="inline-flex justify-center items-center gap-1 px-3 py-2 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm"><Pencil size={13}/> 수정</button>
            <button onClick={() => deleteLead(l)} disabled={saving} className="inline-flex justify-center items-center gap-1 px-3 py-2 rounded-md border border-red-100 hover:bg-red-50 text-red-600 text-sm"><Trash2 size={13}/> 삭제</button>
          </div>
        </div>
      })}
      {!filtered.length && <div className="card p-8 text-center text-slate-400 text-sm">조회된 DB가 없습니다.</div>}
    </div>

    <div className="card overflow-hidden hidden md:block">
      <div className="overflow-auto max-h-[680px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-100">
            <tr className="text-slate-500">
              {['DB 유입/신청일시','DB유형','고객정보','지역','주소','상담결과','작업자','매체','상세매체','유입경로 원본','상태','관리'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((l, idx) => {
              const key = `${l.phone}_${l.dbTier}_${l.date}_${idx}`
              const quotes = quoteRows(l)
              const history = String((l as any).changeHistory || '')
              const previousRows = stage === 'history' ? [] : (previousByPhone.get(l.phone) || [])
              return <tr key={key} className="align-top hover:bg-slate-50/70">
                <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{fmtDateTime(l)}</td>
                <td className="px-3 py-3 whitespace-nowrap"><span className={clsx('px-2 py-0.5 rounded-md border font-medium', stageBadge(l.dbTier))}>{STAGE_LABELS[l.dbTier]}</span></td>
                <td className="px-3 py-3 min-w-[220px]">
                  <div className="font-semibold text-slate-700">{l.name || '-'}</div>
                  <div className="text-slate-500 mt-0.5">{l.phone || '-'}</div>
                  {(l as any).memo && <div className="mt-2 rounded-lg bg-amber-50 border border-amber-100 px-2 py-1.5 text-[11px] text-amber-800 whitespace-normal"><b>메모</b> {(l as any).memo}</div>}
                  {quotes.length > 0 && <div className="mt-2"><button onClick={() => setOpenQuote(openQuote === key ? '' : key)} className="inline-flex items-center gap-1 text-blue-600 font-medium"><ChevronDown size={13} className={clsx(openQuote === key && 'rotate-180')} /> 외부창 견적</button>{openQuote === key && <QuotePanel rows={quotes} />}</div>}
                  {previousRows.length > 0 && <div className="mt-2"><button onClick={() => setOpenStageHistory(openStageHistory === key ? '' : key)} className="inline-flex items-center gap-1 text-slate-600 font-medium"><History size={12}/> 이전 단계 이력 {previousRows.length}건</button>{openStageHistory === key && <StageHistoryPanel rows={previousRows} />}</div>}
                  {history && <div className="mt-2"><button onClick={() => setOpenHistory(openHistory === key ? '' : key)} className="inline-flex items-center gap-1 text-slate-500 font-medium"><History size={12}/> 수정이력</button>{openHistory === key && <pre className="mt-2 p-2 rounded-lg bg-slate-50 text-slate-500 whitespace-pre-wrap max-w-[520px]">{history}</pre>}</div>}
                </td>
                <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{l.region} {l.district}</td>
                <td className="px-3 py-3 text-slate-500 max-w-[240px] whitespace-normal">{shortAddress(l)}</td>
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{(l as any).consultationResult || '-'}</td>
                <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{(l as any).operator || '-'}</td>
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{mediaLabel(l)}</td>
                <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{detailLabel(l)}</td>
                <td className="px-3 py-3 text-slate-500 max-w-[180px] truncate" title={(l as any).source_raw}>{(l as any).source_raw || '-'}</td>
                <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{l.status || 'valid'}</td>
                <td className="px-3 py-3 whitespace-nowrap"><div className="flex gap-1"><button onClick={() => setEditing(l)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600"><Pencil size={12}/> 수정</button><button onClick={() => deleteLead(l)} disabled={saving} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-100 hover:bg-red-50 text-red-600"><Trash2 size={12}/> 삭제</button></div></td>
              </tr>
            })}
            {!filtered.length && <tr><td colSpan={12} className="px-4 py-10 text-center text-slate-400">조회된 DB가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
    {editing && <EditModalWithAddress row={editing} subChannelOptions={subChannelOptions} onClose={() => setEditing(null)} onSave={saveEdit} saving={saving} />}
    {manualOpen && <ManualModal subChannelOptions={subChannelOptions} onClose={() => setManualOpen(false)} onSave={saveManual} saving={saving} />}
  </div>
}

function EditModalWithAddress({ row, subChannelOptions, onClose, onSave, saving }: any) {
  const [name, setName] = useState(row.name || '')
  const [address, setAddress] = useState(row.address || '')
  const [channel, setChannel] = useState<Channel>(row.channel)
  const [subChannel, setSubChannel] = useState(row.subChannel || '')
  const [sourceRaw, setSourceRaw] = useState(row.source_raw || '')
  const [consultationResult, setConsultationResult] = useState(row.consultationResult || '')
  const [memo, setMemo] = useState(row.memo || '')
  const [operator, setOperator] = useState(row.operator || '')
  const [status, setStatus] = useState(row.status || '')

  return <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-auto p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-800">DB 수정</h2>
        <button onClick={onClose}><X size={18}/></button>
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{row.phone} · {STAGE_LABELS[row.dbTier as DBTier]}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-slate-500">이름<input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="space-y-1 text-xs text-slate-500">작업자<input value={operator} onChange={e => setOperator(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="space-y-1 text-xs text-slate-500 md:col-span-2">주소<input value={address} onChange={e => setAddress(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="space-y-1 text-xs text-slate-500">상담결과<select value={consultationResult} onChange={e => setConsultationResult(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"><option value="">선택</option>{CONSULT_RESULTS.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <label className="space-y-1 text-xs text-slate-500">매체<select value={channel} onChange={e => setChannel(e.target.value as Channel)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">{CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}</select></label>
        <label className="space-y-1 text-xs text-slate-500">상세매체<input list="subchannels" value={subChannel} onChange={e => setSubChannel(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /><datalist id="subchannels">{subChannelOptions.map((s: string) => <option key={s} value={s}/>)}</datalist></label>
        <label className="space-y-1 text-xs text-slate-500">유입경로 원본<input value={sourceRaw} onChange={e => setSourceRaw(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="space-y-1 text-xs text-slate-500">상태<input value={status} onChange={e => setStatus(e.target.value)} placeholder="valid / 재인입 등" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="space-y-1 text-xs text-slate-500 md:col-span-2">메모(특이사항)<textarea value={memo} onChange={e => setMemo(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm min-h-[80px]" /></label>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-secondary">취소</button>
        <button onClick={() => onSave(row, { name, address, channel, subChannel, sourceRaw, consultationResult, memo, operator, status })} className="btn-primary" disabled={saving}><Save size={14}/> 저장</button>
      </div>
    </div>
  </div>
}

function EditModal({ row, subChannelOptions, onClose, onSave, saving }: any) {
  const [channel, setChannel] = useState<Channel>(row.channel)
  const [subChannel, setSubChannel] = useState(row.subChannel || '')
  const [sourceRaw, setSourceRaw] = useState(row.source_raw || '')
  const [consultationResult, setConsultationResult] = useState(row.consultationResult || '')
  const [memo, setMemo] = useState(row.memo || '')
  const [operator, setOperator] = useState(row.operator || '')
  const [status, setStatus] = useState(row.status || '')
  return <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-auto p-5 space-y-4"><div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">DB 수정</h2><button onClick={onClose}><X size={18}/></button></div><div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{row.name} · {row.phone} · {STAGE_LABELS[row.dbTier as DBTier]}</div><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><label className="space-y-1 text-xs text-slate-500">상담결과<select value={consultationResult} onChange={e => setConsultationResult(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"><option value="">선택</option>{CONSULT_RESULTS.map(v => <option key={v} value={v}>{v}</option>)}</select></label><label className="space-y-1 text-xs text-slate-500">작업자<input value={operator} onChange={e => setOperator(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label><label className="space-y-1 text-xs text-slate-500">매체<select value={channel} onChange={e => setChannel(e.target.value as Channel)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">{CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}</select></label><label className="space-y-1 text-xs text-slate-500">상세매체<input list="subchannels" value={subChannel} onChange={e => setSubChannel(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /><datalist id="subchannels">{subChannelOptions.map((s: string) => <option key={s} value={s}/>)}</datalist></label><label className="space-y-1 text-xs text-slate-500 md:col-span-2">메모(특이사항)<textarea value={memo} onChange={e => setMemo(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm min-h-[80px]" /></label><label className="space-y-1 text-xs text-slate-500">유입경로 원본<input value={sourceRaw} onChange={e => setSourceRaw(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label><label className="space-y-1 text-xs text-slate-500">상태<input value={status} onChange={e => setStatus(e.target.value)} placeholder="valid / 재인입 등" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label></div><div className="flex justify-end gap-2"><button onClick={onClose} className="btn-secondary">취소</button><button onClick={() => onSave(row, { channel, subChannel, sourceRaw, consultationResult, memo, operator, status })} className="btn-primary" disabled={saving}><Save size={14}/> 저장</button></div></div></div>
}
function ManualModal({ subChannelOptions, onClose, onSave, saving }: any) {
  const [form, setForm] = useState<any>({ date: today(), dbTier: 'second', channel: 'direct', subChannel: '인바운드콜', consultationResult: '', name: '', phone: '', region: '', district: '', address: '', memo: '', operator: '' })
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))
  return <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-auto p-5 space-y-4"><div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">수기 DB 등록</h2><button onClick={onClose}><X size={18}/></button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><select value={form.dbTier} onChange={e => set('dbTier', e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"><option value="first">1차DB</option><option value="second">2차DB</option><option value="retarget">리타겟DB</option><option value="first_reentry">1차 재인입</option><option value="second_reentry">2차 재인입</option></select><input placeholder="이름" value={form.name} onChange={e => set('name', e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input placeholder="연락처" value={form.phone} onChange={e => set('phone', e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><select value={form.consultationResult} onChange={e => set('consultationResult', e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"><option value="">상담결과 선택</option>{CONSULT_RESULTS.map(v => <option key={v} value={v}>{v}</option>)}</select><input placeholder="작업자" value={form.operator} onChange={e => set('operator', e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><select value={form.channel} onChange={e => set('channel', e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">{CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}</select><input list="manual-subchannels" placeholder="상세매체" value={form.subChannel} onChange={e => set('subChannel', e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><datalist id="manual-subchannels">{subChannelOptions.map((s: string) => <option key={s} value={s}/>)}</datalist><input placeholder="시도" value={form.region} onChange={e => set('region', e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input placeholder="시군구" value={form.district} onChange={e => set('district', e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input placeholder="주소" value={form.address} onChange={e => set('address', e.target.value)} className="md:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" /><textarea placeholder="메모(특이사항)" value={form.memo} onChange={e => set('memo', e.target.value)} className="md:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm min-h-[80px]" /></div><div className="flex justify-end gap-2"><button onClick={onClose} className="btn-secondary">취소</button><button onClick={() => onSave(form)} disabled={!form.name || !form.phone || saving} className="btn-primary"><Save size={14}/> 저장</button></div></div></div>
}
