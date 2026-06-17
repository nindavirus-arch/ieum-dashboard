// src/lib/dataService.ts
// Google Sheets 연동형 데이터 서비스
// - 1차DB 파일(파일명: 컨설팅UTM 포함) 업로드 → FIRST_DB_RAW + DASHBOARD_LEADS 저장
// - 2차DB 파일(파일명: 컨설팅리스트 포함) 업로드 → SECOND_DB_RAW + DASHBOARD_LEADS 저장
// - 대시보드는 DASHBOARD_LEADS / AD_SPEND 시트를 읽어서 집계

import type { LeadRecord, AdSpend, DBTier, Channel, SourceKind } from '../types'
import { normalizeDate } from './excelParser'

// TODO: Apps Script 배포 후 웹앱 URL을 여기에 붙여넣으세요.
// 예: const SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbxxxx/exec'
const SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbzS7hN_k_C7zQDZivI4QeeECmrkYuHQftwex9Crt-gSaCFV6PDS0u4UsnNwbeaZ7KEp/exec'

function makeId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function inRange(date: string, startDate?: string, endDate?: string) {
  if (startDate && date < startDate) return false
  if (endDate && date > endDate) return false
  return true
}

function tierRank(tier: DBTier) {
  if (tier === 'second') return 3
  if (tier === 'first') return 2
  return 1
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

function normalizeLead(row: any, index = 0): LeadRecord {
  const uploadedAt = String(row.uploadedAt ?? row.uploaded_at ?? new Date().toISOString())
  const stage = String(row.stage ?? row.dbTier ?? row.DB등급 ?? row.등급 ?? 'retarget') as DBTier

  return {
    id: String(row.id ?? row.phone ?? row.연락처 ?? makeId('lead')),
    date: normalizeDate(row.date ?? row.날짜 ?? row.등록일 ?? row.등록일시 ?? row.신청일, new Date(uploadedAt)),
    phone: String(row.phone ?? row.연락처 ?? row.휴대폰번호 ?? row['휴대폰 번호'] ?? '').replace(/[^0-9]/g, ''),
    rawPhone: String(row.rawPhone ?? row.연락처 ?? row.휴대폰번호 ?? row['휴대폰 번호'] ?? ''),
    name: String(row.name ?? row.이름 ?? row.성명 ?? row.고객명 ?? ''),
    dbTier: stage,
    channel: String(row.channel ?? row.최종매체 ?? row.매체 ?? row.유입경로 ?? row['유입 경로'] ?? 'etc').toLowerCase() as Channel,
    region: String(row.region ?? row.시도 ?? row.지역 ?? ''),
    district: String(row.district ?? row.시군구 ?? ''),
    utm_source: String(row.utm_source ?? row.utmSource ?? ''),
    utm_medium: String(row.utm_medium ?? row.utmMedium ?? ''),
    utm_campaign: String(row.utm_campaign ?? row.utmCampaign ?? ''),
    utm_content: String(row.utm_content ?? row.utmContent ?? ''),
    utm_term: String(row.utm_term ?? row.utmTerm ?? ''),
    source_raw: String(row.source_raw ?? row.sourceRaw ?? row.유입경로 ?? row['유입 경로'] ?? ''),
    params: String(row.params ?? ''),
    address: String(row.address ?? row.주소 ?? ''),
    building: String(row.building ?? row.건물명 ?? row.아파트명 ?? ''),
    brand: String(row.brand ?? row.브랜드 ?? ''),
    pyeong: String(row.pyeong ?? row.평형 ?? row.평수 ?? ''),
    source_file: String(row.source_file ?? row.sourceFile ?? ''),
    status: String(row.status ?? row.상태 ?? 'valid') as any,
    sourceKind: String(row.sourceKind ?? row.source_kind ?? '') as SourceKind,
    uploadedAt,
  } as LeadRecord
}

function normalizeSpend(row: any, index = 0): AdSpend {
  return {
    id: String(row.id ?? makeId('spend')),
    date: normalizeDate(row.date ?? row.날짜 ?? row.등록일, new Date()),
    channel: String(row.channel ?? row.매체 ?? row.최종매체 ?? 'etc').toLowerCase() as Channel,
    amount: Number(String(row.amount ?? row.cost ?? row.광고비 ?? row.비용 ?? 0).replace(/[^0-9]/g, '')),
  } as AdSpend
}

async function getSheetRows(type: 'leads' | 'adSpend' | 'firstRaw' | 'secondRaw') {
  if (SHEET_API_URL.includes('여기에_')) throw new Error('dataService.ts의 SHEET_API_URL에 Apps Script 웹앱 URL을 입력하세요.')
  const res = await fetch(`${SHEET_API_URL}?type=${type}`)
  if (!res.ok) throw new Error('Google Sheets 데이터를 불러오지 못했습니다.')
  const data = await res.json()
  if (data?.error) throw new Error(data.error)
  return Array.isArray(data) ? data : []
}

async function postSheetRows(type: 'leads' | 'adSpend' | 'firstRaw' | 'secondRaw', rows: any[]) {
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
  if (data?.error) throw new Error(data.error)
  return data
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
    region: r.region,
    district: r.district,
    utm_source: (r as any).utm_source || r.channel,
    utm_medium: (r as any).utm_medium || '',
    utm_campaign: (r as any).utm_campaign || '',
    utm_content: (r as any).utm_content || '',
    utm_term: (r as any).utm_term || '',
    source_raw: (r as any).source_raw || '',
    params: (r as any).params || '',
    address: (r as any).address || '',
    building: (r as any).building || '',
    brand: (r as any).brand || '',
    pyeong: (r as any).pyeong || '',
    source_file: r.sourceKind === 'second_raw' ? 'second_db' : 'first_db',
    status: r.status || 'valid',
    uploadedAt: r.uploadedAt,
  }))
}

