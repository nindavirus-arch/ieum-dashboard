import type { Channel, LeadRecord, ProjectRecord } from '../types'

export interface AttributedProject extends ProjectRecord {
  attributedChannel: Channel
  attributedSubChannel: string
  attributedSalesOwner: string
  attributionSource: 'project' | 'consultingNumber' | 'phone' | 'unknown'
}

const PAID_ATTRIBUTION_CHANNELS = new Set<Channel>([
  'naver',
  'google',
  'meta',
  'youtube',
  'viral',
  'danggeun',
  'kakao_search',
  'kakao_moment',
  'chatgpt',
])

const WEAK_ATTRIBUTION_CHANNELS = new Set<Channel>(['direct', 'inbound_call', 'etc'])

function leadSortValue(lead: LeadRecord) {
  return String(lead.registeredAt || lead.date || lead.uploadedAt || '')
}

function hasOwner(value?: string) {
  const owner = String(value || '').trim()
  if (!owner || owner === '-') return false
  return !['\uBBF8\uBC30\uC815', '\uC2DC\uC2A4\uD15C', 'system'].includes(owner.toLowerCase())
}

function chooseBetterLead(current: LeadRecord | undefined, next: LeadRecord) {
  if (!current) return next
  const currentHasOwner = hasOwner(current.salesOwner)
  const nextHasOwner = hasOwner(next.salesOwner)
  if (!currentHasOwner && nextHasOwner) return next
  if (currentHasOwner && !nextHasOwner) return current
  return leadSortValue(next).localeCompare(leadSortValue(current)) > 0 ? next : current
}

function isPaidAttribution(lead?: LeadRecord) {
  return Boolean(lead?.channel && PAID_ATTRIBUTION_CHANNELS.has(lead.channel))
}

function isWeakAttribution(lead?: LeadRecord) {
  return !lead?.channel || WEAK_ATTRIBUTION_CHANNELS.has(lead.channel)
}

function chooseAttributionLead(current: LeadRecord | undefined, next: LeadRecord | undefined) {
  if (!current) return next
  if (!next) return current

  const currentPaid = isPaidAttribution(current)
  const nextPaid = isPaidAttribution(next)
  if (currentPaid !== nextPaid) return nextPaid ? next : current

  const currentWeak = isWeakAttribution(current)
  const nextWeak = isWeakAttribution(next)
  if (currentWeak !== nextWeak) return currentWeak ? next : current

  return chooseBetterLead(current, next)
}

function preferredOwner(matchedLead: LeadRecord | undefined, project: ProjectRecord) {
  if (hasOwner(matchedLead?.salesOwner)) return String(matchedLead?.salesOwner || '').trim()
  if (hasOwner(project.salesOwner)) return String(project.salesOwner || '').trim()
  return ''
}

export function contractedProjects(projects: ProjectRecord[]) {
  return projects.filter(project => project.status === 'contracted' && Number(project.contractAmount || 0) > 0)
}

export function buildProjectAttribution(projects: ProjectRecord[], leads: LeadRecord[]): AttributedProject[] {
  const byConsulting = new Map<string, LeadRecord>()
  const byPhone = new Map<string, LeadRecord>()

  ;[...leads].sort((a, b) => leadSortValue(b).localeCompare(leadSortValue(a))).forEach(lead => {
    if (lead.consultingNumber) byConsulting.set(lead.consultingNumber, chooseBetterLead(byConsulting.get(lead.consultingNumber), lead))
    if (lead.phone) byPhone.set(lead.phone, chooseBetterLead(byPhone.get(lead.phone), lead))
  })

  return projects.map(project => {
    const consultingLead = project.consultingNumber ? byConsulting.get(project.consultingNumber) : undefined
    const phoneLead = project.phone ? byPhone.get(project.phone) : undefined
    const matchedLead = chooseAttributionLead(consultingLead, phoneLead)
    const attributionSource = matchedLead
      ? matchedLead === consultingLead
        ? 'consultingNumber'
        : 'phone'
      : project.channel
        ? 'project'
        : 'unknown'

    return {
      ...project,
      attributedChannel: matchedLead?.channel || project.channel || 'etc',
      attributedSubChannel: matchedLead?.subChannel || project.subChannel || project.sourceRaw || 'unknown',
      attributedSalesOwner: preferredOwner(matchedLead, project),
      attributionSource,
    }
  })
}

export function projectInRange(project: ProjectRecord, start?: string, end?: string) {
  if (!start && !end) return true
  if (start && project.contractDate < start) return false
  if (end && project.contractDate > end) return false
  return true
}
