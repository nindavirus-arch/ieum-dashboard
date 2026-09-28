import { useEffect, useRef } from 'react'
import { clearClientDataCache, invalidateDataCache } from './dataService'

const VERSION_CHECK_INTERVAL_MS = 10 * 60_000
const DATA_REFRESH_INTERVAL_MS = 5 * 60_000
const VERSION_RELOAD_GUARD_KEY = 'ieum:version-reload-guard'

type VersionResponse = { buildId?: string }

async function fetchDeployedBuildId() {
  const response = await fetch(`/version.json?t=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return ''
  const data = await response.json() as VersionResponse
  return String(data.buildId || '')
}

export function useDeploymentRefresh() {
  useEffect(() => {
    if (__APP_BUILD_ID__ === 'development') return
    let checking = false

    async function checkVersion() {
      if (checking || document.visibilityState !== 'visible') return
      checking = true
      try {
        const deployedBuildId = await fetchDeployedBuildId()
        if (!deployedBuildId || deployedBuildId === __APP_BUILD_ID__) return

        const guard = window.sessionStorage.getItem(VERSION_RELOAD_GUARD_KEY)
        const nextGuard = `${__APP_BUILD_ID__}:${deployedBuildId}`
        if (guard === nextGuard) return

        window.sessionStorage.setItem(VERSION_RELOAD_GUARD_KEY, nextGuard)
        clearClientDataCache()
        window.location.reload()
      } catch {
        // A failed update check must never interrupt the current dashboard session.
      } finally {
        checking = false
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkVersion()
    }
    const interval = window.setInterval(() => void checkVersion(), VERSION_CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibility)
    void checkVersion()

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])
}

export function useAutoDataRefresh(refresh: () => void | Promise<void>) {
  const refreshRef = useRef(refresh)
  const refreshingRef = useRef(false)
  const lastRefreshRef = useRef(Date.now())

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    async function refreshIfStale() {
      if (
        document.visibilityState !== 'visible' ||
        refreshingRef.current ||
        Date.now() - lastRefreshRef.current < DATA_REFRESH_INTERVAL_MS
      ) return

      refreshingRef.current = true
      lastRefreshRef.current = Date.now()
      invalidateDataCache()
      try {
        await refreshRef.current()
      } catch {
        // Individual pages keep their existing data and error handling on refresh failure.
      } finally {
        refreshingRef.current = false
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshIfStale()
    }
    const interval = window.setInterval(() => void refreshIfStale(), DATA_REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])
}
