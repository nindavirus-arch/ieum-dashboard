import * as XLSX from 'xlsx'
import type { Channel, ProjectRecord, ProjectStatus } from '../types'
import { inferSubChannel, normalizeChannel, normalizeDate, normalizePhone } from './excelParser'

export interface ParsedProjectResult {
  valid: Omit<ProjectRecord, 'id' | 'uploadedAt'>[]
  totalCount: number
  contractedCount: number
  pendingCount: number
  canceledCount: number
  testCount: number
  invalidCount: number
}

function normalizeKey(value: string) {
  return String(value || '').toLowerCase().replace(/[\s_\-\/()\[\].]/g, '')
}

function getCell(row: Record<string, unknown>, aliases: string[]): unknown {
  const keys = Object.keys(row)
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias]
  }
  const normalizedAliases = aliases.map(normalizeKey)
  for (const key of keys) {
    if (normalizedAliases.includes(normalizeKey(key))) return row[key]
  }
  return ''
}

function parseAmount(value: unknown) {
  return Number(String(value ?? '').replace(/[^0-9]/g, '')) || 0
}

function projectAmount(row: Record<string, unknown>) {
  const total = parseAmount(getCell(row, [
    '총계약금액', '총 계약금액', '총 계약 금액', '계약금액', '계약 금액', '계약총액',
    '계약금+잔금액', '계약금 + 잔금액', '계약금잔금액', '총금액', '공사금액', '총 공사금액',
    '견적금액', 'amount', 'contractAmount'
  ]))
  if (total > 0) return total
  const downPayment = parseAmount(getCell(row, ['계약금', '계약 금', '선금', 'deposit']))
  const balance = parseAmount(getCell(row, ['잔금액', '잔금', 'balance']))
  return downPayment + balance
}

function splitRegion(address: string) {
  const parts = String(address || '').trim().split(/\s+/).filter(Boolean)
  return {
    region: parts.slice(0, 2).join(' '),
    district: parts.slice(0, 3).join(' '),
  }
}

function projectStatus(row: Record<string, unknown>, amount: number): ProjectStatus {
  const text = Object.values(row).map(value => String(value || '')).join(' ').toLowerCase()
  if (/테스트|test|샘플/.test(text)) return 'test'
  if (/취소|환불|해지|무효|반려|보류|실패/.test(text)) return 'canceled'
  if (/계약금\s*입금\s*완료|입금완료|계약완료|계약확정|계약\s*확정|완납/.test(text)) return 'contracted'
  if (amount > 0 && /계약/.test(text)) return 'contracted'
  return 'pending'
}

function normalizeProjectRow(row: Record<string, unknown>, fallbackDate: Date): Omit<ProjectRecord, 'id' | 'uploadedAt'> | null {
  const customerName = String(getCell(row, ['고객명', '고객 이름', '이름', '성명', 'name', 'customerName']) || '').trim()
  const phone = normalizePhone(getCell(row, ['연락처', '전화번호', '휴대폰', '휴대폰번호', '휴대폰 번호', 'phone']))
  const consultingNumber = String(getCell(row, ['컨설팅번호', '컨설팅 번호', '상담번호', 'consultingNumber']) || '').trim()
  const projectNumber = String(getCell(row, ['프로젝트번호', '프로젝트 번호', '계약번호', '공사번호', 'projectNumber']) || '').trim()
  const rawContractDate = getCell(row, [
    '등록일시', '등록 일시', '등록일', '등록 일자', '등록날짜',
    '계약일', '계약일자', '계약 날짜', '계약금입금일', '입금일',
    'contractDate'
  ])
  const contractDate = String(rawContractDate || '').trim() ? normalizeDate(rawContractDate, fallbackDate) : ''
  const address = String(getCell(row, ['주소', '현장주소', '시공주소', '고객주소', 'address']) || '').trim()
  const regionCell = String(getCell(row, ['지역', '시도', '시/도', '거주지역', '현장지역']) || '').trim()
  const districtCell = String(getCell(row, ['군구', '시군구', '시/군/구', '구군', '구/군']) || '').trim()
  const amount = projectAmount(row)
  const salesOwner = String(getCell(row, ['영업담당자', '영업 담당자', '영업 담당', '영업담당자명', '영업 담당자명', '담당자', '배정담당자', '배정 담당자', '배정', '지점장', '담당 지점장', 'salesOwner', 'manager']) || '').trim()
  const rawStatus = String(getCell(row, ['상태', '계약상태', '프로젝트상태', '진행상태', '결과', 'status']) || '').trim()
  const sourceRaw = String(getCell(row, ['유입경로', '유입경로 원본', '매체', '광고매체', 'source', 'sourceRaw']) || '').trim()
  const subRaw = String(getCell(row, ['상세매체', '상세 매체', '유입상세', 'utm_campaign', 'campaign']) || '').trim()
  const channel = sourceRaw ? normalizeChannel(sourceRaw) : undefined
  const subChannel = channel ? (subRaw || inferSubChannel({ channel, sourceRaw })) : subRaw

  if (!customerName && !phone && !consultingNumber && !projectNumber) return null
  if (!phone && !consultingNumber && !projectNumber) return null
  if (!contractDate) return null

  const inferredRegion = splitRegion(address)
  return {
    projectNumber,
    consultingNumber,
    contractDate,
    customerName,
    phone,
    region: regionCell || inferredRegion.region,
    district: districtCell || inferredRegion.district,
    address,
    contractAmount: amount,
    salesOwner,
    rawStatus,
    status: projectStatus(row, amount),
    channel: channel && channel !== 'etc' ? channel : undefined,
    subChannel,
    sourceRaw,
    matchKey: consultingNumber || phone || projectNumber,
    rawData: row,
  }
}

export function parseProjectsExcel(file: File): Promise<ParsedProjectResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = event => {
      try {
        const data = event.target?.result
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const rows = wb.SheetNames.flatMap(sheetName => {
          const ws = wb.Sheets[sheetName]
          return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false })
        })
        const fallbackDate = new Date()
        const normalized = rows
          .map(row => normalizeProjectRow(row, fallbackDate))
          .filter(Boolean) as Omit<ProjectRecord, 'id' | 'uploadedAt'>[]

        resolve({
          valid: normalized,
          totalCount: rows.length,
          contractedCount: normalized.filter(row => row.status === 'contracted').length,
          pendingCount: normalized.filter(row => row.status === 'pending').length,
          canceledCount: normalized.filter(row => row.status === 'canceled').length,
          testCount: normalized.filter(row => row.status === 'test').length,
          invalidCount: rows.length - normalized.length,
        })
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(new Error('프로젝트 엑셀 파일을 읽지 못했습니다.'))
    reader.readAsArrayBuffer(file)
  })
}
