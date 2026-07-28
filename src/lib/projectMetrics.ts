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

export function contractedProjects(projects: ProjectRecord[]) {
  return projects.filter(project => project.status === 'contracted' && Number(project.contractAmount || 0) > 0)
}

export function buildProjectAttribution(projects: ProjectRecord[], leads: LeadRecord[]): AttributedProject[] {
  const byConsulting = new Map<string, LeadRecord>()
  const byPhone = new Map<string, LeadRecord>()

  ;[...leads].sort((a, b) => leadSortValue(b).localeCompare(leadSortValue(a))).forEach(lead => {
    if (lead.consultingNumber && !byConsulting.has(lead.consultingNumber)) byConsulting.set(lead.consultingNumber, lead)
    if (lead.phone && !byPhone.has(lead.phone)) byPhone.set(lead.phone, lead)
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
      attributedSalesOwner: matchedLead?.salesOwner || project.salesOwner || '',
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
