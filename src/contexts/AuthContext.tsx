import { createContext, useContext, useEffect, useState } from 'react'
import { fetchAuthStatus, login as loginRequest, logout as logoutRequest, setupMaster as setupMasterRequest, type AdminUser } from '../lib/auth'

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
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

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

