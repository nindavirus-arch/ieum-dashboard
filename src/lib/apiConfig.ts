const defaultSheetApiUrl = 'https://script.google.com/macros/s/AKfycbx4AuPxsyuOh2PZMFKE_TBZExkFlTABJ80HeQYmKrWI1BqPJZFZCGH6DQqoGsMlyMGeNQ/exec'

export const SHEET_API_URL = String(import.meta.env.VITE_SHEET_API_URL || defaultSheetApiUrl).trim()
