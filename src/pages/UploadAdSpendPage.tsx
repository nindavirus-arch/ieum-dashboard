// src/pages/UploadAdSpendPage.tsx
import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, DollarSign, X, FileSpreadsheet } from 'lucide-react'
import { parseAdSpendExcel, type ParsedAdSpendResult } from '../lib/excelParser'
import { uploadAdSpend } from '../lib/dataService'
import type { Channel } from '../types'
import clsx from 'clsx'

type Stage = 'idle' | 'parsing' | 'preview' | 'uploading' | 'done' | 'error'

const CHANNEL_LABELS: Record<string, string> = {
  naver:'네이버', google:'구글', meta:'메타', youtube:'유튜브', viral:'바이럴', direct:'직접유입',
  kakao_search:'카카오 검색광고', kakao_moment:'카카오모먼트',
  tu_albarich:'TU-알바리치', tu_youtube:'TU-유튜브', tu_danggeun:'TU-당근',
  hugreen_danggeun:'휴그린-당근', hugreen_mail:'휴그린-메일', inbound_call:'인바운드-인입콜', etc:'기타'
}
const AD_CHANNELS: Channel[] = ['naver', 'google', 'meta', 'youtube', 'viral', 'kakao_search', 'kakao_moment']
const SUB_CHANNELS = ['네이버 SA', '네이버 GFA', '네이버 브랜드검색', '구글 검색광고', '구글 디맨드젠', '구글 디스커버리/GDN', '메타', '유튜브', '바이럴', '카카오 검색광고', '카카오모먼트']

function fmtKRW(n: number) {
  return n.toLocaleString() + '원'
}

