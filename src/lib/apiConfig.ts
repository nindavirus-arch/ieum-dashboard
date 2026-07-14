const defaultSheetApiUrl = 'https://script.google.com/macros/s/AKfycbyyAh3E7qQAgoc_OdU_1dqD8fJ6n-41lYROKjnXXngWWl-MyOv-quIj3-fyzVm2Wpdv1g/exec'

export const SHEET_API_URL = String(import.meta.env.VITE_SHEET_API_URL || defaultSheetApiUrl).trim()
