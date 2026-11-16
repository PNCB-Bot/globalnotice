/* Notice Desk — PWA layer. Loads AFTER the original inline script and wraps its globals;
   parsing / status / filter / aggregation code is untouched. */
(function () {
'use strict';
const CFG = self.CONFIG || {};
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------------- toast ----------------
let toastT;
function toast(msg, onClick) {
  const t = $('toast'); t.textContent = msg; t.style.display = 'block';
  t.onclick = onClick || null; clearTimeout(toastT);
  toastT = setTimeout(() => { t.style.display = 'none'; }, onClick ? 12000 : 4500);
}

// ---------------- IndexedDB (hand-rolled) ----------------
let _db;
function openDb() {
  return _db || (_db = new Promise((res, rej) => {
    const r = indexedDB.open('notice-desk', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('records')) d.createObjectStore('records', { keyPath: '_key' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
function tx(store, mode, fn) {
  return openDb().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode), req = fn(t.objectStore(store));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = t.onabort = () => rej(t.error);
  }));
}
const metaGet = k => tx('meta', 'readonly', s => s.get(k)).then(v => v && v.value);
const metaSet = (k, v) => tx('meta', 'readwrite', s => { s.put({ key: k, value: v }); });

let sessionSeen = {};                                  // in-memory only: Drive file id -> modifiedTime
let driveFolder = null;
const _clearData = clearData;
clearData = function () { _clearData(); sessionSeen = {}; };
safeRenderVisuals = function () {};                    // charts/map removed in this edition

// ---- title + avatar persistence ----
$('pageTitle').addEventListener('blur', () => metaSet('title', $('pageTitle').textContent.trim()).catch(() => {}));
$('avatarInput').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const rd = new FileReader(); rd.onload = () => metaSet('avatar', rd.result).catch(() => {}); rd.readAsDataURL(f);
});
async function restorePrefs() {
  const t = await metaGet('title'); if (t) $('pageTitle').textContent = t;
  const a = await metaGet('avatar');
  if (a) { $('avatarImg').src = a; $('avatarImg').style.display = 'block'; $('avatarIcon').style.display = 'none'; }
}

// ---------------- Google Drive: files are streamed into memory, parsed, discarded. Nothing is saved. ----------------
const driveReady = () => !!CFG.GOOGLE_CLIENT_ID;
const pickerReady = () => driveReady() && !!CFG.GOOGLE_API_KEY;
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const FOLDER = 'application/vnd.google-apps.folder';
const _scripts = {};
function loadScript(src) {
  return _scripts[src] || (_scripts[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res;
    s.onerror = () => { delete _scripts[src]; rej(new Error('Could not load Google script — are you offline?')); };
    document.head.appendChild(s);
  }));
}
let tok = null, tokExp = 0, tokClient = null, pend = null;      // access token lives in memory only
function getToken(force) {
  if (!force && tok && Date.now() < tokExp - 60000) return Promise.resolve(tok);
  return loadScript('https://accounts.google.com/gsi/client').then(() => new Promise((res, rej) => {
    tokClient = tokClient || google.accounts.oauth2.initTokenClient({
      client_id: CFG.GOOGLE_CLIENT_ID, scope: SCOPE,
      callback: r => { const p = pend; pend = null; if (!p) return;
        if (r.error) p.rej(new Error(r.error_description || r.error));
        else { tok = r.access_token; tokExp = Date.now() + (r.expires_in || 3600) * 1000; p.res(tok); } },
      error_callback: e => { const p = pend; pend = null; if (p) p.rej(new Error(e.type || 'Sign-in cancelled')); }
    });
    pend = { res, rej }; tokClient.requestAccessToken({ prompt: '' });
  }));
}
async function dfetch(url, blob) {
  for (let a = 0; a < 2; a++) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + await getToken(a > 0) } });
    if (r.status === 401 && a === 0) continue;                 // expired token → re-auth once
    if (!r.ok) throw new Error('Drive responded ' + r.status);
    return blob ? r.blob() : r.json();
  }
}
async function pick() {
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise(r => gapi.load('picker', r));
  const t = await getToken();
  return new Promise(res => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true)
      .setMimeTypes(FOLDER + ',text/xml,application/xml');
    const b = new google.picker.PickerBuilder().setOAuthToken(t).setDeveloperKey(CFG.GOOGLE_API_KEY).addView(view)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED).setTitle('Choose XML files or a folder')
      .setCallback(d => { if (d.action === google.picker.Action.PICKED) res(d.docs); else if (d.action === google.picker.Action.CANCEL) res(null); });
    if (CFG.GOOGLE_APP_ID) b.setAppId(CFG.GOOGLE_APP_ID);
    b.build().setVisible(true);
  });
}
async function listXml(folderId, out) {
  let pt = '';
  do {
    const q = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
    const j = await dfetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&pageSize=1000&fields=' +
      encodeURIComponent('nextPageToken,files(id,name,mimeType,modifiedTime)') + (pt ? '&pageToken=' + pt : ''));
    for (const f of j.files) { if (f.mimeType === FOLDER) await listXml(f.id, out); else if (/\.xml$/i.test(f.name)) out.push(f); }
    pt = j.nextPageToken || '';
  } while (pt);
}
let busy = false;
async function driveLoad(targets, skipSeen) {
  if (busy || state.isLoading) return; busy = true;
  try {
    const files = [], folders = [];
    for (const d of targets) {
      if (d.mimeType === FOLDER) { folders.push(d.id); await listXml(d.id, files); }
      else files.push({ id: d.id, name: d.name, modifiedTime: d.lastEditedUtc ? new Date(d.lastEditedUtc).toISOString() : '' });
    }
    const meta = (await metaGet('drive')) || { folders: [] };
    const todo = files.filter(f => !skipSeen || !f.modifiedTime || sessionSeen[f.id] !== f.modifiedTime);
    if (!todo.length) { toast(files.length ? 'Already up to date.' : 'No .xml files found there.'); return; }
    showLoadProgress();
    const got = [];
    for (let i = 0; i < todo.length; i++) {
      setLoadProgress(i / todo.length, 'Downloading ' + todo[i].name + ' (' + (i + 1) + ' of ' + todo.length + ')', true);
      const b = await dfetch('https://www.googleapis.com/drive/v3/files/' + todo[i].id + '?alt=media', true);
      got.push(new File([b], todo[i].name, { type: 'text/xml' }));
      await nextFrame();
    }
    hideLoadProgress();
    meta.folders = [...new Set(meta.folders.concat(folders))]; driveFolder = meta.folders[0] || null;
    busy = false;                                              // handleFiles has its own isLoading guard
    await handleFiles(got);
    todo.forEach(f => { sessionSeen[f.id] = f.modifiedTime; });
    await metaSet('drive', { folders: meta.folders });   // only the folder id is remembered
  } catch (e) { hideLoadProgress(); toast('Drive: ' + e.message); }
  finally { busy = false; }
}
async function driveChoose() {
  try {
    if (pickerReady()) { const d = await pick(); if (d && d.length) await driveLoad(d, false); return; }
    const v = prompt('Paste the Google Drive folder link');         // no API key needed for this path
    const m = v && /folders\/([\w-]{10,})|[?&]id=([\w-]{10,})|^([\w-]{20,})$/.exec(v.trim());
    if (m) await driveLoad([{ id: m[1] || m[2] || m[3], mimeType: FOLDER }], false); else if (v) toast('Could not read a folder ID from that link.');
  } catch (e) { toast('Drive: ' + e.message); }
}
async function driveSync() {
  const m = await metaGet('drive');
  if (m && m.folders && m.folders.length) driveLoad(m.folders.map(id => ({ id, mimeType: FOLDER })), true);
  else driveChoose();
}
function refresh() {
  if (state.isLoading || busy) return;
  if (driveReady()) driveSync(); else $('fileInputTop').click();
}
function mkBtn(label, cls, fn) { const b = document.createElement('button'); b.className = cls; b.textContent = label; b.addEventListener('click', fn); return b; }
if (driveReady()) {
  ['btnChooseFolder', 'btnChooseFiles', 'btnAddFolderTop', 'btnAddFilesTop'].forEach(id => { const e = $(id); if (e) e.style.display = 'none'; });
  document.querySelector('#emptyWrap .load-controls').prepend(mkBtn('Load from Google Drive', 'btn primary', driveSync), mkBtn('Change folder', 'btn', driveChoose));
  $('topLoadControls').prepend(mkBtn('Reload from Drive', 'btn small', driveSync), mkBtn('Change folder', 'btn small', driveChoose));
}

