// src/lib/dataService.ts
// Google Sheets 연동형 데이터 서비스
// - 1차DB 파일(파일명: 컨설팅UTM 포함) 업로드 → FIRST_DB_RAW + DASHBOARD_LEADS 저장
// - 2차DB 파일(파일명: 컨설팅리스트 포함) 업로드 → SECOND_DB_RAW + DASHBOARD_LEADS 저장
// - 중복 방지는 프론트 + Apps Script 양쪽에서 처리
// - 채널 판별은 utm_source/source/유입경로 우선, params는 매체 판별에 사용하지 않음

import type { LeadRecord, AdSpend, DBTier, Channel, SourceKind } from '../types'
import { normalizeDate, normalizePhone, normalizeChannel, inferChannelStrict, inferSubChannel } from './excelParser'

// TODO: Apps Script 배포 후 웹앱 URL을 여기에 붙여넣으세요.
// 예: const SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbxxxx/exec'
const SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbzbjYEl7YE7ghlc11OYiijmSdKx0AqNIlh1QoaC1iPzfWABB5F1vS7WSKZ3WQeFMuFs0g/exec'

type SheetType = 'leads' | 'adSpend' | 'firstRaw' | 'secondRaw' | 'mapping'
type PostSheetType = Exclude<SheetType, 'mapping'> | 'adSpendReplace'
export type MappingRow = { raw: string; channel: Channel; subChannel: string }
const EXCLUDED_LEAD_STATUSES = new Set(['invalid', 'test', 'duplicate', 'deleted'])

function makeId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function inRange(date: string, startDate?: string, endDate?: string) {
  if (startDate && date < startDate) return false
  if (endDate && date > endDate) return false
  return true
}

function tierRank(tier: DBTier) {
  if (tier === 'second' || tier === 'second_reentry') return 3
  if (tier === 'first' || tier === 'first_reentry') return 2
  return 1
}

function baseTier(tier: DBTier): DBTier {
  if (tier === 'first_reentry') return 'first'
  if (tier === 'second_reentry') return 'second'
  return tier
}

function reentryTier(tier: DBTier): DBTier {
  if (tier === 'first') return 'first_reentry'
  if (tier === 'second') return 'second_reentry'
  return tier
}

function isWeakChannel(ch?: Channel) {
  return !ch || ch === 'etc' || ch === 'direct'
}

function chooseAttribution(prev: LeadRecord, next: LeadRecord): Channel {
  // 2차DB가 홈페이지/direct로 찍힌 경우, 같은 연락처의 1차DB 매체를 승계
  if (next.dbTier === 'second' && isWeakChannel(next.channel) && !isWeakChannel(prev.channel)) return prev.channel
  if (!isWeakChannel(next.channel)) return next.channel
  if (!isWeakChannel(prev.channel)) return prev.channel
  return next.channel || prev.channel || 'etc'
}

function chooseSubChannel(prev: LeadRecord, next: LeadRecord, chosenChannel: Channel): string {
  let candidate = ''
  if (next.dbTier === 'second' && isWeakChannel(next.channel) && prev.subChannel) candidate = prev.subChannel
  else if (next.subChannel && next.channel === chosenChannel) candidate = next.subChannel
  else if (prev.subChannel && prev.channel === chosenChannel) candidate = prev.subChannel
  return sanitizeSubChannelForChannel(chosenChannel, candidate, { source: next.utm_source, sourceRaw: next.source_raw, medium: next.utm_medium, campaign: next.utm_campaign, content: next.utm_content, term: next.utm_term })
}

function normKey(v: unknown) {
  return String(v ?? '').toLowerCase().replace(/[\s_\-\/()\[\].]/g, '')
}

function normalizeMappingRow(row: any): MappingRow | null {
  const raw = String(row['원본값'] ?? row.raw ?? row.source ?? row.keyword ?? '').trim()
  if (!raw) return null
  const channel = normalizeChannel(row['최종매체'] ?? row.channel ?? row.finalChannel ?? '')
  const subChannel = String(row['상세매체'] ?? row.subChannel ?? row.detail ?? '').trim()
  return { raw, channel, subChannel }
}

function applyChannelMapping(input: {
  channel?: Channel
  subChannel?: string
  utm_source?: unknown
  source_raw?: unknown
  utm_medium?: unknown
  utm_campaign?: unknown
  utm_content?: unknown
  utm_term?: unknown
}, mappings: MappingRow[]): { channel: Channel; subChannel: string } {
  const candidates = [input.utm_source, input.source_raw, input.utm_medium, input.utm_campaign, input.utm_content, input.utm_term]
    .map(v => String(v ?? '').trim())
    .filter(Boolean)

  for (const c of candidates) {
    const ck = normKey(c)
    const found = mappings.find(m => {
      const mk = normKey(m.raw)
      return mk && (ck === mk || ck.includes(mk))
    })
    if (found) {
      const channel = found.channel !== 'etc' ? found.channel : (input.channel || 'etc')
      const subChannel = found.subChannel || input.subChannel || inferSubChannel({ channel, source: input.utm_source, sourceRaw: input.source_raw, medium: input.utm_medium, campaign: input.utm_campaign, content: input.utm_content, term: input.utm_term })
      return { channel, subChannel }
    }
  }

  const channel = inferChannelStrict({ source: input.utm_source, sourceRaw: input.source_raw, medium: input.utm_medium, campaign: input.utm_campaign, content: input.utm_content, term: input.utm_term })
  const finalChannel = channel !== 'etc' ? channel : (input.channel || 'etc')
  return {
    channel: finalChannel,
    subChannel: input.subChannel || inferSubChannel({ channel: finalChannel, source: input.utm_source, sourceRaw: input.source_raw, medium: input.utm_medium, campaign: input.utm_campaign, content: input.utm_content, term: input.utm_term }),
  }
}


