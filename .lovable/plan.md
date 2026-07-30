## Goal

Confirm that the installed (home-screen) app actually opens and works with no network — app shell, 911 banner, and station list.

## Why this can't be answered from the editor preview

The service worker is deliberately disabled in dev and Lovable preview (`src/lib/register-sw.ts` refuses to register in iframes, `id-preview--*`, and non-PROD). So offline behavior only exists on the published site: `https://region9-aid-now.lovable.app`. Any "offline test" run against the preview only exercises the localStorage fallback, not the real installed-app path.

## Verification steps

1. **Production build check** — build the app and confirm `sw.js` + `workbox-*.js` are emitted and the precache manifest includes the HTML shell, JS/CSS bundles, icons, and `manifest.webmanifest`.
2. **Headless offline simulation against a production preview server** — serve the built output locally, load it in a real browser, let the service worker install and the station data land in `r9_stations_v1`, then cut the network (`context.set_offline(True)`), hard-reload, and screenshot. Expected: page renders from cache, 911 banner visible, station list rehydrated from localStorage, no blank screen.
3. **Route coverage offline** — repeat the offline reload on `/`, `/install`, and `/share` to confirm the navigation fallback serves the shell for all routes rather than only the home page.
4. **Real-device checklist** — since the published site is what users install, finish with a short set of steps for you: install from `https://region9-aid-now.lovable.app`, open it once online, enable Airplane Mode, relaunch from the home screen icon.

## If a gap is found

Likely culprits and fixes, in order:
- Station data not cached before going offline → prime the cache on first load rather than relying on the user visiting.
- A route 404s offline → adjust the `navigateFallback` deny-list in `vite.config.ts`.
- Stale shell after publish → confirm `registerType: "autoUpdate"` is taking effect.

No feature changes are planned; this is verification, plus a targeted fix only if a step fails.