// ---------------- install prompt ----------------
let dip = null;
const ib = mkBtn('Install app', 'btn small', async () => { if (!dip) return; dip.prompt(); await dip.userChoice; dip = null; ib.hidden = true; });
ib.hidden = true; $('themeToggle').before(ib);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); dip = e; ib.hidden = false; });
addEventListener('appinstalled', () => { ib.hidden = true; });

// ---------------- history layers (Android back) ----------------
const layers = []; let suppress = 0, keepPop = false, chain = Promise.resolve();
const top = () => layers[layers.length - 1];
function hist(fn, waitPop) {                                   // serialise history ops so push/back never race
  chain = chain.then(() => new Promise(res => {
    if (!waitPop) { fn(); return res(); }
    let done = false;
    const h = () => { if (done) return; done = true; removeEventListener('popstate', h); res(); };
    addEventListener('popstate', h); suppress++; fn();
    setTimeout(() => { if (!done) { done = true; suppress = Math.max(0, suppress - 1); res(); } }, 500);
  }));
}
function layerOpen(n) { if (top() === n) return; layers.push(n); hist(() => history.pushState({ nd: n }, ''), false); }
function layerClose(n) { if (top() !== n) return false; layers.pop(); hist(() => history.back(), true); return true; }
const hasFilters = () => Object.values(state.filters).some(hasActiveFilter) || !!state.globalSearch;
function syncFilters() {
  const on = hasFilters();
  if (on && !layers.includes('filters') && !layers.length) layerOpen('filters');
  else if (!on && top() === 'filters') layerClose('filters');
}
function resetAllFilters() {
  state.filters = {}; state.globalSearch = ''; $('globalSearch').value = ''; renderHead(); updateFiltered(true);
}
addEventListener('popstate', () => {
  if (suppress > 0) { suppress--; return; }
  const n = layers.pop(); if (!n) return;
  if (n === 'modal') _closeModal();
  else if (n === 'popover') { keepPop = true; _closeAllPopovers(); keepPop = false; setTimeout(syncFilters, 0); }
  else if (n === 'filters') resetAllFilters();
});
const _openDetailModal = openDetailModal, _closeModal = closeModal, _closeAllPopovers = closeAllPopovers, _updateFiltered = updateFiltered;
openDetailModal = function (r) { _openDetailModal(r); if ($('modalOverlay').classList.contains('open')) layerOpen('modal'); };
closeModal = function () { _closeModal(); layerClose('modal'); };
closeAllPopovers = function () {
  const had = !!state.openPopover; _closeAllPopovers();
  if (had && !keepPop && layerClose('popover')) setTimeout(syncFilters, 0);
};
['openFilterPopover', 'openDurationPopover', 'openColvisPopover'].forEach(n => {
  const o = self[n];
  self[n] = function () {
    const had = top() === 'popover'; keepPop = had;
    try { o.apply(this, arguments); } finally { keepPop = false; }
    if (state.openPopover && !had) layerOpen('popover');
  };
});
updateFiltered = function (a) { _updateFiltered(a); syncFilters(); };

