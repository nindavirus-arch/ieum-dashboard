import { useRef, useState } from 'react'
import { AlertCircle, CheckCircle, FileSpreadsheet, Upload, X } from 'lucide-react'
import clsx from 'clsx'
import { parseProjectsExcel, type ParsedProjectResult } from '../lib/projectParser'
import { saveProjects } from '../lib/dataService'

type Stage = 'idle' | 'parsing' | 'preview' | 'uploading' | 'done' | 'error'

function fmtKRW(value: number) {
  return `${Math.round(value).toLocaleString()}원`
}

export default function UploadProjectsPage() {
  const [stage, setStage] = useState<Stage>('idle')
  const [result, setResult] = useState<ParsedProjectResult | null>(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStage('parsing')
    setError('')
    try {
      const parsed = await parseProjectsExcel(file)
      setResult(parsed)
      setStage('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : '프로젝트 파일 분석에 실패했습니다.')
      setStage('error')
    }
  }

  async function handleUpload() {
    if (!result) return
    setStage('uploading')
    setError('')
    try {
      await saveProjects(result.valid)
      setStage('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : '프로젝트 저장에 실패했습니다.')
      setStage('error')
    }
  }

  function reset() {
    setStage('idle')
    setResult(null)
    setError('')
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-lg font-bold text-slate-800">프로젝트 업로드</h1>
        <p className="mt-0.5 text-xs text-slate-500">관리시스템 프로젝트리스트 엑셀을 업로드하면 계약 KPI와 매체별 계약성과에 반영됩니다.</p>
      </div>

      {(stage === 'idle' || stage === 'parsing') && (
        <div
          onDragOver={event => { event.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={event => { event.preventDefault(); setDragOver(false); const file = event.dataTransfer.files[0]; if (file) handleFile(file) }}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            'card flex cursor-pointer flex-col items-center gap-4 border-2 border-dashed p-10 transition-colors md:p-12',
            dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
          )}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) handleFile(file) }} />
          {stage === 'parsing' ? (
            <>
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <p className="text-sm text-slate-500">프로젝트 파일 분석 중...</p>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
                <FileSpreadsheet size={22} className="text-blue-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">프로젝트리스트 엑셀 파일 업로드</p>
                <p className="mt-1 text-xs text-slate-400">계약금 입금 완료/계약완료/계약확정 건만 실제 계약으로 집계합니다.</p>
              </div>
            </>
          )}
        </div>
      )}

      {stage === 'preview' && result && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-6">
            {[
              { label: '총 행', value: result.totalCount, tone: 'text-slate-700 bg-slate-50' },
              { label: '업로드 대상', value: result.valid.length, tone: 'text-blue-700 bg-blue-50' },
              { label: '실제 계약', value: result.contractedCount, tone: 'text-emerald-700 bg-emerald-50' },
              { label: '대기/미확정', value: result.pendingCount, tone: 'text-amber-700 bg-amber-50' },
              { label: '취소/제외', value: result.canceledCount, tone: 'text-red-700 bg-red-50' },
              { label: '테스트', value: result.testCount, tone: 'text-slate-500 bg-slate-50' },
            ].map(card => (
              <div key={card.label} className={clsx('rounded-xl p-4', card.tone)}>
                <p className="text-xs opacity-80">{card.label}</p>
                <p className="mt-1 text-xl font-bold">{card.value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-semibold text-slate-600">미리보기 상위 12건</p>
              <span className="text-xs text-slate-400">계약금액 합계 {fmtKRW(result.valid.filter(row => row.status === 'contracted').reduce((sum, row) => sum + row.contractAmount, 0))}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    {['계약일', '상태', '고객명', '연락처', '컨설팅번호', '유입경로', '영업담당자', '계약금액'].map(header => <th key={header} className="px-3 py-2 text-left font-medium">{header}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {result.valid.slice(0, 12).map((row, index) => (
                    <tr key={`${row.phone}_${row.contractDate}_${index}`} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-600">{row.contractDate}</td>
                      <td className="px-3 py-2">
                        <span className={clsx('rounded px-1.5 py-0.5 font-medium', row.status === 'contracted' ? 'bg-emerald-100 text-emerald-700' : row.status === 'canceled' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600')}>
                          {row.status === 'contracted' ? '계약' : row.status === 'canceled' ? '제외' : row.status === 'test' ? '테스트' : '대기'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700">{row.customerName || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{row.phone || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{row.consultingNumber || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{row.subChannel || row.sourceRaw || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{row.salesOwner || '-'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmtKRW(row.contractAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleUpload} className="btn-primary"><Upload size={14} /> {result.valid.length}건 저장</button>
            <button onClick={reset} className="btn-secondary"><X size={14} /> 취소</button>
          </div>
        </div>
      )}

      {stage === 'uploading' && (
        <div className="card flex flex-col items-center gap-4 p-12">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-slate-600">프로젝트 데이터를 저장 중...</p>
        </div>
      )}

      {stage === 'done' && (
        <div className="card flex flex-col items-center gap-4 p-12">
          <CheckCircle size={42} className="text-emerald-500" />
          <div className="text-center">
            <p className="font-semibold text-slate-800">프로젝트 데이터가 저장되었습니다.</p>
            <p className="mt-1 text-sm text-slate-500">매체별 성과와 영업관리에서 계약지표를 확인할 수 있습니다.</p>
          </div>
          <button onClick={reset} className="btn-primary">새 파일 업로드</button>
        </div>
      )}

      {stage === 'error' && (
        <div className="card flex flex-col items-center gap-4 p-12">
          <AlertCircle size={42} className="text-red-500" />
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
          <button onClick={reset} className="btn-secondary">다시 시도</button>
        </div>
      )}
    </div>
  )
}
