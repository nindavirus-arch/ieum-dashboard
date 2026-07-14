const defaultSheetApiUrl = 'https://script.google.com/macros/s/AKfycbyML9Us8E_jPTQlw0c0kcG-UoCPEfSWl_874AKliowQOrQ_HO5w7sm_b65s9gGJ6U2iRQ/exec'

export const SHEET_API_URL = String(import.meta.env.VITE_SHEET_API_URL || defaultSheetApiUrl).trim()