function subChannelImpliesChannel(label?: string): Channel | '' {
  const t = String(label || '').toLowerCase().replace(/[\s_\-\/()\[\].]/g, '')
  if (!t) return ''
  if (t.includes('네이버') || t.includes('naver') || t.includes('gfa') || t.includes('브랜드검색')) return 'naver'
  if (t.includes('구글') || t.includes('google') || t.includes('디맨드') || t.includes('demand') || t.includes('gdn')) return 'google'
  if (t.includes('메타') || t.includes('인스타') || t.includes('facebook') || t.includes('meta')) return 'meta'
  if (t.includes('유튜브') || t.includes('youtube')) return 'youtube'
  if (t.includes('바이럴') || t.includes('블로그') || t.includes('레뷰') || t.includes('카페')) return 'viral'
  if (t.includes('카카오검색') || t.includes('kakaosearch') || t.includes('kakaosa')) return 'kakao_search'
  if (t.includes('카카오모먼트') || t.includes('카카오모멘트') || t.includes('kakaomoment')) return 'kakao_moment'
  if (t.includes('홈페이지') || t.includes('직접유입') || t.includes('direct')) return 'direct'
  if (t.includes('tu알바리치') || t === 'tu') return 'tu_albarich'
  if (t.includes('tu유튜브') || t.includes('tu유투브')) return 'tu_youtube'
  if (t.includes('tu당근')) return 'tu_danggeun'
  if (t.includes('휴그린당근')) return 'hugreen_danggeun'
  if (t.includes('휴그린메일') || t.includes('휴그린본사')) return 'hugreen_mail'
  if (t.includes('인바운드') || t.includes('인입콜')) return 'inbound_call'
  return ''
}

function sanitizeSubChannelForChannel(channel: Channel, subChannel: string, context: { source?: unknown; sourceRaw?: unknown; medium?: unknown; campaign?: unknown; content?: unknown; term?: unknown }) {
  const implied = subChannelImpliesChannel(subChannel)
  if (implied && implied !== channel) {
    return inferSubChannel({ channel, source: context.source, sourceRaw: context.sourceRaw, medium: context.medium, campaign: context.campaign, content: context.content, term: context.term })
  }
  return subChannel || inferSubChannel({ channel, source: context.source, sourceRaw: context.sourceRaw, medium: context.medium, campaign: context.campaign, content: context.content, term: context.term })
}

