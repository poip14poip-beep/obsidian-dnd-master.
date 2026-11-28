# GitHub-only project workflow

- GitHub is the sole source of truth for code, review, CI and deployment. Do not use Lovable or Lovable-managed services.
- Make changes through Git commits on the active development branch; preserve history and never force-push.
- Database migrations are versioned in `supabase/migrations/` and reviewed/tested through GitHub.
- AI calls go through the authenticated Supabase Edge Function and RouterAI. Secrets stay in Supabase Edge Function Secrets and never enter browser code.
- GitHub Pages is the client deployment target. The app origin is `https://poip14poip-beep.github.io`.

## Project Architecture Rules

- Store the 11 domain collections (`sources`, `canon_facts`, `world_state`, `player_character_state`, `npcs`, `factions`, `locations`, `timeline_events`, `turn_drafts`, `session_log`, `audit_log`) in separate `localStorage` keys (`STORAGE_KEYS`) and top-level backup keys, and forbid nesting `player_character_state` inside `world_state` via `detectNestedPlayerState`.
- All persistence writes go through `persistAndVerifyCollections`, which writes all 11 collections, immediately reads every key back, and compares the exact canonical payload and checksums against what was written; any mismatch returns an error without claiming success.
- Game turns live in append-only `session_log` with sequential `turnNumber` values gated on confirmed setup (all checklist items + named isolated player character) and a `turn_drafts -> check -> explicit player confirmation` workflow; technical messages do not receive turn numbers or advance game time.
- External Supabase Auth (`src/lib/supabase-auth.ts`) is configured strictly via `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (no Lovable Cloud DB, no hardcoded keys); `AuthGate` blocks all 11 campaign routes until authenticated while `/auth` and `/reset-password` remain public.