# Notice Desk (PWA) — table edition

A table of all notices, searchable and filterable, read **straight from a Google Drive folder into memory**. Nothing is saved on the phone and nothing is sent anywhere. Only the app itself (HTML/JS) is cached, so it opens quickly and installs to the home screen.

What you get: KPI quick-filters, the notice table with per-column filters, continuous scroll, detail view with timeline, CSV export, light/dark theme. Charts and the map were removed.

## How it works
- Tap **Load from Google Drive** → sign in → files are fetched into memory, parsed, and discarded. Close the app and the data is gone; next time tap the button again (the folder is remembered, only its ID).
- Needs internet each time you load data. The app shell opens offline, but the table is empty until you load from Drive.
- Sign-in uses Google's token model; the access token lives in memory only. Scope: `drive.readonly`.

## Setup (once)
1. https://console.cloud.google.com → new project → **APIs & Services → Library** → enable **Google Drive API** (and **Google Picker API** if you want the folder browser).
2. **OAuth consent screen**: External, add scope `.../auth/drive.readonly`, add your Google account under **Test users**.
3. **Credentials → OAuth client ID → Web application**; Authorized JavaScript origins: `https://<user>.github.io` (and `http://localhost:8080` to test). Copy the client ID.
4. Optional: **Credentials → API key**, restricted to the Picker API and your `github.io` referrer. With a key, "Load from Google Drive" opens a folder browser. Without one, you paste the folder's share link once.
5. Edit `config.js`: set `GOOGLE_CLIENT_ID` (and `GOOGLE_API_KEY` if used).

## Deploy (GitHub Pages)
Upload all files to a public repo root → Settings → Pages → `main` / root. Open `https://<user>.github.io/<repo>/` in Android Chrome → ⋮ → **Install app**.

## Shipping an update
Change files, bump `CACHE_NAME` (now `notice-desk-v2`) and `APP_VERSION` in `config.js`, commit. Phones show "App updated — tap to reload".

## Local test
`python3 -m http.server 8080` in this folder, open `http://localhost:8080`.

## Fallback
If `GOOGLE_CLIENT_ID` is empty, the original local file/folder buttons are shown instead.
