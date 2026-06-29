import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { deleteAdSpendRecord, fetchAdSpend, updateAdSpendRecord } from '../lib/dataService'
import type { AdSpend, Channel } from '../types'

const CHANNELS: Channel[] = ['naver', 'google', 'meta', 'youtube', 'viral', 'kakao_search', 'kakao_moment']
const CHANNEL_LABELS: Record<string, string> = {
  naver: '네이버',
  google: '구글',
  meta: '메타',
  youtube: '유튜브',
  viral: '바이럴',
  kakao_search: '카카오 검색광고',
  kakao_moment: '카카오모먼트',
}
const SUB_CHANNELS = [
  '네이버 SA', '네이버 GFA', '네이버 브랜드검색',
  '구글 검색광고', '구글 디스커버리/GDN', '구글 유튜브',
  '메타', '유튜브', '바이럴', '블로그', '카페', '레뷰',
  '카카오 검색광고', '카카오모먼트',
]

function money(value: number) {
  return `${Math.round(value || 0).toLocaleString()}원`
}

export default function AdSpendManagePage() {
  const [rows, setRows] = useState<AdSpend[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [channel, setChannel] = useState<'all' | Channel>('all')
  const [keyword, setKeyword] = useState('')
  const [editing, setEditing] = useState<AdSpend | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    try {
      setRows(await fetchAdSpend())
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '광고비를 불러오지 못했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return rows
      .filter(row => row.date.startsWith(selectedMonth))
      .filter(row => channel === 'all' || row.channel === channel)
      .filter(row => !q || `${CHANNEL_LABELS[row.channel] || row.channel} ${row.subChannel || ''} ${row.campaign || ''} ${row.memo || ''} ${row.registrant || ''}`.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || (a.subChannel || '').localeCompare(b.subChannel || ''))
  }, [rows, selectedMonth, channel, keyword])

  const total = filtered.reduce((sum, row) => sum + row.amount, 0)

  async function save(original: AdSpend, next: Omit<AdSpend, 'id'>) {
    setSaving(true)
    setNotice(null)
    try {
      await updateAdSpendRecord(original, next)
      setEditing(null)
      await load()
      setNotice({ type: 'success', text: '광고비가 수정되었습니다.' })
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '광고비 수정에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  async function remove(row: AdSpend) {
    if (!window.confirm(`${row.date} ${row.subChannel || CHANNEL_LABELS[row.channel]} 광고비를 삭제할까요?`)) return
    setSaving(true)
    setNotice(null)
    try {
      await deleteAdSpendRecord(row)
      await load()
      setNotice({ type: 'success', text: '광고비가 삭제되었습니다.' })
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '광고비 삭제에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  return <div className="p-4 md:p-6 space-y-5">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-lg font-bold text-slate-800">광고비 관리</h1>
        <p className="mt-0.5 text-xs text-slate-500">AD_SPEND에 등록된 일자별 광고비를 조회하고 수정합니다.</p>
      </div>
      <button onClick={load} className="btn-secondary self-start"><RefreshCw size={13} className={clsx(loading && 'animate-spin')} /> 새로고침</button>
    </div>

    {notice && <div className={clsx('rounded-lg border px-4 py-3 text-sm', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700')}>{notice.text}</div>}

    <div className="card p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <input type="month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2" />
        <select value={channel} onChange={event => setChannel(event.target.value as 'all' | Channel)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2">
          <option value="all">전체 매체</option>
          {CHANNELS.map(item => <option key={item} value={item}>{CHANNEL_LABELS[item]}</option>)}
        </select>
        <div className="relative md:col-span-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="상세매체·캠페인·메모·등록자 검색" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm" />
        </div>
        <div className="md:col-span-4 flex items-center justify-end gap-4 text-sm">
          <span className="text-slate-500">{filtered.length.toLocaleString()}건</span>
          <span className="font-bold text-slate-800">합계 {money(total)}</span>
        </div>
      </div>
    </div>

    <div className="card overflow-hidden">
      <div className="overflow-auto max-h-[720px]">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 text-slate-500">
            <tr>
              {['날짜','매체','상세매체','캠페인명','광고비','메모','등록자','관리'].map(label => <th key={label} className={clsx('px-4 py-3 font-semibold', label === '광고비' ? 'text-right' : 'text-left')}>{label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((row, index) => <tr key={`${row.date}_${row.channel}_${row.subChannel}_${row.campaign}_${index}`} className="hover:bg-slate-50/70">
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">{row.date}</td>
              <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">{CHANNEL_LABELS[row.channel] || row.channel}</td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">{row.subChannel || '-'}</td>
              <td className="px-4 py-3 text-slate-600">{row.campaign || '-'}</td>
              <td className="px-4 py-3 text-right font-semibold text-slate-800">{money(row.amount)}</td>
              <td className="px-4 py-3 max-w-[260px] truncate text-slate-500" title={row.memo}>{row.memo || '-'}</td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-500">{row.registrant || '-'}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex gap-1">
                  <button onClick={() => setEditing(row)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-white"><Pencil size={12}/> 수정</button>
                  <button onClick={() => remove(row)} disabled={saving} className="inline-flex items-center gap-1 rounded-md border border-red-100 px-2 py-1 text-red-600 hover:bg-red-50"><Trash2 size={12}/> 삭제</button>
                </div>
              </td>
            </tr>)}
            {!filtered.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">조회된 광고비가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>

    {editing && <EditAdSpendModal row={editing} saving={saving} onClose={() => setEditing(null)} onSave={save} />}
  </div>
}

function EditAdSpendModal({ row, saving, onClose, onSave }: { row: AdSpend; saving: boolean; onClose: () => void; onSave: (original: AdSpend, next: Omit<AdSpend, 'id'>) => void }) {
  const [form, setForm] = useState({
    date: row.date,
    channel: row.channel,
    subChannel: row.subChannel || '',
    campaign: row.campaign || '',
    amount: String(row.amount || ''),
    memo: row.memo || '',
    registrant: row.registrant || '',
  })
  const set = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }))
  const amount = Number(form.amount.replace(/[^0-9]/g, ''))

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
    <div className="w-full max-w-2xl space-y-4 rounded-lg bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-800">광고비 수정</h2>
        <button onClick={onClose} aria-label="닫기"><X size={18}/></button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs text-slate-500">날짜<input type="date" value={form.date} onChange={event => set('date', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="space-y-1 text-xs text-slate-500">매체<select value={form.channel} onChange={event => set('channel', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{CHANNELS.map(item => <option key={item} value={item}>{CHANNEL_LABELS[item]}</option>)}</select></label>
        <label className="space-y-1 text-xs text-slate-500">상세매체<input list="ad-spend-subchannels" value={form.subChannel} onChange={event => set('subChannel', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /><datalist id="ad-spend-subchannels">{SUB_CHANNELS.map(item => <option key={item} value={item}/>)}</datalist></label>
        <label className="space-y-1 text-xs text-slate-500">캠페인명<input value={form.campaign} onChange={event => set('campaign', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="space-y-1 text-xs text-slate-500">광고비<input inputMode="numeric" value={form.amount} onChange={event => set('amount', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="space-y-1 text-xs text-slate-500">등록자<input value={form.registrant} onChange={event => set('registrant', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="space-y-1 text-xs text-slate-500 md:col-span-2">메모<textarea value={form.memo} onChange={event => set('memo', event.target.value)} className="min-h-[80px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-secondary">취소</button>
        <button disabled={saving || !form.date || !form.channel || amount <= 0} onClick={() => onSave(row, { ...form, channel: form.channel as Channel, amount })} className="btn-primary">저장</button>
      </div>
    </div>
  </div>
}
