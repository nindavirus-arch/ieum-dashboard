// src/lib/excelParser.ts
import * as XLSX from 'xlsx'
import type { LeadRecord, AdSpend, Channel, DBTier, DBStatus, SourceKind } from '../types'

// ── 공통 유틸 ──────────────────────────────────────────────
export function normalizePhone(raw: unknown): string {
  let phone = String(raw ?? '').replace(/[^0-9]/g, '')
  // 엑셀/구글시트가 010의 앞 0을 날리는 경우 보정: 1095432120 → 01095432120
  if (phone.length === 10 && phone.startsWith('10')) phone = `0${phone}`
  return phone
}

function isValidPhone(phone: string): boolean {
  return /^01[0-9]{8,9}$/.test(phone)
}

function isTestPhone(phone: string): boolean {
  const TEST_PATTERNS = [
    '01012341234', '01000000000', '01011111111', '01099999999',
    '1012341234', '1112341234', '1000000000', '1011111111', '01022222222', '01033333333'
  ]
  return TEST_PATTERNS.includes(phone) || /^0100{6,}$/.test(phone)
}

function normalizeKey(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[\s_\-\/()\[\].]/g, '')
}

function getCell(row: Record<string, unknown>, aliases: string[]): unknown {
  const keys = Object.keys(row)
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias]
  }
  const normalizedAliases = aliases.map(normalizeKey)
  for (const key of keys) {
    const nk = normalizeKey(key)
    if (normalizedAliases.includes(nk)) return row[key]
  }
  return ''
}

function hasAnyColumn(headers: string[], aliases: string[]): boolean {
  const normalized = headers.map(normalizeKey)
  return aliases.some(a => normalized.includes(normalizeKey(a)))
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null
  const utcDays = Math.floor(serial - 25569)
  const utcValue = utcDays * 86400
  const dateInfo = new Date(utcValue * 1000)
  if (Number.isNaN(dateInfo.getTime())) return null
  return dateInfo
}

function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function normalizeDate(raw: unknown, fallback = new Date()): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return toYMD(raw)
  if (typeof raw === 'number') {
    const d = excelSerialToDate(raw)
    if (d) return toYMD(d)
  }

  const s = String(raw ?? '').trim()
  if (!s) return toYMD(fallback)

  const m1 = s.match(/(20\d{2})[.\-/년\sT]+(\d{1,2})[.\-/월\s]+(\d{1,2})/)
  if (m1) {
    const [, y, mo, da] = m1
    return `${y}-${String(Number(mo)).padStart(2, '0')}-${String(Number(da)).padStart(2, '0')}`
  }

  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) return toYMD(parsed)
  return toYMD(fallback)
}

export function decodeMaybe(raw: unknown): string {
  const s = String(raw ?? '')
  if (!s) return ''
  let out = s
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(out.replace(/\+/g, '%20'))
      if (decoded === out) break
      out = decoded
    } catch { break }
  }
  return out
}

