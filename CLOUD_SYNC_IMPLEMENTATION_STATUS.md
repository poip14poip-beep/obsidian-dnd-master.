# Cloud sync implementation status

Updated: 2026-11-25

## Source baseline
- Lovable project: `f1a28b3c-1045-4cea-a6be-745d1ef02a64`
- Source commit captured: `e2a529bc76908503dc06a5a361ec5dd3cd87de03`
- GitHub snapshot: `main` at `a1c8ec885b760116b1e2e8578830609cedd92d44`
- Work branch: `cloud-api-client`
- The snapshot excludes `.env` and `public/favicon.ico`. No secrets were committed.

## Implemented on cloud-api-client
- `src/lib/obsidian-api.ts`: typed client for the existing `obsidian-api` Edge Function.
- Uses the existing authenticated Supabase client and requires an active user session.
- Calls only existing actions: `create_campaign`, `bootstrap`, `save_draft`, `commit_turn`.
- Does not accept or send `owner_id` / `user_id`; the server derives actor from the verified JWT.
- Handles Edge Function errors and rejects empty campaign/draft identifiers and incomplete draft text.
- Draft status union matches the SQL contract: `draft` / `ready_to_commit`.
- `src/lib/obsidian-api.test.ts`: validation-guard tests.
- `.github/workflows/ci.yml`: Bun install, Vitest, and production build workflow.

## Verified backend contract
Edge Function `obsidian-api` is ACTIVE v1 with `verify_jwt=true`. It verifies the supplied JWT with `auth.getUser` and supports:
- `create_campaign`: title + optional object settings.
- `bootstrap`: campaign_id.
- `save_draft`: campaign_id + draft keys limited to id, proposed_turn, player_action, gm_resolution, pending_changes, status.
- `commit_turn`: draft_id.

SQL inspection confirmed `obsidian_api_save_draft` accepts only statuses `draft` and `ready_to_commit`. Commit requires an active campaign, campaign date and location, verified player character, and verified required sources (master_rules, world_canon, player_character). Do not assume a created preparation campaign is ready to commit turns.

## Not yet implemented / not yet verified
- The React store and UI still use localStorage; the new client is not wired into the store.
- No UI campaign picker or selected campaign_id exists yet.
- No automatic migration/import from localStorage. Any import must remain an explicit, reviewed user action.
- No UI -> DB serializer/mapper for the 11 local collections and 13 DB tables.
- No `upsert_entity` or `verify_readback` action currently exists.
- No browser JWT end-to-end test has been performed.
- GitHub Actions run has not yet been observed; initial workflow query returned no runs.
- No campaign or character data has been created.

## Next safe implementation steps
1. Add pure, tested mappers for `campaigns + world_state`, `player_character_state.character_data`, `npcs + npc_knowledge`, and sources metadata.
2. Keep `TECHNICAL_NOTE` out of the append-only game `session_log`.
3. Add explicit cloud campaign selection and read-only bootstrap before any write/sync.
4. Add server-side entity upsert and read-back/checksum endpoint only after mapping and ownership rules are reviewed.
5. Run authenticated E2E tests with a dedicated test account and clean up test rows.
6. Wire save/commit only after all preconditions and read-back verification pass.

## Safety invariants
- Never put Supabase service-role/secret keys in the browser, repo, or `VITE_*` variables.
- Do not expose `obsidian` tables directly to the browser.
- Never trust client-supplied owner IDs.
- Do not auto-import local state or overwrite it with cloud data.
- Preserve append-only semantics for `session_log` and `audit_log`.
- Keep player-character state separate from world state.
