<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.

<!-- LOVABLE:END -->

## Project Architecture Rules

- Store the 11 domain collections (`sources`, `canon_facts`, `world_state`, `player_character_state`, `npcs`, `factions`, `locations`, `timeline_events`, `turn_drafts`, `session_log`, `audit_log`) in separate `localStorage` keys (`STORAGE_KEYS`) and top-level backup keys, and forbid nesting `player_character_state` inside `world_state` via `detectNestedPlayerState`.
- All persistence writes go through `persistAndVerifyCollections`, which writes all 11 collections, immediately reads every key back, and compares the exact canonical payload and checksums against what was written; any mismatch returns an error without claiming success.
- Game turns live in append-only `session_log` with sequential `turnNumber` values gated on confirmed setup (all checklist items + named isolated player character) and a `turn_drafts -> check -> explicit player confirmation` workflow; technical messages do not receive turn numbers or advance game time.
- External Supabase Auth (`src/lib/supabase-auth.ts`) is configured strictly via `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (no Lovable Cloud DB, no hardcoded keys); `AuthGate` blocks all 11 campaign routes until authenticated while `/auth` and `/reset-password` remain public.