function normalizeLead(row: any, index = 0, mappings: MappingRow[] = []): LeadRecord {
  const uploadedAt = String(row.uploadedAt ?? row.uploaded_at ?? row._uploadedAt ?? new Date().toISOString())
  const stage = String(row.stage ?? row.dbTier ?? row.DB등급 ?? row.등급 ?? row._parsed_stage ?? 'retarget') as DBTier
  const phone = normalizePhone(row.phone ?? row.연락처 ?? row.휴대폰번호 ?? row['휴대폰 번호'] ?? row._parsed_phone ?? '')

  const utm_source = String(row.utm_source ?? row.utmSource ?? row.source ?? row.소스 ?? '')
  const utm_medium = String(row.utm_medium ?? row.utmMedium ?? row.medium ?? row.미디엄 ?? '')
  const utm_campaign = String(row.utm_campaign ?? row.utmCampaign ?? row.campaign ?? row.캠페인 ?? '')
  const utm_content = String(row.utm_content ?? row.utmContent ?? row.content ?? row.콘텐츠 ?? '')
  const utm_term = String(row.utm_term ?? row.utmTerm ?? row.term ?? row.키워드 ?? '')
  const source_raw = String(row.source_raw ?? row.sourceRaw ?? row.유입경로 ?? row['유입 경로'] ?? row.source ?? '')
  const baseChannel = normalizeChannel(row.channel ?? row.최종매체 ?? row.매체 ?? row._parsed_channel ?? '')
  const mapped = applyChannelMapping({ channel: baseChannel, subChannel: String(row.subChannel ?? row.상세매체 ?? ''), utm_source, source_raw, utm_medium, utm_campaign, utm_content, utm_term }, mappings)
  const safeSubChannel = sanitizeSubChannelForChannel(mapped.channel, mapped.subChannel, { source: utm_source, sourceRaw: source_raw, medium: utm_medium, campaign: utm_campaign, content: utm_content, term: utm_term })

  return {
    id: String(row.id ?? phone ?? makeId('lead')),
    date: normalizeDate(row.date ?? row.날짜 ?? row.등록일 ?? row.등록일시 ?? row.신청일 ?? row._parsed_date, new Date(uploadedAt)),
    phone,
    rawPhone: String(row.rawPhone ?? row.연락처 ?? row.휴대폰번호 ?? row['휴대폰 번호'] ?? ''),
    name: String(row.name ?? row.이름 ?? row.성명 ?? row.고객명 ?? row._parsed_name ?? ''),
    dbTier: stage,
    channel: mapped.channel,
    subChannel: safeSubChannel,
    region: String(row.region ?? row.시도 ?? row['시/도'] ?? row.지역 ?? row._parsed_region ?? ''),
    district: String(row.district ?? row.시군구 ?? row['시/군/구'] ?? row._parsed_district ?? ''),
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    source_raw,
    params: String(row.params ?? ''),
    address: String(row.address ?? row.주소 ?? ''),
    building: String(row.building ?? row.건물명 ?? row.아파트명 ?? ''),
    brand: String(row.brand ?? row.브랜드 ?? ''),
    pyeong: String(row.pyeong ?? row.평형 ?? row.평수 ?? ''),
    source_file: String(row.source_file ?? row.sourceFile ?? ''),
    registeredAt: String(row.registeredAt ?? row['등록일시'] ?? row['등록 일시'] ?? row.접수일시 ?? row.uploadedAt ?? uploadedAt),
    consultationResult: String(row.consultationResult ?? row['상담결과'] ?? row['상담 결과'] ?? ''),
    memo: String(row.memo ?? row['메모'] ?? row['특이사항'] ?? row['메모(특이사항)'] ?? ''),
    operator: String(row.operator ?? row['접수자'] ?? row['작업자'] ?? row['처리자'] ?? row['상담원'] ?? row['상담담당자'] ?? row['상담 담당자'] ?? row['담당자'] ?? row['등록자'] ?? row['영업담당자'] ?? row['영업 담당자'] ?? row.registrant ?? row.manager ?? row.owner ?? ''),
    status: String(row.status ?? row.상태 ?? 'valid') as any,
    sourceKind: String(row.sourceKind ?? row.source_kind ?? '') as SourceKind,
    uploadedAt,
  } as LeadRecord
}

function normalizeSpend(row: any, index = 0, mappings: MappingRow[] = []): AdSpend {
  const utm_source = row.channel ?? row.매체 ?? row.최종매체 ?? row.source ?? ''
  const campaign = String(row.campaign ?? row.캠페인 ?? '')
  const baseChannel = normalizeChannel(utm_source)
  const mapped = applyChannelMapping({ channel: baseChannel, subChannel: String(row.subChannel ?? row.상세매체 ?? ''), utm_source, utm_campaign: campaign }, mappings)
  return {
    id: String(row.id ?? makeId('spend')),
    date: normalizeDate(row.date ?? row.날짜 ?? row.등록일, new Date()),
    channel: mapped.channel,
    subChannel: mapped.subChannel,
    campaign,
    amount: Number(String(row.amount ?? row.cost ?? row.광고비 ?? row.비용 ?? 0).replace(/[^0-9]/g, '')),
    memo: String(row.memo ?? row.메모 ?? row.note ?? ''),
    registrant: String(row.registrant ?? row.등록자 ?? row.operator ?? row.createdBy ?? ''),
  } as AdSpend
}

async function getSheetRows(type: SheetType) {
  if (SHEET_API_URL.includes('여기에_')) throw new Error('dataService.ts의 SHEET_API_URL에 Apps Script 웹앱 URL을 입력하세요.')
  const res = await fetch(`${SHEET_API_URL}?type=${type}`)
  if (!res.ok) throw new Error('Google Sheets 데이터를 불러오지 못했습니다.')
  const data = await res.json()
  if (data?.error) throw new Error(data.error)
  return Array.isArray(data) ? data : []
}