const CHANNEL_MAP: Record<string, Channel> = {
  '네이버': 'naver', '네이버sa': 'naver', '네이버검색': 'naver', '네이버키워드광고': 'naver', '네이버gfa': 'naver', 'gfa': 'naver', '브랜드검색': 'naver', '파워링크': 'naver', 'naver': 'naver', 'naversa': 'naver', 'navergfa': 'naver',
  '구글': 'google', '구글sa': 'google', '구글검색': 'google', '구글검색광고': 'google', '구글디맨드젠': 'google', '디맨드젠': 'google', '디스커버리': 'google', 'gdn': 'google', 'google': 'google', 'googlesa': 'google', 'demand': 'google', 'demandgen': 'google', 'googleslink': 'google',
  '메타': 'meta', '인스타': 'meta', '인스타그램': 'meta', '페이스북': 'meta', 'facebook': 'meta', 'fb': 'meta', 'ig': 'meta', 'instagram': 'meta', 'meta': 'meta',
  '유튜브': 'youtube', 'youtube': 'youtube', 'yt': 'youtube', '구글유튜브': 'youtube',
  '바이럴': 'viral', '블로그': 'viral', '레뷰': 'viral', 'revu': 'viral', 'viral': 'viral', '카페': 'viral', '당근': 'viral',
  '카카오검색광고': 'kakao_search', '카카오검색': 'kakao_search', '카카오키워드': 'kakao_search', 'kakaosearch': 'kakao_search', 'kakao_sa': 'kakao_search', 'kakaosa': 'kakao_search',
  '카카오모먼트': 'kakao_moment', '카카오모멘트': 'kakao_moment', '카카오moment': 'kakao_moment', 'kakaomoment': 'kakao_moment',
  'tu': 'tu_albarich', 'tu알바리치': 'tu_albarich', 'tu-albarich': 'tu_albarich', 'tualbarich': 'tu_albarich', '알바리치': 'tu_albarich',
  'tu유튜브': 'tu_youtube', 'tu-youtube': 'tu_youtube', 'tuyoutube': 'tu_youtube', 'tu유투브': 'tu_youtube',
  'tu당근': 'tu_danggeun', 'tu-carrot': 'tu_danggeun', 'tudanggeun': 'tu_danggeun',
  '휴그린당근': 'hugreen_danggeun', '휴그린-당근': 'hugreen_danggeun', 'hugreendanggeun': 'hugreen_danggeun',
  '휴그린메일': 'hugreen_mail', '휴그린-메일': 'hugreen_mail', '휴그린본사': 'hugreen_mail', 'hugreenmail': 'hugreen_mail',
  '인바운드': 'inbound_call', '인입콜': 'inbound_call', '인바운드콜': 'inbound_call', 'inbound': 'inbound_call', 'call': 'inbound_call',
  '홈페이지': 'direct', '공식홈페이지': 'direct', '직접유입': 'direct', 'direct': 'direct', 'website': 'direct', 'homepage': 'direct',
}

export function normalizeChannel(raw: unknown): Channel {
  const original = decodeMaybe(raw).toLowerCase()
  const key = normalizeKey(original)
  if (!key) return 'etc'
  if (CHANNEL_MAP[key]) return CHANNEL_MAP[key]

  if (original.includes('kakao') || original.includes('카카오')) {
    if (original.includes('moment') || original.includes('모먼트') || original.includes('모멘트')) return 'kakao_moment'
    return 'kakao_search'
  }
  if (original.includes('youtube') || original.includes('youtu') || original.includes('유튜브')) return 'youtube'
  if (original.includes('naver') || original.includes('네이버') || original.includes('gfa') || original.includes('파워링크') || original.includes('브랜드검색')) return 'naver'
  if (original.includes('google') || original.includes('구글') || original.includes('gdn') || original.includes('demand') || original.includes('discovery') || original.includes('디맨드') || original.includes('디스커버리')) return 'google'
  if (original.includes('instagram') || original.includes('insta') || original.includes('facebook') || original.includes('meta') || original.includes('fb') || original.includes('ig') || original.includes('인스타') || original.includes('메타') || original.includes('페이스북')) return 'meta'
  if (original.includes('tu') || original.includes('알바리치')) {
    if (original.includes('유튜브') || original.includes('유투브') || original.includes('youtube')) return 'tu_youtube'
    if (original.includes('당근') || original.includes('carrot')) return 'tu_danggeun'
    return 'tu_albarich'
  }
  if (original.includes('휴그린') || original.includes('hugreen')) {
    if (original.includes('당근') || original.includes('carrot')) return 'hugreen_danggeun'
    return 'hugreen_mail'
  }
  if (original.includes('인바운드') || original.includes('인입콜') || original.includes('inbound') || original.includes('call')) return 'inbound_call'
  if (original.includes('blog') || original.includes('블로그') || original.includes('revu') || original.includes('레뷰') || original.includes('viral') || original.includes('카페') || original.includes('당근')) return 'viral'
  if (original.includes('홈페이지') || original.includes('공식홈') || original.includes('direct') || original.includes('homepage') || original.includes('website')) return 'direct'
  return 'etc'
}

