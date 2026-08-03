## Why it fails offline

Two separate causes, both confirmed in the code:

**1. Location lookup fails without internet (this is the distance problem)**
`src/routes/index.tsx:178-185` requests a position with `enableHighAccuracy: true` and a 10s timeout, and nothing is remembered between sessions. On a phone with no data connection, the browser's positioning usually relies on network-assisted lookup (Wi-Fi/cell), so the request errors or times out → `locStatus` becomes `denied` → the whole "Call nearest station" card collapses into "Enable location" and no distances are shown. There is no last-known-position fallback.

**2. The offline station cache is often never written**
The `localStorage` write lives inside the query function (`src/routes/index.tsx:13-29`). With SSR, that function runs on the server during the route loader and the hydrated client never re-runs it, so `r9_stations_v1` can stay empty even after many online visits. Then, offline, the loader's server call fails with nothing to fall back on and the page shows the error screen.

Minor: on every open the app fires a background `syncStations()` call (line 189-198) even when offline, which just fails and delays things.

## Plan

**Location resilience** (`src/routes/index.tsx`)
- Persist the last successful position (plus a timestamp) to `localStorage` and load it on mount, so distances render immediately offline using the last known location, labelled as "last known location" when it isn't fresh.
- Two-stage geolocation: first a fast, low-accuracy attempt with `maximumAge` allowing a cached fix; if that fails, retry with high accuracy and a longer timeout. Only show the "Enable location" prompt when both fail *and* there is no stored position.
- Distinguish "permission denied" from "position unavailable/timeout" in the message, since offline users see the latter and shouldn't be told to grant permission again.

**Data cache reliability** (`src/routes/index.tsx`)
- Write the station list to `localStorage` from a client effect whenever data is present (not only inside the query function), so the offline copy is guaranteed after the first online visit.
- On load, if the server call fails and a cached copy exists, render it and show a small "Offline — showing saved data" notice instead of the error screen.

**Fewer pointless offline calls**
- Skip the startup background sync and the manual refresh network attempt when `navigator.onLine` is false; re-run the sync automatically when connectivity returns.

**Verification**
- Playwright run against a production build: load online once, then switch the context offline and confirm the page still renders, distances still compute from the stored position, and the nearest-station card + call buttons work.

### Notes
No backend or data-source changes. Cached-location behaviour is a deliberate trade-off: offline distances are based on where the phone last had a fix, which is why the UI will say so.
