import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import ChannelsPage from './pages/ChannelsPage'
import UploadDBPage from './pages/UploadDBPage'
import DBManagePage from './pages/DBManagePage'
import UploadAdSpendPage from './pages/UploadAdSpendPage'
import RegionPage from './pages/RegionPage'
import FunnelPage from './pages/FunnelPage'
import AdSpendManagePage from './pages/AdSpendManagePage'
import AdminUsersPage from './pages/AdminUsersPage'
import OnlineKpiPage from './pages/OnlineKpiPage'
import AuthPage from './pages/AuthPage'
import { useAuth } from './contexts/AuthContext'
import { canAccess, defaultPath } from './lib/auth'

export default function App() {
  const { user, loading, setupRequired } = useAuth()

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-sm text-slate-500">관리자 정보를 확인하고 있습니다.</div>
  if (setupRequired) return <AuthPage setup />
  if (!user) return <AuthPage setup={false} />

  const home = defaultPath(user)
  const allowed = (path: string, element: React.ReactNode) => canAccess(user, path) ? <Route path={path} element={element} /> : null

  return <Layout>
    <Routes>
      <Route path="/" element={<Navigate to={home} replace />} />
      {allowed('/dashboard', <DashboardPage />)}
      {allowed('/channels', <ChannelsPage />)}
      {allowed('/kpi', <OnlineKpiPage />)}
      {allowed('/funnel', <FunnelPage />)}
      {allowed('/region', <RegionPage />)}
      {allowed('/db-manage', <DBManagePage />)}
      {allowed('/upload-db', <UploadDBPage />)}
      {allowed('/upload-spend', <UploadAdSpendPage />)}
      {allowed('/manage-spend', <AdSpendManagePage />)}
      {allowed('/admin-users', <AdminUsersPage />)}
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  </Layout>
}
