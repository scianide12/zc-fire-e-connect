# Faster start, quieter sync, quicker GPS and search

No visual changes. Every screen, button and message stays the same.

## What changes for users
1. **Instant opening**: contacts saved on the phone show right away when the app opens. Fresh data loads quietly in the background, so a slow signal never holds up the screen.
2. **Calmer background updates**: the automatic contact check runs at most once per hour, not every time the app opens. The **Update** button still checks immediately. Reconnecting after being offline still triggers a check, but only once per hour.
3. **Quicker nearest station**: the first rough location fix has a shorter wait (about 4 seconds instead of 8). Precise GPS then sharpens the result as before.
4. **Smoother search**: phone numbers and search text are prepared once instead of on every keystroke, so typing and switching tabs feel instant on budget phones.

## Technical details
- `src/routes/index.tsx`
  - `stationsQuery`: add `initialData: () => readCachedStations() ?? undefined` with `initialDataUpdatedAt` from a saved timestamp (`r9_stations_at_v1`). Cached data then renders immediately, and the query refetches in the background once it is past `staleTime`. On the server this falls back to the normal fetch.
  - Loader on the client: when cached data exists, start the fetch with `prefetchQuery` without waiting for it, instead of `ensureQueryData`.
  - Save the timestamp whenever the cache is written.
  - `runSync` on mount/online: skip if `r9_last_sync_v1` is less than 1 hour old. After a sync, use `queryClient.invalidateQueries(["stations"])` instead of a full `router.invalidate()`. `handleRefresh` stays forced and always runs.
  - Geolocation: set the first `getCurrentPosition` timeout to 4000 ms, keep `maximumAge` and the high-accuracy `watchPosition` as they are. Option A stays in place: nothing is shown without a live fix.
  - Add a memoized `prepared` list per station (`_search` lowercase name, `_phones` with display text and tel links computed once). The list, search, nearest card and selection use the prepared values.
- No changes to the backend, the service worker or the layout.