export default function UploadAdSpendPage() {
  const [stage, setStage] = useState<Stage>('idle')
  const [result, setResult] = useState<ParsedAdSpendResult | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [manualSaving, setManualSaving] = useState(false)
  const [manualDone, setManualDone] = useState(false)
  const [manual, setManual] = useState({
    date: new Date().toISOString().slice(0, 10),
    channel: 'naver' as Channel,
    subChannel: '네이버 SA',
    campaign: '',
    amount: '',
    memo: '',
    registrant: '',
  })
  const setManualField = (key: keyof typeof manual, value: string) => {
    setManualDone(false)
    setManual(prev => ({ ...prev, [key]: value }))
  }

  async function handleFile(file: File) {
    setStage('parsing')
    try {
      const parsed = await parseAdSpendExcel(file)
      setResult(parsed)
      setStage('preview')
    } catch (e: any) { setError(String(e?.message ?? e)); setStage('error') }
  }

  async function handleUpload(replaceExisting = false) {
    if (!result) return
    setStage('uploading')
    try {
      await uploadAdSpend(result.records, { replaceExisting })
      setStage('done')
    } catch (e: any) { setError(String(e?.message ?? e)); setStage('error') }
  }

  async function handleManualUpload() {
    const amount = Number(String(manual.amount).replace(/[^0-9]/g, ''))
    if (!manual.date || !manual.channel || amount <= 0) {
      setError('날짜, 매체, 광고비를 확인해주세요.')
      setStage('error')
      return
    }
    setManualSaving(true)
    try {
      await uploadAdSpend([{
        date: manual.date,
        channel: manual.channel,
        subChannel: manual.subChannel,
        campaign: manual.campaign,
        amount,
        memo: manual.memo,
        registrant: manual.registrant,
      }])
      setManual(prev => ({ ...prev, campaign: '', amount: '', memo: '' }))
      setManualDone(true)
    } catch (e: any) {
      setError(String(e?.message ?? e))
      setStage('error')
    } finally {
      setManualSaving(false)
    }
  }

  function reset() { setStage('idle'); setResult(null); setError('') }

  const totalSpend = result?.records.reduce((a, b) => a + b.amount, 0) ?? 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-800">광고비 업로드</h1>
        <p className="text-xs text-slate-500 mt-0.5">날짜별·매체별 광고비를 업로드하면 CPL이 자동으로 계산됩니다.</p>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-700">광고비 수기등록</p>
          <p className="text-xs text-slate-400 mt-0.5">단건 광고비를 AD_SPEND 시트에 바로 저장합니다.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          <label className="space-y-1 text-xs text-slate-500">
            날짜
            <input type="date" value={manual.date} onChange={e => setManualField('date', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 text-xs text-slate-500">
            매체
            <select value={manual.channel} onChange={e => setManualField('channel', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              {AD_CHANNELS.map(ch => <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-slate-500">
            상세매체
            <input list="ad-subchannels" value={manual.subChannel} onChange={e => setManualField('subChannel', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <datalist id="ad-subchannels">{SUB_CHANNELS.map(s => <option key={s} value={s} />)}</datalist>
          </label>
          <label className="space-y-1 text-xs text-slate-500 md:col-span-2">
            캠페인명
            <input value={manual.campaign} onChange={e => setManualField('campaign', e.target.value)} placeholder="캠페인명" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 text-xs text-slate-500">
            광고비
            <input inputMode="numeric" value={manual.amount} onChange={e => setManualField('amount', e.target.value)} placeholder="1500000" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 text-xs text-slate-500">
            등록자
            <input value={manual.registrant} onChange={e => setManualField('registrant', e.target.value)} placeholder="등록자" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 text-xs text-slate-500 md:col-span-6">
            메모
            <input value={manual.memo} onChange={e => setManualField('memo', e.target.value)} placeholder="메모" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <div className="flex items-end">
            <button onClick={handleManualUpload} disabled={manualSaving} className="btn-primary w-full">
              <DollarSign size={14} /> 등록
            </button>
          </div>
        </div>
        {manualDone && <p className="text-xs text-emerald-600">광고비가 저장되었습니다.</p>}
      </div>

      {(stage === 'idle' || stage === 'parsing') && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            'card border-2 border-dashed p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors',
            dragOver ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50'
          )}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          {stage === 'parsing' ? (
            <><div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">파일 분석 중...</p></>
          ) : (
            <><div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center">
              <FileSpreadsheet size={22} className="text-violet-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">광고비 엑셀 파일 업로드</p>
              <p className="text-xs text-slate-400 mt-1">.xlsx, .xls, .csv 지원</p>
            </div></>
          )}
        </div>
      )}

      {stage === 'preview' && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-4 bg-violet-50 border-violet-100">
              <p className="text-xs text-violet-500 font-medium">총 광고비</p>
              <p className="text-xl font-bold text-violet-700 mt-1">{fmtKRW(totalSpend)}</p>
            </div>
            <div className="card p-4 bg-blue-50 border-blue-100">
              <p className="text-xs text-blue-500 font-medium">레코드 수</p>
              <p className="text-xl font-bold text-blue-700 mt-1">{result.records.length}건</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500 font-medium">날짜 범위</p>
              <p className="text-sm font-bold text-slate-700 mt-1">
                {result.records[result.records.length-1]?.date ?? '-'} ~ {result.records[0]?.date ?? '-'}
              </p>
            </div>
          </div>

          {/* Channel totals */}
          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-600 mb-3">매체별 합계</p>
            <div className="grid grid-cols-5 gap-3">
              {AD_CHANNELS.map(ch => {
                const total = result.records.filter(r => r.channel === ch).reduce((a,b) => a+b.amount, 0)
                const pct = totalSpend > 0 ? Math.round(total/totalSpend*100) : 0
                return (
                  <div key={ch} className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-600">{CHANNEL_LABELS[ch]}</p>
                    <p className="text-sm font-bold text-slate-800">{fmtKRW(total)}</p>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-slate-400">{pct}%</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-600">미리보기 (상위 15건)</p>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="text-left px-3 py-2 font-medium">날짜</th>
                  <th className="text-left px-3 py-2 font-medium">매체</th>
                  <th className="text-left px-3 py-2 font-medium">상세매체</th>
                  <th className="text-right px-3 py-2 font-medium">광고비</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {result.records.slice(0, 15).map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-600">{r.date}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded">{CHANNEL_LABELS[r.channel]}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.subChannel || '-'}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-700">{fmtKRW(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button onClick={() => handleUpload(false)} className="btn-primary">
              <Upload size={14} /> {result.records.length}건 추가 저장
            </button>
            <button onClick={() => handleUpload(true)} className="btn-secondary">
              같은 날짜+매체 기존 광고비 교체
            </button>
            <button onClick={reset} className="btn-secondary"><X size={14} /> 취소</button>
          </div>
        </div>
      )}

      {stage === 'uploading' && (
        <div className="card p-12 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-600">저장 중...</p>
        </div>
      )}

      {stage === 'done' && (
        <div className="card p-12 flex flex-col items-center gap-4">
          <CheckCircle size={40} className="text-emerald-500" />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">저장 완료</p>
            <p className="text-xs text-slate-400 mt-1">CPL이 자동으로 계산됩니다.</p>
          </div>
          <button onClick={reset} className="btn-secondary">새 파일 업로드</button>
        </div>
      )}

      {stage === 'error' && (
        <div className="card p-8 flex flex-col items-center gap-3">
          <AlertCircle size={32} className="text-red-500" />
          <p className="text-sm font-medium text-slate-700">오류가 발생했습니다</p>
          <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg font-mono">{error}</p>
          <button onClick={reset} className="btn-secondary">다시 시도</button>
        </div>
      )}

      {/* Guide */}
      <div className="card p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-600">엑셀 컬럼 가이드</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400">
              {['컬럼명','예시값','설명'].map(h => <th key={h} className="text-left pb-2 pr-6">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-slate-600">
            {[
              ['날짜 / date', '2024-01-15', 'YYYY-MM-DD 형식'],
              ['채널 / 매체', '네이버', '네이버·구글·메타·유튜브·바이럴'],
              ['광고비 / 금액', '1500000', '숫자 (원 단위, 콤마 가능)'],
            ].map(([col, ex, desc]) => (
              <tr key={col}>
                <td className="py-1.5 pr-6 font-mono font-medium text-slate-700">{col}</td>
                <td className="py-1.5 pr-6 text-violet-600">{ex}</td>
                <td className="py-1.5 text-slate-400">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
