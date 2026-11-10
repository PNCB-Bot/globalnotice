# Notice Desk (PWA)

Installable, offline-first version of `notice-desk (6).html`. Parsing, filtering, status/duration, map, charts, columns and CSV export are the original code, unmodified. Everything runs on-device; **nothing is ever uploaded** (the UI says so).

## 1. Files
```
index.html  pwa.js  config.js  sw.js  manifest.webmanifest
vendor/chart.umd.min.js   (Chart.js 4.5.1, vendored so charts work offline)
icons/icon-192.png  icon-512.png  maskable-512.png
```
World-map path data is inline in `index.html`, so it is precached with the shell.

## 2. Which Drive option was chosen
**Option A (Picker + Drive API)** is implemented, with **Option B** (folder / multi-file / drag-and-drop) always available as the fallback. The Drive buttons only appear once `GOOGLE_CLIENT_ID` and `GOOGLE_API_KEY` are set in `config.js`; until then the app behaves as a pure local-file app. Option C is documented in §6.

Auth uses Google Identity Services' **token model**: short-lived (~1 h) access token held **in memory only**, never stored. No client secret exists in the app. On expiry the app silently re-requests a token (a Google popup may appear). There is no refresh token by design — a static site cannot hold one safely. After first load all data is in IndexedDB, so Drive is only needed to fetch *new* files.

Note: `drive.readonly` is a Google "restricted" scope. For personal use keep the OAuth consent screen in **Testing** and add yourself as a test user (you will see an "unverified app" warning — expected). Tokens for test users in this mode are fine for a personal tool.

## 3. Google Cloud setup (≈10 min)
1. https://console.cloud.google.com → create a project.
2. **APIs & Services → Library**: enable **Google Drive API** and **Google Picker API**.
3. **OAuth consent screen**: External, app name, your email; add the scope `.../auth/drive.readonly`; add your Google account under **Test users**.
4. **Credentials → Create credentials → OAuth client ID → Web application**. *Authorized JavaScript origins*: `https://<your-user>.github.io` (origin only, no path) and `http://localhost:8080` for testing. Copy the client ID.
5. **Credentials → Create credentials → API key**. Restrict it: *Websites* → `https://<your-user>.github.io/*` and `http://localhost:8080/*`; *API restrictions* → Google Picker API.
6. (Optional) Project **number** (Dashboard) → `GOOGLE_APP_ID`.
7. Fill `config.js`:
```js
GOOGLE_CLIENT_ID: '1234-abc.apps.googleusercontent.com',
GOOGLE_API_KEY:   'AIza...',
GOOGLE_APP_ID:    '1234567890',
```
(The client ID and API key are not secrets; the origin/referrer restrictions are what protect them.)

## 4. Run locally
```
cd notice-desk-pwa
python3 -m http.server 8080      # then open http://localhost:8080
```
Service workers need HTTPS or `localhost`. On a phone on the same Wi-Fi use Chrome remote debugging (`chrome://inspect`, port-forward 8080) to get a secure `localhost` origin.

## 5. Deploy to GitHub Pages
1. New repo → upload the contents of this folder to the repo root (or `/docs`).
2. Settings → Pages → *Deploy from a branch* → `main` / root (or `/docs`).
3. Open `https://<user>.github.io/<repo>/` in Android Chrome → menu → **Install app** (or the in-app *Install app* button).
4. Add that exact origin to the OAuth client's Authorized JavaScript origins and the API-key referrers.

### Shipping an update
Edit files, then bump **`CACHE_NAME`** (e.g. `notice-desk-v2`) and `APP_VERSION` in `config.js` and push. The browser re-checks `sw.js` and its imported `config.js`; the new worker precaches fresh copies, deletes old `notice-desk-*` caches on activate, and the app shows an "App updated — tap to reload" toast. If you change a file but not `CACHE_NAME`, installed copies keep serving the old one (cache-first).

## 6. Offline Drive sync (no OAuth) — Options B / C
- **Drive app → file/folder → Make available offline**, then in *Files by Google* copy the folder to local storage, and use **Add files** in Notice Desk.
- Or download the folder from drive.google.com (it arrives as a ZIP), extract it with *Files by Google*, then **Add files** and multi-select the `.xml` files.
- **Android Chrome cannot pick a whole folder** (`webkitdirectory` is not supported there) — it falls back to multi-select. Folder choice works on desktop Chrome; on the phone use Drive Picker (folders supported) or multi-select.

## 7. Using it
Load once → data is saved in IndexedDB (records in batches of 500; title/avatar too). Next launches show cached data immediately, with a banner "Loaded from cache — last updated … Tap to refresh". **Clear data** now confirms, then wipes memory *and* the on-device cache. Pull down at the top of the page to refresh (Drive sync if configured, otherwise the file picker). Android back closes: modal → popover → active filters → default.

## 8. Test checklist
Airplane-mode cold start from the home-screen icon · 360×800 DevTools emulation (stacked KPIs/charts, 280 px map, full-screen modal) · pinch/pan the map · back-button order · Drive load then reload · load the same XML folder in the original and the PWA and compare KPIs / CSV.
