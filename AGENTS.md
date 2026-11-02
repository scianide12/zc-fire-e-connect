<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture

- Google Sheets sync logic lives in `src/lib/stations-sync.server.ts` (server-only). Both the "Update" server function (`src/lib/stations.functions.ts`) and the webhook route `/api/public/sync-sheets` delegate to it via dynamic import — one implementation, no drift. The webhook verifies callers with the `SHEETS_SYNC_SECRET` header.
