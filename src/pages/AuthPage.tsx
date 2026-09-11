import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function AuthPage({ setup }: { setup: boolean }) {
  const { login, setupMaster } = useAuth()
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!id.trim() || password.length < 8) {
      setError('아이디와 8자리 이상의 비밀번호를 입력해주세요.')
      return
    }
    if (setup && password !== confirm) {
      setError('비밀번호 확인이 일치하지 않습니다.')
      return
    }
    setSaving(true)
    try {
      if (setup) await setupMaster(id.trim(), name.trim() || '마스터', password)
      else await login(id.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="flex min-h-screen items-center justify-center bg-[#f5f7fa] px-4 py-10">
    <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
      <div className="mb-6 flex flex-col items-center border-b border-slate-100 pb-5 text-center">
        <img src="/changho-master-logo.png" alt="창호마스터 이음 공식 로고" className="h-28 w-28 rounded-full border border-slate-100 object-cover shadow-sm" />
        <h1 className="mt-3 text-base font-bold text-slate-900">창호마스터 이음</h1>
        <p className="mt-1 text-xs font-medium text-slate-400">광고 성과 관리자 대시보드</p>
      </div>
      <div className="mb-5">
        <div className="flex items-center gap-2 text-slate-700"><LockKeyhole size={17}/><h2 className="font-semibold">{setup ? '최초 마스터 계정 설정' : '관리자 로그인'}</h2></div>
        <p className="mt-1 text-xs text-slate-500">{setup ? '처음 사용할 마스터 계정을 생성합니다.' : '권한이 있는 관리자 계정으로 로그인해주세요.'}</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label className="block space-y-1 text-xs text-slate-500">아이디<input autoComplete="username" value={id} onChange={event => setId(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
        {setup && <label className="block space-y-1 text-xs text-slate-500">이름<input value={name} onChange={event => setName(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>}
        <label className="block space-y-1 text-xs text-slate-500">비밀번호<input type="password" autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
        {setup && <label className="block space-y-1 text-xs text-slate-500">비밀번호 확인<input type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <button disabled={saving} className="btn-primary w-full justify-center py-2.5">{saving ? '처리 중...' : setup ? '마스터 계정 생성' : '로그인'}</button>
      </form>
    </div>
  </div>
}
