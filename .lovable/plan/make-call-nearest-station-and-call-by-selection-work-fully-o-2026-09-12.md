# Make "Call nearest station" and "Call by selection" work fully offline

Goal: after the app has been installed and opened once, turning off internet must still give the user the full main screen — nearest station, distance, and working call buttons — as long as the phone's location is on. No visual redesign.

## What's wrong today

The screenshot you sent is the phone's own "You're offline" page, not a screen in the app. It appears because the app currently has no saved copy of its own start page: when the app opens, it asks the server to build the page. With no internet, that request fails and the phone shows its offline page instead. Nothing in the app gets a chance to run, so the saved contacts and saved location are never used.

## What changes

1. **The app keeps a copy of its own start page.** A small saved start page is bundled with the download and stored on the device. Opening the app offline loads that copy, the app starts, and the main screen appears — the phone's "You're offline" page is never shown again.
2. **Contacts come from the phone when there's no internet.** The saved contact list already on the device is used to fill the screen immediately, so both Fire and Barangay lists, search, and selection all work with no connection.
3. **Distance and nearest station are computed on the device.** The phone's location plus the saved coordinates are all that's needed — no network involved. This already works; it just never got the chance to run offline.
4. **Calling works offline.** Call buttons dial through the phone, which needs no data.
5. **If location is off or unavailable,** the existing message stays: the screen still lists all contacts and stays fully callable, and the user is told location is unavailable so distances can't be shown, with the existing "Enable location" / "Try again" button.

## First-run requirement

The app must be opened online at least once after install so the contact list and the start page copy are saved to the device. Fully offline after that.

## Technical notes

- `vite.config.ts`: a build plugin emits `offline-shell.html` into `dist/client` containing the app's mount point and a module tag for the client entry chunk; Workbox precaches it via `navigateFallback: "offline-shell.html"`, with the existing `NetworkFirst` navigation route unchanged so online loads still get real SSR HTML. (Already implemented and verified building — the shell is emitted and listed in the generated `sw.js` precache manifest.)
- `src/routes/index.tsx`: the route currently uses a `loader` calling `ensureQueryData(stationsQuery)`. Offline, the shell has no SSR data, so the loader runs in the browser; `stationsQuery`'s `queryFn` already catches the failed `listStations()` call and returns `r9_stations_v1` from `localStorage`. Harden it so the offline path is deterministic:
  - short-circuit to the cache when `navigator.onLine === false` instead of waiting for `listStations()` to time out;
  - add `staleTime`/`gcTime` and `retry: false` so an offline mount resolves immediately;
  - keep `networkMode: "always"` semantics so the query fn (not React Query) owns the fallback.
- Geolocation, `r9_last_location_v1`, haversine distance, nearest sorting, and `tel:` links are already offline-only code paths and need no change.
- No changes to styling, layout, copy of the existing banners, backend, or the data sync logic.

## Verification

- Production build, then a Playwright run against the built output with the browser context set offline: confirm the shell is served, the main screen renders, a nearest station with a distance is shown from a seeded cached location, and call links carry `tel:` hrefs.
