import { SHEET_API_URL } from './apiConfig'

export const AUTH_TOKEN_KEY = 'ieum-admin-token'

export const MENU_PERMISSIONS = [
  { key: '/dashboard', label: '메인 대시보드' },
  { key: '/channels', label: '매체별 성과' },
  { key: '/funnel', label: '퍼널 분석' },
  { key: '/region', label: '지역별 통계' },
  { key: '/db-manage', label: 'DB관리' },
  { key: '/upload-db', label: 'DB 업로드' },
  { key: '/upload-spend', label: '광고비 업로드' },
  { key: '/manage-spend', label: '광고비 관리' },
  { key: '/admin-users', label: '관리자 계정 관리' },
] as const

export const SALES_SUPPORT_PERMISSIONS = ['/db-manage', '/upload-db', '/region']

export type AdminRole = 'master' | 'sales_support' | 'custom'

export interface AdminUser {
  id: string
  name: string
  role: AdminRole
  permissions: string[]
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export function getAuthToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY) || ''
}

export function setAuthToken(token: string) {
  if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token)
  else window.localStorage.removeItem(AUTH_TOKEN_KEY)
}

export function canAccess(user: AdminUser | null, path: string) {
  if (!user) return false
  return user.role === 'master' || user.permissions.includes('*') || user.permissions.includes(path)
}

export function defaultPath(user: AdminUser) {
  const found = MENU_PERMISSIONS.find(menu => canAccess(user, menu.key))
  return found?.key || '/db-manage'
}

async function parseResponse(res: Response) {
  if (!res.ok) throw new Error('인증 서버에 연결하지 못했습니다.')
  const data = await res.json()
  if (data?.error === 'unauthorized') {
    setAuthToken('')
    throw new Error('로그인이 만료되었습니다. 다시 로그인해주세요.')
  }
  const messages: Record<string, string> = {
    forbidden: '이 기능을 사용할 권한이 없습니다.',
    'invalid credentials': '아이디 또는 비밀번호가 올바르지 않습니다.',
    'id already exists': '이미 사용 중인 아이디입니다.',
    'user not found': '계정을 찾을 수 없습니다.',
    'setup already completed': '마스터 계정 설정이 이미 완료되었습니다.',
    'cannot remove your own master access': '현재 로그인한 마스터 계정의 권한은 해제할 수 없습니다.',
    'password must be at least 8 characters': '비밀번호는 8자리 이상이어야 합니다.',
  }
  if (data?.error) throw new Error(messages[data.error] || data.error)
  return data
}

async function authPost(type: string, payload: Record<string, unknown> = {}) {
  const res = await fetch(SHEET_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ type, token: getAuthToken(), ...payload }),
  })
  return parseResponse(res)
}

export async function fetchAuthStatus() {
  const token = getAuthToken()
  const res = await fetch(`${SHEET_API_URL}?type=authStatus&token=${encodeURIComponent(token)}`)
  return parseResponse(res) as Promise<{ setupRequired: boolean; user?: AdminUser }>
}

export async function setupMaster(id: string, name: string, password: string) {
  const data = await authPost('authSetup', { id, name, password })
  setAuthToken(data.token)
  return data.user as AdminUser
}

export async function login(id: string, password: string) {
  const data = await authPost('authLogin', { id, password })
  setAuthToken(data.token)
  return data.user as AdminUser
}

export async function logout() {
  try { await authPost('authLogout') } catch {}
  setAuthToken('')
}

export async function fetchAdminUsers() {
  const data = await authPost('authListUsers')
  return (data.users || []) as AdminUser[]
}

export async function createAdminUser(input: { id: string; name: string; password: string; role: AdminRole; permissions: string[] }) {
  const data = await authPost('authCreateUser', input)
  return data.user as AdminUser
}

export async function updateAdminUser(input: { id: string; name?: string; password?: string; role?: AdminRole; permissions?: string[]; active?: boolean }) {
  const data = await authPost('authUpdateUser', input)
  return data.user as AdminUser
}