// ─── Leads ──────────────────────────────────────────────
export async function uploadLeads(leads: Omit<LeadRecord, 'id' | 'uploadedAt'>[]) {
  // 기존 DASHBOARD_LEADS를 기준으로 중복/승격 판단
  const existing = (await getSheetRows('leads')).map(normalizeLead)
  const byPhone = new Map<string, LeadRecord>()
  existing.forEach((r: LeadRecord) => { if (r.phone) byPhone.set(r.phone, r) })

  const now = new Date().toISOString()
  const dashboardToAppend: LeadRecord[] = []
  let changed = 0

  const firstRaw: Omit<LeadRecord, 'id' | 'uploadedAt'>[] = []
  const secondRaw: Omit<LeadRecord, 'id' | 'uploadedAt'>[] = []

  leads.forEach((lead) => {
    if (!lead.phone) return
    if (lead.sourceKind === 'second_raw') secondRaw.push(lead)
    else firstRaw.push(lead)

    const normalizedLead: LeadRecord = {
      ...lead,
      id: makeId('lead'),
      date: normalizeDate(lead.date, new Date(now)),
      uploadedAt: now,
    } as LeadRecord

    const prev = byPhone.get(lead.phone)

    if (!prev) {
      byPhone.set(lead.phone, normalizedLead)
      dashboardToAppend.push(normalizedLead)
      changed++
      return
    }

    const shouldUpgrade = tierRank(normalizedLead.dbTier) > tierRank(prev.dbTier)

    if (shouldUpgrade) {
      const upgraded: LeadRecord = {
        ...prev,
        ...normalizedLead,
        id: prev.id,
        // 2차DB가 홈페이지/direct인 경우 1차DB 매체를 승계
        channel: chooseAttribution(prev, normalizedLead),
        region: normalizedLead.region || prev.region,
        district: normalizedLead.district || prev.district,
        uploadedAt: now,
      }
      byPhone.set(lead.phone, upgraded)
      dashboardToAppend.push(upgraded)
      changed++
    }
  })

  // 1차/2차 원본 RAW 누적 저장
  if (firstRaw.length) await postSheetRows('firstRaw', rawRowsFromLeads(firstRaw))
  if (secondRaw.length) await postSheetRows('secondRaw', rawRowsFromLeads(secondRaw))

  // 대시보드용 정제 데이터 저장
  if (dashboardToAppend.length) await postSheetRows('leads', dashboardRowsFromLeads(dashboardToAppend))

  window.dispatchEvent(new Event('ieum-dashboard-data-updated'))
  return changed
}

export async function fetchLeads(startDate?: string, endDate?: string): Promise<LeadRecord[]> {
  return (await getSheetRows('leads'))
    .map(normalizeLead)
    .filter((r: LeadRecord) => r.phone)
    .filter((r: LeadRecord) => r.status !== 'invalid' && r.status !== 'test' && r.status !== 'duplicate')
    .filter((r: LeadRecord) => inRange(r.date, startDate, endDate))
    .sort((a: LeadRecord, b: LeadRecord) => b.date.localeCompare(a.date))
}

// ─── Ad Spend ────────────────────────────────────────────
export async function uploadAdSpend(records: Omit<AdSpend, 'id'>[]) {
  const rows = records.map((r) => {
    const spend = normalizeSpend(r)
    return {
      date: spend.date,
      channel: spend.channel,
      campaign: (r as any).campaign || '',
      amount: spend.amount,
    }
  })

  if (rows.length > 0) await postSheetRows('adSpend', rows)
  window.dispatchEvent(new Event('ieum-dashboard-data-updated'))
}

export async function fetchAdSpend(startDate?: string, endDate?: string): Promise<AdSpend[]> {
  return (await getSheetRows('adSpend'))
    .map(normalizeSpend)
    .filter((r: AdSpend) => inRange(r.date, startDate, endDate))
    .sort((a: AdSpend, b: AdSpend) => b.date.localeCompare(a.date))
}