export function inferChannelStrict(fields: { source?: unknown; sourceRaw?: unknown; medium?: unknown; campaign?: unknown; content?: unknown; term?: unknown }): Channel {
  // 절대 params는 매체 판별에 사용하지 않음.
  const source = String(fields.source ?? '').trim()
  if (source) {
    const sourceChannel = normalizeChannel(source)
    if (sourceChannel !== 'etc') return sourceChannel
  }

  const sourceRaw = String(fields.sourceRaw ?? '').trim()
  if (sourceRaw) {
    const routeChannel = normalizeChannel(sourceRaw)
    if (routeChannel !== 'etc') return routeChannel
  }

  const fallback = [fields.medium, fields.campaign, fields.content, fields.term].filter(Boolean).join(' ')
  return normalizeChannel(fallback)
}

export function inferSubChannel(fields: { channel: Channel; source?: unknown; sourceRaw?: unknown; medium?: unknown; campaign?: unknown; content?: unknown; term?: unknown }): string {
  const text = decodeMaybe([fields.source, fields.sourceRaw, fields.medium, fields.campaign, fields.content, fields.term].filter(Boolean).join(' ')).toLowerCase()
  const k = normalizeKey(text)
  if (fields.channel === 'naver') {
    if (k.includes('gfa')) return '네이버 GFA'
    if (text.includes('브랜드검색') || k.includes('brand')) return '네이버 브랜드검색'
    return '네이버 SA'
  }
  if (fields.channel === 'google') {
    if (k.includes('demand') || text.includes('디맨드')) return '구글 디맨드젠'
    if (k.includes('gdn') || text.includes('디스커버리') || k.includes('discovery')) return '구글 디스커버리/GDN'
    if (k.includes('youtube') || text.includes('유튜브')) return '구글 유튜브'
    return '구글 검색광고'
  }
  if (fields.channel === 'meta') return '메타'
  if (fields.channel === 'youtube') return '유튜브'
  if (fields.channel === 'viral') {
    if (text.includes('블로그') || k.includes('blog')) return '블로그'
    if (text.includes('레뷰') || k.includes('revu')) return '레뷰'
    if (text.includes('카페')) return '카페'
    if (text.includes('당근')) return '당근'
    return '바이럴'
  }
  if (fields.channel === 'kakao_search') return '카카오 검색광고'
  if (fields.channel === 'kakao_moment') return '카카오모먼트'
  if (fields.channel === 'direct') return '홈페이지 직접유입'
  if (fields.channel === 'tu_albarich') return 'TU-알바리치'
  if (fields.channel === 'tu_youtube') return 'TU-유튜브'
  if (fields.channel === 'tu_danggeun') return 'TU-당근'
  if (fields.channel === 'hugreen_danggeun') return '휴그린-당근'
  if (fields.channel === 'hugreen_mail') return '휴그린-메일'
  if (fields.channel === 'inbound_call') return '인바운드-인입콜'
  return '기타'
}

function normalizeRegion(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const first = s.split(/\s+/)[0]
  return first
    .replace('서울특별시', '서울').replace('부산광역시', '부산').replace('대구광역시', '대구')
    .replace('인천광역시', '인천').replace('광주광역시', '광주').replace('대전광역시', '대전')
    .replace('울산광역시', '울산').replace('세종특별자치시', '세종')
    .replace('경기도', '경기').replace('강원특별자치도', '강원').replace('강원도', '강원')
    .replace('충청북도', '충북').replace('충청남도', '충남')
    .replace('전북특별자치도', '전북').replace('전라북도', '전북').replace('전라남도', '전남')
    .replace('경상북도', '경북').replace('경상남도', '경남').replace('제주특별자치도', '제주')
}

function extractDistrictFromAddress(addr: string): string {
  const parts = String(addr ?? '').trim().split(/\s+/)
  if (parts.length >= 2) return parts[1]
  return ''
}

function hasEstimateParams(row: Record<string, unknown>): boolean {
  const params = decodeMaybe(getCell(row, ['params', '파라미터', 'url', 'URL', '링크']))
  if (!params) return false
  return /(kcc|zin|lx|hugreen|hanssem|homecc|jh|min|max|flatSizePh|constructPart)\s*=/.test(params) ||
    /(kcc|zin|lx|hugreen|hanssem|homecc|jh)\s*[:=]\s*\d+/i.test(params)
}

