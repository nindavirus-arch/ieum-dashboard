// src/App.tsx
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

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/channels" element={<ChannelsPage />} />
        <Route path="/upload-db" element={<UploadDBPage />} />
        <Route path="/upload-spend" element={<UploadAdSpendPage />} />
        <Route path="/manage-spend" element={<AdSpendManagePage />} />
        <Route path="/region" element={<RegionPage />} />
        <Route path="/db-manage" element={<DBManagePage />} />
        <Route path="/funnel" element={<FunnelPage />} />
      </Routes>
    </Layout>
  )
}