async function postSheetRows(type: PostSheetType, rows: any[]) {
  if (SHEET_API_URL.includes('여기에_')) throw new Error('dataService.ts의 SHEET_API_URL에 Apps Script 웹앱 URL을 입력하세요.')
  if (!rows.length) return { success: true, count: 0 }

  const res = await fetch(SHEET_API_URL, {
    method: 'POST',
    // text/plain으로 보내야 Apps Script에서 CORS preflight 문제를 피하기 쉬움
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ type, rows }),
  })

  if (!res.ok) throw new Error('Google Sheets 저장 실패')
  const data = await res.json()
  if (data?.error === 'Invalid type' && type === 'adSpendReplace') {
    throw new Error('교체 저장 기능을 쓰려면 APPS_SCRIPT_CODE.txt를 구글 Apps Script에 다시 붙여넣고 배포해야 합니다.')
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export async function fetchMappings(): Promise<MappingRow[]> {
  try {
    const rows = await getSheetRows('mapping')
    return rows.map(normalizeMappingRow).filter(Boolean) as MappingRow[]
  } catch {
    return []
  }
}

function rawRowsFromLeads(leads: Omit<LeadRecord, 'id' | 'uploadedAt'>[]) {
  return leads.map((lead) => {
    const raw = (lead as any).rawData && typeof (lead as any).rawData === 'object' ? (lead as any).rawData : {}
    return {
      ...raw,
      _parsed_date: lead.date,
      _parsed_phone: lead.phone,
      _parsed_name: lead.name,
      _parsed_channel: lead.channel,
      _parsed_subChannel: (lead as any).subChannel || '',
      _parsed_stage: lead.dbTier,
      _parsed_region: lead.region,
      _parsed_district: lead.district,
      _uploadedAt: new Date().toISOString(),
    }
  })
}

function dashboardRowsFromLeads(leads: LeadRecord[]) {
  return leads.map((r) => ({
    date: r.date,
    phone: r.phone,
    name: r.name,
    stage: r.dbTier,
    dbTier: r.dbTier,
    channel: r.channel,
    subChannel: r.subChannel || '',
    region: r.region,
    district: r.district,
    utm_source: r.utm_source || r.channel,
    utm_medium: r.utm_medium || '',
    utm_campaign: r.utm_campaign || '',
    utm_content: r.utm_content || '',
    utm_term: r.utm_term || '',
    source_raw: r.source_raw || '',
    params: r.params || '',
    address: r.address || '',
    building: r.building || '',
    brand: r.brand || '',
    pyeong: r.pyeong || '',
    source_file: r.sourceKind === 'second_raw' ? 'second_db' : 'first_db',
    registeredAt: (r as any).registeredAt || r.uploadedAt || r.date,
    consultationResult: (r as any).consultationResult || '',
    memo: (r as any).memo || '',
    operator: (r as any).operator || '',
    status: r.status || 'valid',
    uploadedAt: r.uploadedAt,
  }))
}

function upgradeLead(prev: LeadRecord, normalizedLead: LeadRecord, now: string): LeadRecord {
  const channel = chooseAttribution(prev, normalizedLead)
  const subChannel = chooseSubChannel(prev, normalizedLead, channel)

  // 중요: 2차DB(컨설팅리스트)는 보통 params/주소/견적값이 없음.
  // 같은 연락처의 1차DB가 가지고 있던 외부창 견적/주소 데이터는 2차DB에도 승계해야
  // DB관리 페이지에서 1차/2차 공통으로 외부창 견적을 볼 수 있음.
  return {
    ...prev,
    ...normalizedLead,
    id: prev.id,
    channel,
    subChannel,
    region: normalizedLead.region || prev.region,
    district: normalizedLead.district || prev.district,
    address: (normalizedLead as any).address || (prev as any).address || '',
    building: (normalizedLead as any).building || (prev as any).building || '',
    params: (normalizedLead as any).params || (prev as any).params || '',
    brand: (normalizedLead as any).brand || (prev as any).brand || '',
    pyeong: (normalizedLead as any).pyeong || (prev as any).pyeong || '',
    utm_source: (normalizedLead as any).utm_source || (prev as any).utm_source || '',
    utm_medium: (normalizedLead as any).utm_medium || (prev as any).utm_medium || '',
    utm_campaign: (normalizedLead as any).utm_campaign || (prev as any).utm_campaign || '',
    utm_content: (normalizedLead as any).utm_content || (prev as any).utm_content || '',
    utm_term: (normalizedLead as any).utm_term || (prev as any).utm_term || '',
    source_raw: (normalizedLead as any).source_raw || (prev as any).source_raw || '',
    registeredAt: (normalizedLead as any).registeredAt || (prev as any).registeredAt || normalizedLead.date,
    uploadedAt: now,
  }
}


export async function updateLeadAttribution(params: {
  phone: string
  stage: DBTier
  date?: string
  name?: string
  address?: string
  channel: Channel
  subChannel?: string
  sourceRaw?: string
  consultationResult?: string
  memo?: string
  operator?: string
  status?: string
}) {
  if (SHEET_API_URL.includes('여기에_')) throw new Error('dataService.ts의 SHEET_API_URL에 Apps Script 웹앱 URL을 입력하세요.')
  const body = {
    type: 'updateLead',
    phone: normalizePhone(params.phone),
    stage: params.stage,
    date: params.date || '',
    patch: {
      channel: params.channel,
      name: params.name,
      address: params.address,
      subChannel: params.subChannel || '',
      source_raw: params.sourceRaw || '',
      consultationResult: params.consultationResult || '',
      memo: params.memo || '',
      operator: params.operator || '',
      status: params.status || '',
      updatedBy: params.operator || '',
      updatedAt: new Date().toISOString(),
    },
  }
  const res = await fetch(SHEET_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Google Sheets 수정 실패')
  const data = await res.json()
  if (data?.error) throw new Error(data.error)
  window.dispatchEvent(new Event('ieum-dashboard-data-updated'))
  return data
}

export async function createManualLead(params: {
  date: string
  name: string
  phone: string
  dbTier: DBTier
  channel: Channel
  subChannel?: string
  region?: string
  district?: string
  address?: string
  consultationResult?: string
  memo?: string
  operator?: string
  registrant?: string
}) {
  const now = new Date().toISOString()
  const lead: LeadRecord = {
    id: makeId('manual'),
    date: normalizeDate(params.date, new Date()),
    phone: normalizePhone(params.phone),
    rawPhone: params.phone,
    name: params.name,
    dbTier: params.dbTier,
    status: params.dbTier,
    channel: params.channel,
    subChannel: params.subChannel || '',
    region: params.region || '',
    district: params.district || '',
    address: params.address || '',
    source_raw: params.subChannel || '수기등록',
    consultationResult: params.consultationResult || '',
    memo: params.memo || '',
    operator: params.operator || params.registrant || '',
    source_file: 'manual',
    sourceKind: 'unknown',
    uploadedAt: now,
  } as LeadRecord
  const row = {
    date: lead.date,
    phone: lead.phone,
    name: lead.name,
    stage: lead.dbTier,
    dbTier: lead.dbTier,
    channel: lead.channel,
    subChannel: lead.subChannel || '',
    region: lead.region,
    district: lead.district,
    utm_source: lead.channel,
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
    utm_term: '',
    source_raw: lead.source_raw,
    params: '',
    address: lead.address || '',
    building: '',
    brand: '',
    pyeong: '',
    source_file: 'manual',
    registeredAt: now,
    consultationResult: params.consultationResult || '',
    status: 'valid',
    memo: params.memo || '',
    operator: params.operator || params.registrant || '',
    registrant: params.registrant || '',
    uploadedAt: now,
  }
  await postSheetRows('leads', [row])
  window.dispatchEvent(new Event('ieum-dashboard-data-updated'))
  return 1
}


function cleanRegisteredAtValue(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return ''
  return s
}

function pickRegisteredAtFromRaw(row: any): string {
  return cleanRegisteredAtValue(
    row.registeredAt ??
    row['등록일시'] ??
    row['등록 일시'] ??
    row['접수일시'] ??
    row['접수 일시'] ??
    row['신청일시'] ??
    row['신청 일시'] ??
    row['등록일'] ??
    row['접수일'] ??
    row.date ??
    row._parsed_date
  )
}

function buildRegisteredAtLookup(firstRawRows: any[], secondRawRows: any[]) {
  const lookup = new Map<string, string>()

  const add = (row: any) => {
    const phone = normalizePhone(row._parsed_phone ?? row.phone ?? row.연락처 ?? row.휴대폰번호 ?? row['휴대폰 번호'] ?? '')
    const date = normalizeDate(row._parsed_date ?? row.date ?? row.날짜 ?? row.등록일 ?? row.등록일시 ?? row['등록 일시'] ?? row.접수일시, new Date())
    const registeredAt = pickRegisteredAtFromRaw(row)

    if (!phone || !registeredAt) return

    lookup.set(`${phone}_${date}`, registeredAt)
    lookup.set(phone, registeredAt)
  }

  firstRawRows.forEach(add)
  secondRawRows.forEach(add)

  return lookup
}

function enrichRegisteredAtFromRaw(lead: LeadRecord, lookup: Map<string, string>): LeadRecord {
  const current = cleanRegisteredAtValue((lead as any).registeredAt)
  const fromRaw = lookup.get(`${lead.phone}_${lead.date}`) || lookup.get(lead.phone) || ''

  return {
    ...lead,
    registeredAt: current || fromRaw || lead.date,
  } as LeadRecord
}

function pickOperatorFromRaw(row: any): string {
  // 컨설팅리스트 원본 기준: 작업자는 '영업담당자'가 아니라 '접수자'가 맞음.
  return String(
    row.operator ??
    row['접수자'] ??
    row['작업자'] ??
    row['처리자'] ??
    row['상담원'] ??
    row['상담담당자'] ??
    row['상담 담당자'] ??
    row['담당자'] ??
    row['등록자'] ??
    row['영업담당자'] ??
    row['영업 담당자'] ??
    row.manager ??
    row.owner ??
    ''
  ).trim()
}

function buildRawMetaLookup(firstRawRows: any[], secondRawRows: any[]) {
  const lookup = new Map<string, { registeredAt?: string; operator?: string; consultationResult?: string; memo?: string }>()

  const add = (row: any) => {
    const phone = normalizePhone(row._parsed_phone ?? row.phone ?? row.연락처 ?? row.휴대폰번호 ?? row['휴대폰 번호'] ?? '')
    const date = normalizeDate(row._parsed_date ?? row.date ?? row.날짜 ?? row.등록일 ?? row.등록일시 ?? row['등록 일시'] ?? row.접수일시, new Date())
    if (!phone) return
    const meta = {
      registeredAt: pickRegisteredAtFromRaw(row),
      operator: pickOperatorFromRaw(row),
      consultationResult: String(row.consultationResult ?? row['상담결과'] ?? row['상담 결과'] ?? row['상담상태'] ?? row['상담 상태'] ?? row['결과'] ?? '').trim(),
      memo: String(row.memo ?? row['메모'] ?? row['특이사항'] ?? row['메모(특이사항)'] ?? row['비고'] ?? row['상담메모'] ?? '').trim(),
    }
    const byDateKey = `${phone}_${date}`
    lookup.set(byDateKey, { ...(lookup.get(byDateKey) || {}), ...Object.fromEntries(Object.entries(meta).filter(([,v]) => Boolean(v))) })
    lookup.set(phone, { ...(lookup.get(phone) || {}), ...Object.fromEntries(Object.entries(meta).filter(([,v]) => Boolean(v))) })
  }

  firstRawRows.forEach(add)
  secondRawRows.forEach(add)
  return lookup
}

function enrichMetaFromRaw(lead: LeadRecord, lookup: Map<string, { registeredAt?: string; operator?: string; consultationResult?: string; memo?: string }>): LeadRecord {
  const meta = lookup.get(`${lead.phone}_${lead.date}`) || lookup.get(lead.phone) || {}
  return {
    ...lead,
    registeredAt: cleanRegisteredAtValue((lead as any).registeredAt) || meta.registeredAt || lead.date,
    operator: (lead as any).operator || meta.operator || '',
    consultationResult: (lead as any).consultationResult || meta.consultationResult || '',
    memo: (lead as any).memo || meta.memo || '',
  } as LeadRecord
}

// ─── Leads ──────────────────────────────────────────────
export async function uploadLeads(leads: Omit<LeadRecord, 'id' | 'uploadedAt'>[]) {
  const mappings = await fetchMappings()
  // 기존 DASHBOARD_LEADS를 기준으로 중복/승격 판단
  const existing = (await getSheetRows('leads')).map((r, i) => normalizeLead(r, i, mappings))
  const byPhoneStageDate = new Map<string, LeadRecord>()
  const stageSeenByPhone = new Map<string, Set<string>>()
  const bestByPhone = new Map<string, LeadRecord>()

  existing.forEach((r: LeadRecord) => {
    if (!r.phone) return
    const b = baseTier(r.dbTier)
    byPhoneStageDate.set(`${r.phone}_${r.dbTier}_${r.date}`, r)
    byPhoneStageDate.set(`${r.phone}_${b}_${r.date}`, r)
    if (!stageSeenByPhone.has(r.phone)) stageSeenByPhone.set(r.phone, new Set())
    stageSeenByPhone.get(r.phone)!.add(b)
    const prevBest = bestByPhone.get(r.phone)
    if (!prevBest || tierRank(r.dbTier) > tierRank(prevBest.dbTier)) bestByPhone.set(r.phone, r)
  })

  const now = new Date().toISOString()
  const dashboardToAppend: LeadRecord[] = []
  let changed = 0

  const firstRaw: Omit<LeadRecord, 'id' | 'uploadedAt'>[] = []
  const secondRaw: Omit<LeadRecord, 'id' | 'uploadedAt'>[] = []

  leads.forEach((lead) => {
    if (!lead.phone) return
    if (lead.sourceKind === 'second_raw') secondRaw.push(lead)
    else firstRaw.push(lead)

    const mapped = applyChannelMapping({
      channel: lead.channel,
      subChannel: (lead as any).subChannel,
      utm_source: (lead as any).utm_source,
      source_raw: (lead as any).source_raw,
      utm_medium: (lead as any).utm_medium,
      utm_campaign: (lead as any).utm_campaign,
      utm_content: (lead as any).utm_content,
      utm_term: (lead as any).utm_term,
    }, mappings)

    const normalizedLead: LeadRecord = {
      ...lead,
      id: makeId('lead'),
      date: normalizeDate(lead.date, new Date(now)),
      phone: normalizePhone(lead.phone),
      channel: mapped.channel,
      subChannel: sanitizeSubChannelForChannel(mapped.channel, mapped.subChannel, { source: (lead as any).utm_source, sourceRaw: (lead as any).source_raw, medium: (lead as any).utm_medium, campaign: (lead as any).utm_campaign, content: (lead as any).utm_content, term: (lead as any).utm_term }),
      uploadedAt: now,
    } as LeadRecord

    const bTier = baseTier(normalizedLead.dbTier)
    const sameDayKey = `${normalizedLead.phone}_${bTier}_${normalizedLead.date}`
    if (byPhoneStageDate.has(sameDayKey)) return

    const prevBest = bestByPhone.get(normalizedLead.phone)
    const hasSameStageBefore = stageSeenByPhone.get(normalizedLead.phone)?.has(bTier)
    if (hasSameStageBefore && (bTier === 'first' || bTier === 'second')) {
      normalizedLead.dbTier = reentryTier(bTier)
    }

    const finalLead = prevBest ? upgradeLead(prevBest, normalizedLead, now) : normalizedLead

    byPhoneStageDate.set(`${finalLead.phone}_${finalLead.dbTier}_${finalLead.date}`, finalLead)
    byPhoneStageDate.set(`${finalLead.phone}_${baseTier(finalLead.dbTier)}_${finalLead.date}`, finalLead)
    if (!stageSeenByPhone.has(finalLead.phone)) stageSeenByPhone.set(finalLead.phone, new Set())
    stageSeenByPhone.get(finalLead.phone)!.add(baseTier(finalLead.dbTier))
    const currentBest = bestByPhone.get(finalLead.phone)
    if (!currentBest || tierRank(finalLead.dbTier) > tierRank(currentBest.dbTier)) bestByPhone.set(finalLead.phone, finalLead)
    dashboardToAppend.push(finalLead)
    changed++
  })

  // 1차/2차 원본 RAW 누적 저장. RAW도 Apps Script에서 중복 차단함.
  if (firstRaw.length) await postSheetRows('firstRaw', rawRowsFromLeads(firstRaw))
  if (secondRaw.length) await postSheetRows('secondRaw', rawRowsFromLeads(secondRaw))

  // 대시보드용 정제 데이터 저장. phone + stage 기준 신규만 저장.
  if (dashboardToAppend.length) await postSheetRows('leads', dashboardRowsFromLeads(dashboardToAppend))

  window.dispatchEvent(new Event('ieum-dashboard-data-updated'))
  return changed
}


function rawLeadSortValue(lead: LeadRecord): string {
  return String((lead as any).registeredAt || lead.date || '')
}

function buildLeadRowsFromRaw(firstRawRows: any[], secondRawRows: any[], mappings: MappingRow[]): LeadRecord[] {
  const firstLeads = firstRawRows
    .map((row, i) => normalizeLead({
      ...row,
      stage: row._parsed_stage || row.stage || row.dbTier || 'first',
      dbTier: row._parsed_stage || row.stage || row.dbTier || 'first',
      source_file: 'first_db',
      sourceKind: 'first_raw',
    }, i, mappings))
    .filter((r: LeadRecord) => r.phone)
    .sort((a: LeadRecord, b: LeadRecord) => rawLeadSortValue(a).localeCompare(rawLeadSortValue(b)))

  const firstByPhone = new Map<string, LeadRecord>()
  firstLeads.forEach((lead: LeadRecord) => {
    if (!firstByPhone.has(lead.phone)) firstByPhone.set(lead.phone, lead)
  })

  const secondLeads = secondRawRows
    .map((row, i) => normalizeLead({
      ...row,
      stage: row._parsed_stage || row.stage || row.dbTier || 'second',
      dbTier: row._parsed_stage || row.stage || row.dbTier || 'second',
      source_file: 'second_db',
      sourceKind: 'second_raw',
    }, i, mappings))
    .filter((r: LeadRecord) => r.phone)
    .map((lead: LeadRecord) => {
      const first = firstByPhone.get(lead.phone)
      if (!first) return lead
      return {
        ...lead,
        params: (lead as any).params || (first as any).params || '',
        address: (lead as any).address || (first as any).address || '',
        building: (lead as any).building || (first as any).building || '',
        brand: (lead as any).brand || (first as any).brand || '',
        pyeong: (lead as any).pyeong || (first as any).pyeong || '',
      } as LeadRecord
    })

  const combined = [...firstLeads, ...secondLeads]
    .sort((a: LeadRecord, b: LeadRecord) => rawLeadSortValue(a).localeCompare(rawLeadSortValue(b)))

  // 중복 기준은 같은 연락처 + 같은 DB단계 + 같은 날짜만 제외.
  // 같은 연락처 + 같은 DB단계 + 다른 날짜는 재인입으로 반드시 살림.
  const seen = new Set<string>()
  const out: LeadRecord[] = []
  combined.forEach((lead: LeadRecord) => {
    const base = baseTier(lead.dbTier)
    const key = `${lead.phone}_${base}_${lead.date}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ ...lead, dbTier: base } as LeadRecord)
  })
  return out
}

function mergeDashboardEdits(rawLeads: LeadRecord[], dashboardLeads: LeadRecord[]): LeadRecord[] {
  const editMap = new Map<string, LeadRecord>()
  dashboardLeads.forEach((lead: LeadRecord) => {
    const key = `${lead.phone}_${baseTier(lead.dbTier)}_${lead.date}`
    editMap.set(key, lead)
  })

  return rawLeads.map((lead: LeadRecord) => {
    const key = `${lead.phone}_${baseTier(lead.dbTier)}_${lead.date}`
    const edited = editMap.get(key)
    if (!edited) return lead
    return {
      ...lead,
      // 상담원이 화면에서 수정한 값은 유지
      consultationResult: (edited as any).consultationResult || (lead as any).consultationResult || '',
      memo: (edited as any).memo || (lead as any).memo || '',
    status: (edited as any).status || (lead as any).status || 'valid',
      // 작업자는 원본 접수자 기준이 우선. 단, 수기/수정으로 직접 입력된 경우만 유지 가능
      operator: (lead as any).operator || (edited as any).operator || '',
      changeHistory: (edited as any).changeHistory || (lead as any).changeHistory || '',
    } as LeadRecord
  })
}

function applyReentryClassification(leads: LeadRecord[]): LeadRecord[] {
  const asc = [...leads].sort((a, b) => {
    const ar = String((a as any).registeredAt || a.date || '')
    const br = String((b as any).registeredAt || b.date || '')
    return ar.localeCompare(br)
  })

  const seenDatesByPhoneStage = new Map<string, Set<string>>()

  return asc.map((lead) => {
    const base = baseTier(lead.dbTier)
    if (base !== 'first' && base !== 'second') return lead

    const key = `${lead.phone}_${base}`
    const seenDates = seenDatesByPhoneStage.get(key) || new Set<string>()
    const hasPreviousDifferentDate = Array.from(seenDates).some(d => d !== lead.date)
    seenDates.add(lead.date)
    seenDatesByPhoneStage.set(key, seenDates)

    if (!hasPreviousDifferentDate) {
      return { ...lead, dbTier: base } as LeadRecord
    }

    return { ...lead, dbTier: reentryTier(base) } as LeadRecord
  })
}

export async function fetchLeads(startDate?: string, endDate?: string): Promise<LeadRecord[]> {
  const mappings = await fetchMappings()

  // 운영 속도 개선 핵심:
  // 평소 조회는 DASHBOARD_LEADS만 읽는다.
  // FIRST_DB_RAW / SECOND_DB_RAW 전체 재계산은 업로드 시점 또는 DASHBOARD_LEADS가 비어 있을 때만 사용한다.
  const leadRows = await getSheetRows('leads')
  const [firstRawRows, secondRawRows] = await Promise.all([
    getSheetRows('firstRaw').catch(() => []),
    getSheetRows('secondRaw').catch(() => []),
  ])

  let sourceRows = leadRows

  // 안전장치: DASHBOARD_LEADS가 비어 있는데 RAW만 쌓인 경우에만 1회 재생성한다.
  // 이 조건이 아니면 RAW를 매번 읽지 않아서 새로고침/DB관리 로딩이 빨라진다.
  if (!leadRows || leadRows.length === 0) {
    if (firstRawRows.length > 0 || secondRawRows.length > 0) {
      const rebuilt = buildLeadRowsFromRaw(firstRawRows, secondRawRows, mappings)
      sourceRows = dashboardRowsFromLeads(rebuilt)
      try {
        await postSheetRows('leads', sourceRows)
      } catch (err) {
        console.error('DASHBOARD_LEADS 자동 재생성 저장 실패:', err)
      }
    }
  }

  const rawMetaLookup = buildRawMetaLookup(firstRawRows, secondRawRows)
  const normalizedAll = sourceRows
    .map((row, i) => normalizeLead(row, i, mappings))
    .filter((r: LeadRecord) => r.phone)
    .filter((r: LeadRecord) => !EXCLUDED_LEAD_STATUSES.has(String(r.status || '').toLowerCase()))
    .map((r: LeadRecord) => enrichMetaFromRaw(r, rawMetaLookup))

  // 재인입 표시/집계는 저장된 DASHBOARD_LEADS 기준으로 가볍게 보정한다.
  // 같은 번호 + 같은 단계 + 다른 날짜가 있으면 first_reentry / second_reentry로 분류된다.
  const classifiedAll = applyReentryClassification(normalizedAll)

  return classifiedAll
    .filter((r: LeadRecord) => inRange(r.date, startDate, endDate))
    .sort((a: LeadRecord, b: LeadRecord) => String((b as any).registeredAt || b.date).localeCompare(String((a as any).registeredAt || a.date)))
}

// ─── Ad Spend ────────────────────────────────────────────
export async function uploadAdSpend(records: Omit<AdSpend, 'id'>[], options: { replaceExisting?: boolean } = {}) {
  const mappings = await fetchMappings()
  const rows = records.map((r) => {
    const spend = normalizeSpend(r, 0, mappings)
    return {
      date: spend.date,
      channel: spend.channel,
      subChannel: spend.subChannel || '',
      campaign: spend.campaign || '',
      amount: spend.amount,
      memo: spend.memo || '',
      registrant: spend.registrant || '',
    }
  })

  if (rows.length > 0) await postSheetRows(options.replaceExisting ? 'adSpendReplace' : 'adSpend', rows)
  window.dispatchEvent(new Event('ieum-dashboard-data-updated'))
}

export async function fetchAdSpend(startDate?: string, endDate?: string): Promise<AdSpend[]> {
  const mappings = await fetchMappings()
  return (await getSheetRows('adSpend'))
    .map((row, i) => normalizeSpend(row, i, mappings))
    .filter((r: AdSpend) => inRange(r.date, startDate, endDate))
    .sort((a: AdSpend, b: AdSpend) => b.date.localeCompare(a.date))
}
