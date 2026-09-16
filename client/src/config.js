// CareOClock frontend runtime configuration

export const CONFIG = {
  BRAND_NAME: 'CareOClock',
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api',
  SUPPORT_PHONE: '+91 800 227 3625',
  DEFAULT_LANGUAGE: 'en',
  SUPPORTED_LANGUAGES: [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिंदी' },
  ],
  NON_DIAGNOSTIC_DISCLAIMER:
    'CareOClock supports your care team — it does not diagnose, and it is not for medical emergencies.',
};

export const ASSET = (relativePath) => `/assets/${relativePath}`;
