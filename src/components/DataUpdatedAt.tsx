import { useCallback, useEffect, useRef, useState } from 'react'
import { DATA_UPDATED_EVENT, fetchDataUpdatedAt, fetchManagementSyncStatus } from '../lib/dataService'

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || ''

  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`
}

export default function DataUpdatedAt() {
  const [updatedAt, setUpdatedAt] = useState('')
  const [failed, setFailed] = useState(false)
  const [source, setSource] = useState<'api' | 'manual'>('manual')
  const [syncError, setSyncError] = useState(false)
  const loadingRef = useRef(false)

  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const syncStates = await fetchManagementSyncStatus().catch(() => [])
      const syncTimes = syncStates.map(state => String(state.last_success_at || '')).filter(Boolean)
      if (syncStates.length && syncTimes.length) {
        syncTimes.sort()
        setUpdatedAt(syncTimes[syncTimes.length - 1] || '')
        setSource('api')
        setSyncError(syncStates.some(state => Boolean(state.last_error)))
        setFailed(false)
        return
      }
      const value = await fetchDataUpdatedAt()
      setUpdatedAt(value)
      setSource('manual')
      setSyncError(false)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      loadingRef.current = false
    }
  }, [])

  useEffect(() => {
    const initialTimer = window.setTimeout(load, 1_200)
    const handleUpdated = () => load()
    window.addEventListener(DATA_UPDATED_EVENT, handleUpdated)
    return () => {
      window.clearTimeout(initialTimer)
      window.removeEventListener(DATA_UPDATED_EVENT, handleUpdated)
    }
  }, [load])

  return (
    <span
      className={`w-full text-right text-[11px] leading-4 sm:w-auto sm:whitespace-nowrap ${syncError ? 'text-rose-500' : source === 'api' ? 'text-emerald-600' : 'text-slate-400'}`}
      title={source === 'api' ? '관리시스템 API 데이터를 운영 DB에 마지막으로 저장한 시각입니다.' : 'API 저장소를 사용할 수 없어 기존 수동 업로드 데이터를 표시하고 있습니다.'}
    >
      {updatedAt
        ? `${source === 'api' ? '관리시스템 API 동기화' : '수동 업로드 예비모드'} ${formatUpdatedAt(updatedAt)}${syncError ? ' · 일부 오류' : ''}`
        : failed
          ? '업데이트 시간 확인 실패'
          : '업데이트 시간 확인 중...'}
    </span>
  )
}
