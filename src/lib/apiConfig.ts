const defaultSheetApiUrl = 'https://script.google.com/macros/s/AKfycbw9V8tdk0cFrxIe1z7rOTz6QQJyHJyII9QMpa0z5GRdP2zorWNBEa2Kj3Cs0Cjf2Kjj_w/exec'

export const SHEET_API_URL = String(import.meta.env.VITE_SHEET_API_URL || defaultSheetApiUrl).trim()
