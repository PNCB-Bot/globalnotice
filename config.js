// Single source of configuration. Loaded by index.html AND imported by sw.js.
// Bump CACHE_NAME (and APP_VERSION) whenever you ship a change to any cached file.
self.CONFIG = {
  GOOGLE_CLIENT_ID: '',   // OAuth 2.0 Web client ID  (see README §3)
  GOOGLE_API_KEY:   '',   // Optional: enables the Drive folder Picker. Leave '' to paste a folder link instead
  GOOGLE_APP_ID:    '',   // Optional: Cloud project NUMBER (improves Picker access handling)
  APP_VERSION: '1.1.0',
  CACHE_NAME:  'notice-desk-v2'
};
