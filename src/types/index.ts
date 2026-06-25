// src/types/index.ts

export type Channel = 'naver' | 'google' | 'meta' | 'youtube' | 'viral' | 'kakao_search' | 'kakao_moment' | 'direct' | 'tu_albarich' | 'tu_youtube' | 'tu_danggeun' | 'hugreen_danggeun' | 'hugreen_mail' | 'inbound_call' | 'etc'
export type DBTier = 'retarget' | 'first' | 'second' | 'first_reentry' | 'second_reentry'
export type DBStatus = 'retarget' | 'first' | 'second' | 'first_reentry' | 'second_reentry' | 'invalid' | 'test' | 'duplicate' | 'deleted' | 'valid'
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
  subChannel?: string   // 네이버 SA / 네이버 GFA / 구글 검색광고 등 상세 유입매체
  dbTier: DBTier
  status: DBStatus
  rawPhone?: string
  sourceKind?: SourceKind
  originPath?: string
  rawData?: Record<string, unknown>
  uploadedAt: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
  source_raw?: string
  params?: string
  address?: string
  building?: string
  brand?: string
  pyeong?: string
  source_file?: string
  registeredAt?: string
  consultationResult?: string
  memo?: string
  operator?: string
  changeHistory?: string
  updatedAt?: string
}


export interface AdSpend {
  id: string
  date: string          // YYYY-MM-DD
  channel: Channel
  subChannel?: string
  campaign?: string
  amount: number        // 원 단위
  memo?: string
  registrant?: string
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
