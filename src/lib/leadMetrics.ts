import type { DBTier, LeadRecord } from '../types'

export type FinalStage = 'retarget' | 'first' | 'second'
export type TrafficGroup = 'paid' | 'organic' | 'external' | 'unclassified'

export interface LeadJourney {
  lead: LeadRecord
  stage: FinalStage
  hadRetarget: boolean
  hadFirst: boolean
  hadSecond: boolean
  secondType: 'estimate_to_consult' | 'direct_consult' | null
}

const PAID_CHANNELS = new Set(['naver', 'google', 'meta', 'youtube', 'viral', 'kakao_search', 'kakao_moment'])
const EXTERNAL_CHANNELS = new Set(['tu_albarich', 'tu_youtube', 'tu_danggeun', 'hugreen_danggeun', 'hugreen_mail', 'inbound_call'])
const EXCLUDED_STATUSES = new Set(['invalid', 'test', 'duplicate', 'deleted'])

export function baseStage(tier: DBTier): FinalStage {
  if (tier === 'second' || tier === 'second_reentry') return 'second'
  if (tier === 'first' || tier === 'first_reentry') return 'first'
  return 'retarget'
}

function stageRank(tier: DBTier) {
  const stage = baseStage(tier)
  if (stage === 'second') return 3
  if (stage === 'first') return 2
  return 1
}

function sortValue(lead: LeadRecord) {
  return String(lead.registeredAt || lead.date || lead.uploadedAt || '')
}

export function isActiveLead(lead: LeadRecord) {
  return !EXCLUDED_STATUSES.has(String(lead.status || '').toLowerCase())
}

export function buildLeadJourneys(leads: LeadRecord[]): LeadJourney[] {
  const grouped = new Map<string, LeadRecord[]>()

  leads.filter(isActiveLead).forEach((lead, index) => {
    const key = lead.phone || lead.rawPhone || lead.id || `row_${index}`
    const rows = grouped.get(key) || []
    rows.push(lead)
    grouped.set(key, rows)
  })

  return Array.from(grouped.values()).map((rows) => {
    const sorted = [...rows].sort((a, b) => sortValue(a).localeCompare(sortValue(b)))
    const hadRetarget = sorted.some(row => baseStage(row.dbTier) === 'retarget')
    const hadFirst = sorted.some(row => baseStage(row.dbTier) === 'first')
    const hadSecond = sorted.some(row => baseStage(row.dbTier) === 'second')
    const finalLead = [...sorted].sort((a, b) => {
      const rankDiff = stageRank(b.dbTier) - stageRank(a.dbTier)
      return rankDiff || sortValue(b).localeCompare(sortValue(a))
    })[0]
    const stage = baseStage(finalLead.dbTier)
    const firstBeforeFinalSecond = stage === 'second' && sorted.some(row =>
      baseStage(row.dbTier) === 'first' && sortValue(row) <= sortValue(finalLead)
    )

    return {
      lead: { ...finalLead, dbTier: stage },
      stage,
      hadRetarget,
      hadFirst,
      hadSecond,
      secondType: stage === 'second' ? (firstBeforeFinalSecond ? 'estimate_to_consult' : 'direct_consult') : null,
    }
  })
}

export function finalLeads(leads: LeadRecord[]) {
  return buildLeadJourneys(leads).map(journey => journey.lead)
}

function normalizedText(lead: LeadRecord) {
  return `${lead.subChannel || ''} ${lead.source_raw || ''} ${lead.utm_source || ''} ${lead.utm_medium || ''}`
    .toLowerCase()
    .replace(/[\s_\-\/()\[\].]/g, '')
}

export function isDirectSales(lead: LeadRecord) {
  const text = normalizedText(lead)
  return text.includes('직접영업') || text.includes('directsales')
}

export function isOnlineOther(lead: LeadRecord) {
  const text = normalizedText(lead)
  return text.includes('온라인기타') || text.includes('onlineother') || text.includes('홈페이지') || text.includes('website') || text.includes('homepage')
}

export function trafficGroup(lead: LeadRecord): TrafficGroup {
  if (PAID_CHANNELS.has(lead.channel)) return 'paid'
  if (isDirectSales(lead)) return 'external'
  if (lead.channel === 'direct' || isOnlineOther(lead)) return 'organic'
  if (EXTERNAL_CHANNELS.has(lead.channel)) return 'external'
  return 'unclassified'
}

export function isPaidChannel(channel: string) {
  return PAID_CHANNELS.has(channel)
}