// ---------------- popover clamping ----------------
positionPopoverNearButton = function (panel, btn) {
  if (panel.parentElement !== document.body) document.body.appendChild(panel);
  const rect = btn.getBoundingClientRect(), margin = 6, vw = window.innerWidth;
  const w = Math.min(panel.offsetWidth || 280, vw - 16);
  let left = rect.right - w;                                   // original: right-aligned to the button
  if (rect.right < 20) left = 8;                               // button scrolled off the left → flip to left edge
  else if (rect.left > vw - 20) left = vw - w - 8;             // scrolled off the right → flip to right edge
  left = Math.max(8, Math.min(left, vw - w - 8));
  panel.style.maxWidth = (vw - 16) + 'px'; panel.style.left = left + 'px'; panel.style.right = 'auto';
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < 326 && rect.top > spaceBelow) { panel.style.top = 'auto'; panel.style.bottom = (window.innerHeight - rect.top + margin) + 'px'; }
  else { panel.style.bottom = 'auto'; panel.style.top = (rect.bottom + margin) + 'px'; }
};

// ---------------- pull-to-refresh ----------------
const ptr = document.createElement('div'); ptr.id = 'ptr'; document.body.appendChild(ptr);
let py = null, pull = 0;
document.addEventListener('touchstart', e => {
  py = (window.scrollY > 0 || e.touches.length !== 1 || layers.length || e.target.closest('#worldMap,.table-wrapper,.modal-overlay,.popover')) ? null : e.touches[0].clientY;
  pull = 0;
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (py == null) return;
  pull = e.touches[0].clientY - py;
  if (pull > 10 && window.scrollY === 0) {
    ptr.textContent = pull > 90 ? 'Release to refresh' : 'Pull to refresh';
    ptr.style.transform = 'translateY(' + (Math.min(pull, 90) / 2 - ptr.offsetHeight) + 'px)';
  }
}, { passive: true });
document.addEventListener('touchend', () => {
  const go = py != null && pull > 90; py = null; pull = 0; ptr.style.transform = 'translateY(-100%)';
  if (go) refresh();
}, { passive: true });

// ---------------- service worker ----------------
if ('serviceWorker' in navigator) {
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('App updated — tap to reload', () => location.reload()); had = true; });
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW failed', e)));
}

// ---------------- startup: nothing is cached; remove anything an earlier version stored ----------------
(async () => {
  try {
    await restorePrefs();
    await tx('records', 'readwrite', s => { s.clear(); });
    await tx('meta', 'readwrite', s => { s.delete('lastLoad'); });
  } catch (e) { console.warn(e); }
})();
})();
