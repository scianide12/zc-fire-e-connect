## Goal

Installed users should be told the moment a new version is ready, instead of waiting for a future app launch.

## How updates work today

- Station data is fetched live on every load, so sheet edits appear immediately.
- App code updates in the background (`registerType: "autoUpdate"`, NetworkFirst navigations) and takes effect on a later launch — with no visible signal.
- Icon and app name changes are baked in at install time and still require a reinstall. That does not change.

## What to build

1. **Detect the waiting update** — `src/lib/register-sw.ts` already registers via `workbox-window`. Hook the `waiting` event so we know when a new build has finished downloading. Keep every existing guard (dev, iframe, `id-preview--*`, `?sw=off`) untouched.
2. **Expose it to the UI** — the register function accepts a callback that fires with an "apply update" action; a small hook (`useAppUpdate`) holds that state for React.
3. **Show the banner** — mount `<Toaster />` from `@/components/ui/sonner` once in `src/routes/__root.tsx`, and raise a persistent (non-auto-dismissing) toast: "New version available" with a **Refresh** action button. Styled with existing emergency/card tokens; nothing hardcoded.
4. **Apply on tap** — Refresh sends `SKIP_WAITING` to the waiting worker and reloads once the new worker takes control. No automatic reload, so nobody gets interrupted mid-call.

## Notes

- The banner only ever appears on the published site; the service worker is intentionally disabled in dev and Lovable preview, so this can't be seen in the editor.
- Verification: production build, serve locally, load, deploy a changed build, confirm the toast appears and Refresh loads the new version.
