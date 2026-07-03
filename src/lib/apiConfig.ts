const defaultSheetApiUrl = 'https://script.google.com/macros/s/AKfycbz0CNpoNv4LLG_8L83QciTJ34_jvLiQPWg6vCNAY5cKk96S33zx7b3ug3aJC-8bX4iHSQ/exec'

export const SHEET_API_URL = String(import.meta.env.VITE_SHEET_API_URL || defaultSheetApiUrl).trim()
