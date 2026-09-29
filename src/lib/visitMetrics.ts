import type { ConsultingStatusEvent } from './dataService'

export type VisitPath = 'after_estimate' | 'after_consultation' | 'unknown'

export type VisitMilestone = ConsultingStatusEvent & {
  path: VisitPath
}

export const VISIT_PATH_LABELS: Record<VisitPath, string> = {
  after_estimate: '알림톡 무료방문상담 신청',
  after_consultation: '상담신청 후 방문신청',
  unknown: '이전 경로 확인 불가',
}

function normalizeStatus(value: string) {
  return String(value || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '')
}

function eventTime(event: ConsultingStatusEvent) {
  const normalized = String(event.registeredAt || event.date || '').replace(/[./]/g, '-').replace(/\s+/g, ' ').trim()
  const parsed = new Date(normalized.includes('T') ? normalized : normalized.replace(' ', 'T')).getTime()
  return Number.isFinite(parsed) ? parsed : new Date(`${event.date}T00:00:00`).getTime()
}

function isVisit(status: string) {
  return normalizeStatus(status) === '로켓방문요청'
}

function isEstimate(status: string) {
  return normalizeStatus(status) === '로켓견적확인'
}

function isConsultation(status: string) {
  const normalized = normalizeStatus(status)
  return normalized === '로켓요청' || normalized === '로켓상담요청' || normalized === '상담요청'
}

export function buildVisitMilestones(events: ConsultingStatusEvent[]): VisitMilestone[] {
  const seen = new Set<string>()
  const ordered = events
    .filter(event => {
      const key = `${event.phone}|${event.consultingNumber}|${normalizeStatus(event.status)}|${event.registeredAt}|${event.date}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => eventTime(a) - eventTime(b) || a.sequence - b.sequence)

  return ordered.filter(event => isVisit(event.status)).map(visit => {
    const prior = ordered.filter(candidate => {
      if (candidate === visit || eventTime(candidate) > eventTime(visit)) return false
      if (eventTime(candidate) === eventTime(visit) && candidate.sequence >= visit.sequence) return false
      return visit.consultingNumber
        ? candidate.consultingNumber === visit.consultingNumber
        : candidate.phone === visit.phone
    })
    const sameConsultingHasPath = prior.some(candidate => isConsultation(candidate.status) || isEstimate(candidate.status))
    const phonePrior = sameConsultingHasPath ? prior : ordered.filter(candidate =>
      candidate.phone === visit.phone &&
      (eventTime(candidate) < eventTime(visit) || (eventTime(candidate) === eventTime(visit) && candidate.sequence < visit.sequence))
    )
    // 견적확인 이력이 있으면 알림톡의 무료방문상담 경로를 우선한다.
    const path: VisitPath = phonePrior.some(candidate => isEstimate(candidate.status))
      ? 'after_estimate'
      : phonePrior.some(candidate => isConsultation(candidate.status))
        ? 'after_consultation'
        : 'unknown'
    return { ...visit, path }
  })
}

export function latestVisitByPhone(milestones: VisitMilestone[]) {
  const map = new Map<string, VisitMilestone>()
  milestones.forEach(milestone => {
    const current = map.get(milestone.phone)
    if (!current || eventTime(milestone) > eventTime(current) || (eventTime(milestone) === eventTime(current) && milestone.sequence > current.sequence)) {
      map.set(milestone.phone, milestone)
    }
  })
  return map
}
