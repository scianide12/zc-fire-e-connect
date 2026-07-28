## Goal

Make your existing app installable directly from the browser on both iOS and Android — no app store, no developer accounts, no cost. Users scan the QR code (already on `/share`), open the link, and add it to their home screen. It then launches full-screen with the flame icon, just like a native app.

## Current state

Your app is already 90% of a PWA:

- Manifest at `public/manifest.webmanifest` with name, icon, `display: standalone`, theme color
- Service worker (via `vite-plugin-pwa`) caching the app shell for offline use
- localStorage fallback for station data
- QR / share screen at `/share`

## What's missing for a polished install experience

1. **iOS-specific install polish.** iOS Safari ignores most of the manifest. It needs explicit `apple-touch-icon` and `apple-mobile-web-app-*` meta tags in `src/routes/__root.tsx` head so the installed app uses the flame icon, launches full-screen (no Safari chrome), and shows the correct status bar style.
2. **Multiple icon sizes.** Right now only a 512×512 icon exists. Add a 192×192 icon entry in the manifest (Android's preferred size) and a 180×180 `apple-touch-icon` (iOS home screen). Both generated from the existing red flame source.
3. **In-app "Install" hint.** A small dismissible banner on the home page detecting platform and telling the user how to install:
   - Android/Chrome: tap the "Install app" button (uses the `beforeinstallprompt` event for a one-tap install)
   - iOS Safari: shows "Tap Share → Add to Home Screen"
   - Hidden once the app is already running in standalone mode

## Technical details

- Add to `src/routes/__root.tsx` head: `apple-touch-icon` (180×180), `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=black-translucent`, `apple-mobile-web-app-title=R9 Emergency`.
- Generate `public/icon-192.png` and `public/apple-touch-icon.png` from the same red flame design as `icon-512.png`.
- Update `public/manifest.webmanifest` to list the 192 icon alongside the 512.
- New component `src/components/InstallPrompt.tsx`: captures `beforeinstallprompt`, detects iOS via UA, checks `window.matchMedia('(display-mode: standalone)')` to auto-hide once installed. Rendered on `src/routes/index.tsx` above or below the 911 banner.
- No changes to the service worker, offline logic, or data fetching.

## Result

After you re-publish, anyone who opens `https://region9-aid-now.lovable.app` on their phone can install it in one tap (Android) or two taps via Share menu (iOS). The installed app opens full-screen with the flame icon, works offline, and is indistinguishable from a store-downloaded app for this use case.