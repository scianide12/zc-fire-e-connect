# Faster, steadier location

Goal: the nearest station appears instantly, even when the phone's location keeps dropping in and out.

## What changes for you

1. **Instant first answer.** The app shows the nearest station from your last saved position the moment it opens, with a small note when that position is older than 10 minutes ("checking your location…").
2. **Continuous tracking while open.** Instead of asking for a one-off fix, the app keeps listening for position updates the whole time it's open, so a returning signal is picked up within a second or two instead of on the next tap.
3. **No more flip-flopping.** Losing signal no longer wipes the screen or swaps in the warning banner. The last good position stays on screen; the banner only appears when there is nothing usable at all.
4. **Fresher = better.** A saved position under 10 minutes old is treated as current. Older than that, distances still show but are marked as approximate until a new fix lands.
5. **Quieter updates.** The nearest station only re-orders when you've actually moved a meaningful distance, so the list doesn't jump around from GPS jitter.
6. **Manual retry stays.** The "Try again" button remains for when tracking is fully blocked.

## Technical notes

In `src/routes/index.tsx`:

- Replace the two-stage `getCurrentPosition` flow with `navigator.geolocation.watchPosition` started on mount and cleared on unmount, options `{ enableHighAccuracy: true, maximumAge: 60000, timeout: 27000 }`, plus one immediate low-accuracy `getCurrentPosition` (`maximumAge: 600000`) for the instant first paint.
- Keep the existing `r9_last_location_v1` cache; write on every accepted fix (throttled to ~1 per 30s) and read on mount as today.
- Add `locFresh` derived from `locAt` against the existing `LOCATION_FRESH_MS` (10 min) and use it to label distances as approximate rather than to hide them.
- Ignore watch errors of code 2/3 (position unavailable / timeout) when a cached or previous position exists — only code 1 (denied) sets `locStatus = "denied"`.
- Debounce state updates: accept a new position only if it moved >50 m from the current one or the accuracy improved, to stop list churn.
- Banner logic in `statusMessage` stays, but the location arm keys off "no usable position at all" instead of the last error.

No backend, data, or styling changes.
