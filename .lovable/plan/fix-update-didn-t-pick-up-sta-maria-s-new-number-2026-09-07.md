# Fix: "Update" didn't pick up Sta Maria's new number

## What I found

I checked both the live sheet feed and the app's saved contacts:

- The published sheet feed currently gives Sta Maria FSS: **09352872162**
- The app's saved copy has exactly the same: **09352872162**

So the app is faithfully showing what the published sheet is serving. The new
number you typed is not reaching the published feed yet. Two likely causes:

1. Google keeps a cached copy of a published sheet and can take several minutes
   (occasionally longer) to serve fresh edits.
2. The edit was made in a tab that isn't the published one — the app's fire link
   has no tab selector, so it always reads the **first tab** of that sheet.

There is also a real app-side issue worth fixing: the app refuses to re-check
the sheet more than once every 15 minutes, and when it skips it still looks like
the update succeeded. So tapping "Update" twice in a row silently does nothing.

## What I'll do

1. **Confirm the source first.** Ask you to re-check that Sta Maria's new number
   is on the first tab of the fire sheet, then I'll re-read the live feed to see
   whether Google is now serving it.
2. **Make "Update" honest.** When the app skips because it refreshed recently,
   show a clear message ("Already up to date — checked X minutes ago") instead of
   a plain success.
3. **Allow a real forced refresh.** The "Update" button will bypass the 15-minute
   wait so a manual tap always re-reads the sheet; the wait stays in place for
   automatic background refreshes.
4. **Defeat Google's cache** by adding a changing value to the sheet request so
   each manual update fetches a fresh copy.
5. Re-run an update and confirm Sta Maria shows the new number in the app.

## Technical notes

- `src/lib/stations.functions.ts`: give `syncStations` an optional `force` input
  (validated) that skips the `SYNC_COOLDOWN_MS` early-return; append a cache-buster
  query param to each source URL fetch; return `{ synced, skipped, lastSyncedAt }`.
- `src/routes/index.tsx`: pass `force: true` from the Update button and surface
  the `skipped` / `lastSyncedAt` result in the toast text.
- No database schema changes.
