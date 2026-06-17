// src/types/index.ts

export type Channel = 'naver' | 'google' | 'meta' | 'youtube' | 'viral' | 'direct' | 'etc'
export type DBTier = 'retarget' | 'first' | 'second'
export type DBStatus = 'retarget' | 'first' | 'second' | 'invalid' | 'test' | 'duplicate'
export type SourceKind = 'first_raw' | 'second_raw' | 'unknown'
export type ViewMode = 'daily' | 'monthly' | 'yearly'

export interface LeadRecord {
  id: string
  date: string          // YYYY-MM-DD
  name: string
  phone: string
  region: string        // 시도
  district: string      // 시군구
  channel: Channel
  dbTier: DBTier
  status: DBStatus
  rawPhone?: string
  sourceKind?: SourceKind
  originPath?: string
  rawData?: Record<string, unknown>
  uploadedAt: string
}

export interface AdSpend {
  id: string
  date: string          // YYYY-MM-DD
  channel: Channel
  amount: number        // 원 단위
}

export interface DashboardSummary {
  todayDB: number
  monthDB: number
  monthAdSpend: number
  avgCPL: number
}

export interface ChannelStat {
  channel: Channel
  label: string
  adSpend: number
  cFunnel: number       // C퍼널 (총 유입)
  validDB: number       // 유효 DB
  cpl: number
  conversionRate: number
  color: string
  icon: string
}

export interface FunnelData {
  retarget: number
  first: number
  second: number
}

export interface RegionStat {
  region: string
  district?: string
  total: number
  retarget: number
  first: number
  second: number
}

export interface TimeSeriesData {
  label: string
  db: number
  adSpend: number
  cpl: number
}
