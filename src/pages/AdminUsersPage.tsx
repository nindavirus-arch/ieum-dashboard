import { useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw, ShieldCheck, X } from 'lucide-react'
import clsx from 'clsx'
import { createAdminUser, fetchAdminUsers, MENU_PERMISSIONS, SALES_SUPPORT_PERMISSIONS, updateAdminUser, type AdminRole, type AdminUser } from '../lib/auth'

const ROLE_LABELS: Record<AdminRole, string> = { master: '마스터', sales_support: '영업지원담당', custom: '사용자 지정' }

function rolePermissions(role: AdminRole, selected: string[]) {
  if (role === 'master') return ['*']
  if (role === 'sales_support') return SALES_SUPPORT_PERMISSIONS
  return selected
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    try { setUsers(await fetchAdminUsers()) }
    catch (err) { setNotice({ type: 'error', text: err instanceof Error ? err.message : '계정 목록을 불러오지 못했습니다.' }) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return <div className="p-4 md:p-6 space-y-5">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div><h1 className="text-lg font-bold text-slate-800">관리자 계정 관리</h1><p className="mt-0.5 text-xs text-slate-500">계정을 생성하고 메뉴별 접근 권한을 관리합니다.</p></div>
      <div className="flex gap-2"><button onClick={() => setCreating(true)} className="btn-primary"><Plus size={14}/> 계정 생성</button><button onClick={load} className="btn-secondary"><RefreshCw size={13} className={clsx(loading && 'animate-spin')}/> 새로고침</button></div>
    </div>
    {notice && <div className={clsx('rounded-lg border px-4 py-3 text-sm', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700')}>{notice.text}</div>}
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500"><th className="px-4 py-3 text-left">아이디</th><th className="px-4 py-3 text-left">이름</th><th className="px-4 py-3 text-left">역할</th><th className="px-4 py-3 text-left">접근 메뉴</th><th className="px-4 py-3 text-left">상태</th><th className="px-4 py-3 text-left">관리</th></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {users.map(user => <tr key={user.id}>
              <td className="px-4 py-3 font-semibold text-slate-700">{user.id}</td>
              <td className="px-4 py-3 text-slate-600">{user.name || '-'}</td>
              <td className="px-4 py-3"><span className={clsx('rounded-md px-2 py-1 text-xs font-medium', user.role === 'master' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600')}>{ROLE_LABELS[user.role]}</span></td>
              <td className="px-4 py-3 text-xs text-slate-500">{user.role === 'master' ? '전체 메뉴' : MENU_PERMISSIONS.filter(menu => user.permissions.includes(menu.key)).map(menu => menu.label).join(', ') || '-'}</td>
              <td className="px-4 py-3"><span className={clsx('text-xs font-medium', user.active ? 'text-emerald-600' : 'text-red-500')}>{user.active ? '사용중' : '비활성'}</span></td>
              <td className="px-4 py-3"><button onClick={() => setEditing(user)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"><Pencil size={12}/> 수정</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
    {creating && <UserFormModal mode="create" onClose={() => setCreating(false)} onSaved={async () => { setCreating(false); await load(); setNotice({ type: 'success', text: '관리자 계정이 생성되었습니다.' }) }} />}
    {editing && <UserFormModal mode="edit" user={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); setNotice({ type: 'success', text: '계정 정보가 수정되었습니다.' }) }} />}
  </div>
}

function UserFormModal({ mode, user, onClose, onSaved }: { mode: 'create' | 'edit'; user?: AdminUser; onClose: () => void; onSaved: () => void }) {
  const [id, setId] = useState(user?.id || '')
  const [name, setName] = useState(user?.name || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AdminRole>(user?.role || 'sales_support')
  const [permissions, setPermissions] = useState<string[]>(user?.permissions?.filter(value => value !== '*') || SALES_SUPPORT_PERMISSIONS)
  const [active, setActive] = useState(user?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function changeRole(next: AdminRole) {
    setRole(next)
    if (next === 'sales_support') setPermissions(SALES_SUPPORT_PERMISSIONS)
    if (next === 'master') setPermissions([])
  }
  function togglePermission(key: string) {
    setPermissions(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key])
  }
  async function save() {
    setError('')
    if (!id.trim() || (mode === 'create' && password.length < 8)) {
      setError('아이디와 8자리 이상의 초기 비밀번호를 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      if (mode === 'create') await createAdminUser({ id: id.trim(), name: name.trim(), password, role, permissions: rolePermissions(role, permissions) })
      else await updateAdminUser({ id: id.trim(), name: name.trim(), password: password || undefined, role, permissions: rolePermissions(role, permissions), active })
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '계정 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
    <div className="w-full max-w-2xl space-y-4 rounded-lg bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-blue-600"/><h2 className="font-bold text-slate-800">{mode === 'create' ? '관리자 계정 생성' : '관리자 계정 수정'}</h2></div><button onClick={onClose}><X size={18}/></button></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs text-slate-500">아이디<input disabled={mode === 'edit'} value={id} onChange={event => setId(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50" /></label>
        <label className="space-y-1 text-xs text-slate-500">이름<input value={name} onChange={event => setName(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="space-y-1 text-xs text-slate-500">{mode === 'create' ? '초기 비밀번호' : '새 비밀번호(변경 시만)'}<input type="password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="space-y-1 text-xs text-slate-500">역할<select value={role} onChange={event => changeRole(event.target.value as AdminRole)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="master">마스터</option><option value="sales_support">영업지원담당</option><option value="custom">사용자 지정</option></select></label>
      </div>
      {role === 'custom' && <div><p className="mb-2 text-xs font-semibold text-slate-600">메뉴별 권한</p><div className="grid grid-cols-2 gap-2 md:grid-cols-3">{MENU_PERMISSIONS.filter(menu => menu.key !== '/admin-users').map(menu => <label key={menu.key} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs text-slate-600"><input type="checkbox" checked={permissions.includes(menu.key)} onChange={() => togglePermission(menu.key)} />{menu.label}</label>)}</div></div>}
      {mode === 'edit' && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />계정 사용</label>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      <div className="flex justify-end gap-2"><button onClick={onClose} className="btn-secondary">취소</button><button onClick={save} disabled={saving} className="btn-primary">{saving ? '저장 중...' : '저장'}</button></div>
    </div>
  </div>
}
