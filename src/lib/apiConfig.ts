const defaultSheetApiUrl = 'https://script.google.com/macros/s/AKfycbx4AuPxsyuOh2PZMFKE_TBZExkFlTABJ80HeQYmKrWI1BqPJZFZCGH6DQqoGsMlyMGeNQ/exec'

const envSheetApiUrl = String(import.meta.env.VITE_SHEET_API_URL || '').trim()

function isAppsScriptExecUrl(value: string) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(value)
}

export const SHEET_API_URL = isAppsScriptExecUrl(envSheetApiUrl) ? envSheetApiUrl : defaultSheetApiUrl
