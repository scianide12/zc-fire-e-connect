# Combined status banner for offline and GPS failure

Today the amber banner at the top only appears when the phone has no internet. When location can't be obtained, the user instead sees a separate card lower down. This change makes one banner cover both situations with wording that adapts.

## Behavior

The banner shows whenever at least one of these is true:

- The device reports no internet connection.
- Location could not be obtained (permission denied, no fix, or geolocation unsupported).

Wording by case:

```text
No internet only   -> Offline — showing saved contacts and using your last known location.
No GPS only        -> Location unavailable — showing saved contacts. Distances may be missing or out of date.
Both               -> Offline and no location — showing saved contacts and your last known location.
```

When a cached last-known location exists, the wording references it; when there is none, it says distances are unavailable instead.

## Details

- The banner keeps its current amber warning styling and position, directly under the header.
- The existing "Enable location" / "Try again" card stays as-is, since it carries the action button. The banner is the status signal; the card is the fix.
- Once location succeeds or the device comes back online, the banner updates immediately (it already listens for online/offline events; the location status state drives the rest).

## Technical notes

- File: `src/routes/index.tsx` only. No changes to data loading, caching, or phone logic.
- Derive the banner from existing state: `offline`, `locStatus` (`denied` / `unavailable`), and whether `userLoc` is set.
- Compute the message in a small helper next to the render so the three cases stay readable.