function detectSourceKind(headers: string[], fileName = ''): SourceKind {
  const lowerName = fileName.toLowerCase()
  if (lowerName.includes('컨설팅utm') || lowerName.includes('utm')) return 'first_raw'
  if (lowerName.includes('컨설팅리스트') || lowerName.includes('consulting')) return 'second_raw'

  const isSecond = hasAnyColumn(headers, ['컨설팅 번호', '컨설팅번호', '컨설팅 타입', '컨설팅타입', '고객 번호', '고객번호', '휴대폰 번호', '휴대폰번호', '유입 경로', '유입경로', '영업 담당자', '영업담당자', '견적 번호', '견적번호'])
  if (isSecond) return 'second_raw'
  const isFirst = hasAnyColumn(headers, ['source', 'medium', 'campaign', 'content', 'term', 'params', '주소', '건물명', 'utm_source', 'utm_medium'])
  if (isFirst) return 'first_raw'
  return 'unknown'
}

// ── DB 엑셀 파싱 ──────────────────────────────────────────
export interface ParsedLeadResult {
  valid: Omit<LeadRecord, 'id' | 'uploadedAt'>[]
  duplicateCount: number
  testCount: number
  invalidCount: number
  retargetCount: number
  firstCount: number
  secondCount: number
  sourceKind: SourceKind
}

