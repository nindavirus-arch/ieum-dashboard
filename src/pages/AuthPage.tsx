import { useState } from 'react'
import { LockKeyhole, Megaphone } from 'lucide-react'
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

  return <div className="min-h-screen bg-slate-100 px-4 py-10 flex items-center justify-center">
    <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white"><Megaphone size={20}/></div>
        <div><h1 className="font-bold text-slate-800">창호마스터 이음</h1><p className="text-xs text-slate-400">관리자 대시보드</p></div>
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
