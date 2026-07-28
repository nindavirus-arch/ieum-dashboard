import type { Channel, LeadRecord, ProjectRecord } from '../types'

export interface AttributedProject extends ProjectRecord {
  attributedChannel: Channel
  attributedSubChannel: string
  attributedSalesOwner: string
  attributionSource: 'project' | 'consultingNumber' | 'phone' | 'unknown'
}

function leadSortValue(lead: LeadRecord) {
  return String(lead.registeredAt || lead.date || lead.uploadedAt || '')
}

function hasOwner(value?: string) {
  const owner = String(value || '').trim()
  if (!owner || owner === '-') return false
  return !['미배정', '시스템', 'system'].includes(owner.toLowerCase())
}

function chooseBetterLead(current: LeadRecord | undefined, next: LeadRecord) {
  if (!current) return next
  const currentHasOwner = hasOwner(current.salesOwner)
  const nextHasOwner = hasOwner(next.salesOwner)
  if (!currentHasOwner && nextHasOwner) return next
  if (currentHasOwner && !nextHasOwner) return current
  return leadSortValue(next).localeCompare(leadSortValue(current)) > 0 ? next : current
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
    const matchedLead = consultingLead || phoneLead
    const attributionSource = project.channel
      ? 'project'
      : consultingLead
        ? 'consultingNumber'
        : phoneLead
          ? 'phone'
          : 'unknown'

    return {
      ...project,
      attributedChannel: project.channel || matchedLead?.channel || 'etc',
      attributedSubChannel: project.subChannel || matchedLead?.subChannel || project.sourceRaw || '미확인',
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
