# Migration notes — notice-desk (6).html → PWA

**Unchanged (byte-identical, verified by script):** `WORLD_PATHS`, `COUNTRIES`/aliases, `COLUMNS`, `parseRecord`, `parseXmlDoc`, `directChild*`, status/duration functions, `deriveNoticeType`, `matchSourceCountry`, `recordMatches`/`applyFilters`, aggregations, KPI defs, detail modal/timeline builders, theme code, the 40 ms-yield byte-weighted `handleFiles` loop.

## Changes
| Change | Reason |
|---|---|
| Split into `index.html` + `pwa.js` + `config.js` + `sw.js` + manifest + icons | PWA delivery; new code wraps original globals instead of editing them |
| Chart.js vendored to `vendor/` (was CDN) | Charts must work offline |
| `viewport-fit=cover`, safe-area padding, `overscroll-behavior-y:contain` | Notches; custom pull-to-refresh |
| IndexedDB `records` (key `_key`) + `meta` (`lastLoad`, `drive`, `title`, `avatar`) | Offline persistence |
| Persisted records carry an extra `_seq` field, removed again on load | `getAll()` returns key order; `_seq` restores original row order so default table order matches the original |
| Startup loads from IDB then runs `computeControlNrStatuses/computeOptions/onDataChanged` | Instant cold start |
| `handleFiles`, `clearData` wrapped | Save after load; confirm + wipe IDB on clear |
| Three listeners changed to arrow wrappers (`clearData`, `closeModal`, colvis toggle) | The originals bound the function reference at wiring time, so wrappers would be bypassed |
| `exportCsv`: `\uFEFF` BOM added | Excel on Android/desktop reads UTF-8 correctly |
| Map pointer handlers replaced with 1-pointer pan + 2-pointer pinch; `touchstart/move` preventDefault on the SVG | Wheel doesn't exist on touch; zoom buttons kept |
| `positionPopoverNearButton` replaced (viewport clamp + edge flip) | Popover could render off-screen when table scrolled |
| History layers: modal → popover → filters | Android back button |
| Chart redraw debounced 250 ms (`safeRenderVisuals` wrapper) | Typing responsiveness |
| Mobile CSS: ≥44 px targets, 16 px inputs, 280 px map, full-screen modal with sticky header | Touch usability |
| Google Drive Picker + Drive v3 download (token model, memory-only token); downloaded blobs are fed to the original `handleFiles` as `File`s | Option A; guarantees identical parsing |
| Banner, install button, privacy line, update toast, pull-to-refresh | UX requirements |
| Footer / legend / drop-zone text tweaked | Reflect on-device storage and pinch |

## Not done in this pass (deliberate, to keep the build small)
- **Web Worker parsing** — parsing still runs on the main thread, yielding between files as the original does. A single very large file (≳20 MB) can block longer than 100 ms; this is the first thing to add if that bites.
- **`files` store (raw XML)** — not created; schema changes would require reloading from Drive/files.
- **Virtualized table** — pagination kept (10/25/50/100, default 25).
- **Sticky first columns** — not added.
- **Not run on a device**: syntax checks and byte-identity checks only. Parity, offline and touch acceptance tests still need doing (see README §8).
- Filter-layer back handling: the "filters" history entry is only created when no other layer is open; if filters are applied from inside a popover it is created when the popover closes.
