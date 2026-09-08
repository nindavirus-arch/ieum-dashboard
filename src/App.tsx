import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import AuthPage from './pages/AuthPage'
import { useAuth } from './contexts/AuthContext'
import { canAccess, defaultPath } from './lib/auth'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ChannelsPage = lazy(() => import('./pages/ChannelsPage'))
const UploadDBPage = lazy(() => import('./pages/UploadDBPage'))
const UploadProjectsPage = lazy(() => import('./pages/UploadProjectsPage'))
const DBManagePage = lazy(() => import('./pages/DBManagePage'))
const UploadAdSpendPage = lazy(() => import('./pages/UploadAdSpendPage'))
const RegionPage = lazy(() => import('./pages/RegionPage'))
const FunnelPage = lazy(() => import('./pages/FunnelPage'))
const AdSpendManagePage = lazy(() => import('./pages/AdSpendManagePage'))
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'))
const OnlineKpiPage = lazy(() => import('./pages/OnlineKpiPage'))
const SalesPerformancePage = lazy(() => import('./pages/SalesPerformancePage'))

function PageLoading() {
  return <div className="min-h-[50vh] flex items-center justify-center text-sm text-slate-500">화면을 불러오고 있습니다.</div>
}

export default function App() {
  const { user, loading, setupRequired } = useAuth()

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-sm text-slate-500">관리자 정보를 확인하고 있습니다.</div>
  if (setupRequired) return <AuthPage setup />
  if (!user) return <AuthPage setup={false} />

  const home = defaultPath(user)
  const allowed = (path: string, element: React.ReactNode) => canAccess(user, path) ? <Route path={path} element={element} /> : null

  return <Layout>
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        {allowed('/dashboard', <DashboardPage />)}
        {allowed('/channels', <ChannelsPage />)}
        {allowed('/kpi', <OnlineKpiPage />)}
        {allowed('/funnel', <FunnelPage />)}
        {allowed('/region', <RegionPage />)}
        {allowed('/db-manage', <DBManagePage />)}
        {allowed('/upload-db', <UploadDBPage />)}
        {allowed('/upload-projects', <UploadProjectsPage />)}
        {allowed('/upload-spend', <UploadAdSpendPage />)}
        {allowed('/manage-spend', <AdSpendManagePage />)}
        {allowed('/sales-performance', <SalesPerformancePage />)}
        {allowed('/admin-users', <AdminUsersPage />)}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Suspense>
  </Layout>
}
