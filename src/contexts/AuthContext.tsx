import { createContext, useContext, useEffect, useState } from 'react'
import { AUTH_INVALID_EVENT, AUTH_RECHECK_EVENT, fetchAuthStatus, getAuthToken, getStoredAuthUser, login as loginRequest, logout as logoutRequest, setupMaster as setupMasterRequest, type AdminUser } from '../lib/auth'

type AuthContextValue = {
  user: AdminUser | null
  loading: boolean
  setupRequired: boolean
  login: (id: string, password: string) => Promise<void>
  setupMaster: (id: string, name: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const status = await fetchAuthStatus()
      setSetupRequired(status.setupRequired)
      setUser(status.user || null)
    } catch {
      const cachedUser = getAuthToken() ? getStoredAuthUser() : null
      if (cachedUser) setUser(cachedUser)
      else setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    let recheckTimer = 0
    const handleInvalid = () => {
      setUser(null)
      setSetupRequired(false)
      setLoading(false)
    }
    const handleRecheck = () => {
      window.clearTimeout(recheckTimer)
      recheckTimer = window.setTimeout(async () => {
        try {
          const status = await fetchAuthStatus()
          setSetupRequired(status.setupRequired)
          // 데이터 요청 한 번의 인증 지연만으로 현재 화면을 로그아웃시키지 않습니다.
          // 명시적인 로그인 만료 응답은 AUTH_INVALID_EVENT에서 처리합니다.
          if (status.user) setUser(status.user)
        } catch {
          // 일시적인 네트워크 실패라면 현재 화면과 세션을 유지합니다.
        }
      }, 500)
    }
    window.addEventListener(AUTH_INVALID_EVENT, handleInvalid)
    window.addEventListener(AUTH_RECHECK_EVENT, handleRecheck)
    return () => {
      window.clearTimeout(recheckTimer)
      window.removeEventListener(AUTH_INVALID_EVENT, handleInvalid)
      window.removeEventListener(AUTH_RECHECK_EVENT, handleRecheck)
    }
  }, [])

  async function login(id: string, password: string) {
    const next = await loginRequest(id, password)
    setUser(next)
    setSetupRequired(false)
  }

  async function setupMaster(id: string, name: string, password: string) {
    const next = await setupMasterRequest(id, name, password)
    setUser(next)
    setSetupRequired(false)
  }

  async function logout() {
    await logoutRequest()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, setupRequired, login, setupMaster, logout, refresh }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider가 필요합니다.')
  return value
}
