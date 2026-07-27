const defaultSheetApiUrl = 'https://script.google.com/macros/s/AKfycbyde5kz55P861BXX5uSIdSjO7lCBEr3bWkavoSdJKAMhavIuIOEG5V8iu5k388gYW_dsQ/exec'

export const SHEET_API_URL = String(import.meta.env.VITE_SHEET_API_URL || defaultSheetApiUrl).trim()
