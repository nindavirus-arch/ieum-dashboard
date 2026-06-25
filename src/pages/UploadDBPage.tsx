// src/pages/UploadDBPage.tsx
import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, X } from 'lucide-react'
import { parseLeadExcel, type ParsedLeadResult } from '../lib/excelParser'
import { uploadLeads } from '../lib/dataService'
import clsx from 'clsx'

type Stage = 'idle' | 'parsing' | 'preview' | 'uploading' | 'done' | 'error'

export default function UploadDBPage() {
  const [stage, setStage] = useState<Stage>('idle')
  const [result, setResult] = useState<ParsedLeadResult | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  async function handleFile(file: File) {
    setStage('parsing')
    try {
      const parsed = await parseLeadExcel(file)
      setResult(parsed)
      setStage('preview')
    } catch (e: any) {
      setError(String(e?.message ?? e))
      setStage('error')
    }
  }

  async function handleUpload() {
    if (!result) return
    setStage('uploading')
    try {
      await uploadLeads(result.valid)
      setStage('done')
    } catch (e: any) {
      setError(String(e?.message ?? e))
      setStage('error')
    }
  }

  function reset() { setStage('idle'); setResult(null); setError('') }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-800">DB 업로드</h1>
        <p className="text-xs text-slate-500 mt-0.5">관리시스템 원본 엑셀을 그대로 업로드하면 1차/2차 파일을 자동 판별하고 중복·테스트·이상번호를 제거합니다.</p>
      </div>

      {/* Drop zone */}
      {(stage === 'idle' || stage === 'parsing') && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            'card border-2 border-dashed p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors',
            dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
          )}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          {stage === 'parsing' ? (
            <>
              <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">파일 분석 중...</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                <FileSpreadsheet size={22} className="text-blue-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">엑셀 파일을 드래그하거나 클릭하여 업로드</p>
                <p className="text-xs text-slate-400 mt-1">.xlsx, .xls, .csv 지원</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Preview */}
      {stage === 'preview' && result && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-6 gap-3">
            {[
              { label: '총 데이터', value: result.valid.length + result.duplicateCount + result.testCount + result.invalidCount, color: 'text-slate-700', bg: 'bg-slate-50' },
              { label: '유효 DB', value: result.valid.length, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: result.sourceKind === 'second_raw' ? '2차DB 파일' : result.sourceKind === 'first_raw' ? '1차DB 파일' : '자동판별', value: result.sourceKind === 'second_raw' ? '2차' : result.sourceKind === 'first_raw' ? '1차' : '기타', color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: '중복 제거', value: result.duplicateCount, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: '테스트 제거', value: result.testCount, color: 'text-orange-600', bg: 'bg-orange-50' },
              { label: '이상번호', value: result.invalidCount, color: 'text-red-600', bg: 'bg-red-50' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={clsx('rounded-xl p-4', bg)}>
                <p className="text-xs text-slate-500">{label}</p>
                <p className={clsx('text-xl font-bold mt-1', color)}>{value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* DB Tier breakdown */}
          <div className="card p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-700">DB 등급 분류</p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: '리타겟 DB', count: result.retargetCount, color: 'bg-violet-500', light: 'text-violet-700' },
                { label: '1차 DB', count: result.firstCount, color: 'bg-blue-500', light: 'text-blue-700' },
                { label: '2차 DB', count: result.secondCount, color: 'bg-emerald-500', light: 'text-emerald-700' },
              ].map(({ label, count, color, light }) => {
                const pct = result.valid.length > 0 ? Math.round(count/result.valid.length*100) : 0
                return (
                  <div key={label}>
                    <div className="flex justify-between mb-1.5">
                      <span className={clsx('text-xs font-medium', light)}>{label}</span>
                      <span className="text-xs text-slate-500">{count}건 ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className={clsx('h-2 rounded-full', color)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Preview table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-600">미리보기 (상위 10건)</p>
              <span className="text-xs text-slate-400">총 {result.valid.length}건 업로드 예정</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    {['DB 유입일시','날짜','이름','전화번호','채널','DB등급','지역'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {result.valid.slice(0, 10).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-600">{(r as any).registeredAt || r.date}</td>
                      <td className="px-3 py-2 text-slate-600">{r.date}</td>
                      <td className="px-3 py-2 font-medium text-slate-700">{r.name}</td>
                      <td className="px-3 py-2 text-slate-600">{r.phone}</td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">{r.channel}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={clsx('px-1.5 py-0.5 rounded font-medium',
                          r.dbTier === 'retarget' ? 'bg-violet-100 text-violet-700' :
                          r.dbTier === 'first' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                        )}>{r.dbTier === 'retarget' ? '리타겟' : r.dbTier === 'first' ? '1차' : '2차'}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{r.region} {r.district}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleUpload} className="btn-primary">
              <Upload size={14} /> {result.valid.length}건 업로드
            </button>
            <button onClick={reset} className="btn-secondary"><X size={14} /> 취소</button>
          </div>
        </div>
      )}

      {/* Uploading */}
      {stage === 'uploading' && (
        <div className="card p-12 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-600">브라우저 로컬 저장소에 저장 중...</p>
        </div>
      )}

      {/* Done */}
      {stage === 'done' && (
        <div className="card p-12 flex flex-col items-center gap-4">
          <CheckCircle size={40} className="text-emerald-500" />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">업로드 완료</p>
            <p className="text-xs text-slate-400 mt-1">{result?.valid.length}건이 저장되었습니다. 같은 연락처의 2차DB는 기존 1차DB 매체를 자동 승계합니다.</p>
          </div>
          <button onClick={reset} className="btn-secondary">새 파일 업로드</button>
        </div>
      )}

      {/* Error */}
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
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400">
                {['컬럼명 (필수)','예시값','설명'].map(h => <th key={h} className="text-left pb-2 pr-6">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-600">
              {[
                ['등록일시 / 접수일시 / 신청일시', '2024-01-15 14:32', '실제 DB가 들어온 시간. 월별/일별 집계 기준'],
                ['날짜 / date', '2024-01-15', '등록일시가 없을 때 쓰는 날짜 기준'],
                ['이름 / 성명', '홍길동', ''],
                ['연락처 / 전화번호', '01012345678', '숫자만 또는 하이픈 포함'],
                ['채널 / 매체', '네이버 / naver', '네이버·구글·메타·유튜브·바이럴'],
                ['DB등급 / 등급', '1차 / 리타겟', '리타겟·1차·2차'],
                ['시도', '경기도', '(선택)'],
                ['시군구', '성남시', '(선택)'],
              ].map(([col, ex, desc]) => (
                <tr key={col}>
                  <td className="py-1.5 pr-6 font-medium text-slate-700 font-mono">{col}</td>
                  <td className="py-1.5 pr-6 text-blue-600">{ex}</td>
                  <td className="py-1.5 text-slate-400">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
