import { useCallback, useEffect, useRef, useState } from 'react'
import { DATA_UPDATED_EVENT, fetchDataUpdatedAt } from '../lib/dataService'

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
  const loadingRef = useRef(false)

  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const value = await fetchDataUpdatedAt()
      setUpdatedAt(value)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      loadingRef.current = false
    }
  }, [])

  useEffect(() => {
    load()
    const handleUpdated = () => load()
    window.addEventListener(DATA_UPDATED_EVENT, handleUpdated)
    return () => window.removeEventListener(DATA_UPDATED_EVENT, handleUpdated)
  }, [load])

  return (
    <span
      className="w-full text-right text-[11px] leading-4 text-slate-400 sm:w-auto sm:whitespace-nowrap"
      title="연결된 Google 스프레드시트 파일이 마지막으로 변경된 시각입니다."
    >
      {updatedAt
        ? `마지막 데이터 업데이트 ${formatUpdatedAt(updatedAt)}`
        : failed
          ? '업데이트 시간 확인 실패'
          : '업데이트 시간 확인 중...'}
    </span>
  )
}
