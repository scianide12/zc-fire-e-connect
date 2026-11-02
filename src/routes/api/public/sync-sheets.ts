import { createFileRoute } from '@tanstack/react-router';

// Public webhook hit by a Google Apps Script onEdit trigger so that edits in
// the published fire/barangay Sheets sync to the app automatically.
// Caller is verified with a shared secret header (SHEETS_SYNC_SECRET), set in
// the Apps Script project next to the sheet.

function secretMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  // Constant-time-ish compare so response timing doesn't leak the secret.
  const a = new TextEncoder().encode(received);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const Route = createFileRoute('/api/public/sync-sheets')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SHEETS_SYNC_SECRET;
        if (!secret) {
          console.error('[sync-sheets] SHEETS_SYNC_SECRET is not configured');
          return new Response('Sync not configured', { status: 503 });
        }
        if (!secretMatches(request.headers.get('x-sync-secret'), secret)) {
          return new Response('Invalid or missing secret', { status: 401 });
        }

        try {
          const { runStationSync } = await import('@/lib/stations-sync.server');
          // force: a sheet edit deserves the short manual cooldown, not the
          // 15-minute automatic one.
          const result = await runStationSync(true);
          console.log('[sync-sheets]', JSON.stringify(result));
          return Response.json(result);
        } catch (error) {
          console.error('[sync-sheets] sync failed:', error);
          return Response.json(
            { error: 'Sync failed', detail: String(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});