export function parseLeadExcel(file: File): Promise<ParsedLeadResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false })
        const headers = rows.length ? Object.keys(rows[0]) : []
        const sourceKind = detectSourceKind(headers, file.name)

        const seen = new Set<string>()
        let duplicateCount = 0, testCount = 0, invalidCount = 0
        const valid: Omit<LeadRecord, 'id' | 'uploadedAt'>[] = []
        const fallbackDate = new Date()

        rows.forEach((row) => {
          const rawPhone = getCell(row, ['연락처', '전화번호', '휴대폰', '휴대폰번호', '휴대폰 번호', 'phone', 'tel', 'mobile'])
          const phone = normalizePhone(rawPhone)
          const name = String(getCell(row, ['이름', '성명', '고객명', 'name', 'customer_name']) ?? '').trim()
          const rawDate = getCell(row, ['날짜', 'date', 'Date', '등록일', '등록일시', '등록 일시', '신청일', '신청일시', '접수일', '접수일시', '생성일', 'createdAt', 'created_at', 'uploadedAt'])
          const date = normalizeDate(rawDate, fallbackDate)
          const registeredAt = String(rawDate ?? '').trim() || date

          if (!isValidPhone(phone)) { invalidCount++; return }
          const lowerName = name.toLowerCase()
          if (isTestPhone(phone) || lowerName.includes('test') || name.includes('테스트') || name.includes('이음마케팅') || name.includes('이음 마케팅') || name.includes('전환테스트') || name.includes('이동일테스트') || name.includes('함형석')) {
            testCount++; return
          }
          // 같은 연락처라도 날짜가 다르면 재인입으로 봐야 하므로 제거하지 않음.
          // 중복 제외는 같은 파일 안의 완전 동일 전화번호+등록일 기준으로만 처리.
          const duplicateKey = `${phone}_${date}`
          if (seen.has(duplicateKey)) { duplicateCount++; return }
          seen.add(duplicateKey)

          const address = String(getCell(row, ['주소', '도로명주소', 'address', 'roadName', '고객주소']) ?? '').trim()
          const building = String(getCell(row, ['건물명', '아파트명', 'buildingName', 'apartmentName']) ?? '').trim()
          const explicitRegion = String(getCell(row, ['시도', '시/도', '지역', '광역시도', 'province', 'region']) ?? '').trim()
          const explicitDistrict = String(getCell(row, ['시군구', '시/군/구', '구', '군구', '구/군', 'district', 'city']) ?? '').trim()
          const region = normalizeRegion(explicitRegion || address)
          const district = explicitDistrict || extractDistrictFromAddress(address)

          let dbTier: DBTier = 'first'
          let status: DBStatus = 'first'

          const source = getCell(row, ['source', 'utm_source', 'UTM소스', 'UTM Source', '소스'])
          const medium = getCell(row, ['medium', 'utm_medium', 'UTM미디엄', 'UTM Medium', '미디엄'])
          const campaign = getCell(row, ['campaign', 'utm_campaign', 'UTM캠페인', 'UTM Campaign', '캠페인'])
          const content = getCell(row, ['content', 'utm_content', 'UTM콘텐츠', 'UTM Content', '콘텐츠'])
          const term = getCell(row, ['term', 'utm_term', 'UTM텀', 'UTM Term', '키워드'])
          const params = decodeMaybe(getCell(row, ['params', '파라미터', 'url', 'URL', '링크']))
          const route = getCell(row, ['유입 경로', '유입경로', '채널', '매체'])
          const brand = String(getCell(row, ['브랜드', '시공 브랜드', '시공브랜드', 'brand']) ?? '').trim()
          const pyeong = String(getCell(row, ['평형', '평수', '거주평형', 'area', 'flatSize', 'flatSizePh']) ?? '').trim()
          const operator = String(getCell(row, ['접수자', 'operator', '작업자', '처리자', '상담원', '상담담당자', '상담 담당자', '담당자', '등록자', '영업담당자', '영업 담당자', 'manager', 'owner']) ?? '').trim()
          const consultationResult = String(getCell(row, ['상담결과', '상담 결과', '상담상태', '상담 상태', '결과']) ?? '').trim()
          const memo = String(getCell(row, ['메모', '특이사항', '메모(특이사항)', '비고', '상담메모']) ?? '').trim()

          const channel = inferChannelStrict({ source, sourceRaw: route, medium, campaign, content, term })
          const subChannel = inferSubChannel({ channel, source, sourceRaw: route, medium, campaign, content, term })

          if (sourceKind === 'second_raw') {
            dbTier = 'second'
            status = 'second'
          } else {
            const hasAddress = Boolean(address || building)
            const hasEstimate = hasEstimateParams(row)
            if (hasAddress || hasEstimate) {
              dbTier = 'first'
              status = 'first'
            } else {
              dbTier = 'retarget'
              status = 'retarget'
            }
          }

          valid.push({
            date, name, phone, rawPhone: String(rawPhone ?? ''), region, district, channel, subChannel, dbTier, status, sourceKind, rawData: row,
            utm_source: String(source ?? ''),
            utm_medium: String(medium ?? ''),
            utm_campaign: String(campaign ?? ''),
            utm_content: String(content ?? ''),
            utm_term: String(term ?? ''),
            source_raw: String(route ?? ''),
            params,
            address,
            building,
            brand,
            pyeong,
            registeredAt,
            operator,
            consultationResult,
            memo,
          } as any)
        })

        const retargetCount = valid.filter(v => v.dbTier === 'retarget').length
        const firstCount = valid.filter(v => v.dbTier === 'first').length
        const secondCount = valid.filter(v => v.dbTier === 'second').length
        resolve({ valid, duplicateCount, testCount, invalidCount, retargetCount, firstCount, secondCount, sourceKind })
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ── 광고비 엑셀 파싱 ──────────────────────────────────────
export interface ParsedAdSpendResult {
  records: Omit<AdSpend, 'id'>[]
}

export function parseAdSpendExcel(file: File): Promise<ParsedAdSpendResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false })
        const fallbackDate = new Date()
        const records: Omit<AdSpend, 'id'>[] = []
        rows.forEach((row) => {
          const rawDate = getCell(row, ['날짜', 'date', 'Date', '일자', '등록일', '집행일'])
          const date = normalizeDate(rawDate, fallbackDate)
          const channelRaw = getCell(row, ['채널', '매체', '유입채널', '광고매체', '광고 매체', 'utm_source', 'utm_medium', 'utm_campaign', 'channel', 'source'])
          const channel = normalizeChannel(channelRaw || Object.values(row).join(' '))
          const subChannel = inferSubChannel({ channel, source: channelRaw, campaign: getCell(row, ['캠페인', 'campaign']) })
          const amountRaw = getCell(row, ['광고비', '금액', '비용', 'Cost', 'cost', 'amount', 'spend'])
          const amount = Number(String(amountRaw ?? '0').replace(/[^0-9]/g, ''))
          if (date && amount > 0) records.push({ date, channel, subChannel, amount })
        })
        resolve({ records })
      } catch (err) { reject(err) }
    }
    reader.readAsArrayBuffer(file)
  })
}
