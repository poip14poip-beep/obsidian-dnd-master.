# Cloud sync implementation status

Updated: 2026-11-25

## Source baseline
- Lovable project: `f1a28b3c-1045-4cea-a6be-745d1ef02a64` (Obsidian Campaign Control).
- Source commit captured by Lovable: `e2a529bc76908503dc06a5a361ec5dd3cd87de03`.
- GitHub repository: `poip14poip-beep/obsidian-dnd-master.`.
- Work branch: `cloud-api-client`; current baseline at this update: `9404220a23211aa1a6869cfc2555cbaf5e446c77`.
- Do not rewrite published history or force-push. Keep work on the existing branch.

## Implemented
- `src/lib/obsidian-api.ts`: typed authenticated client for the existing `obsidian-api` Edge Function.
- Edge Function `obsidian-api` is ACTIVE v2 with `verify_jwt=true`; the actor is derived from `auth.getUser(jwt)`.
- Actions available: `list_campaigns`, `create_campaign`, `bootstrap`, `save_draft`, `commit_turn`.
- `list_campaigns` filters by the server-derived actor and returns only campaign metadata; it accepts no owner/user ID from the client.
- `src/domain/cloud-mappers.ts`: pure mapping primitives for source metadata, campaign settings, the separate world-state snapshot, player-character state, NPCs, and NPC knowledge.
- Deterministic UUIDv8 identifiers are derived from campaign + collection + local ID. Missing source/location relationships are rejected rather than silently dropped.
- Player-character state is mapped to its own table; `verified_at` remains null until a separate explicit verification step.
- Source attachment/processing never becomes `verified` automatically. Source content itself is not sent by metadata mappers.
- `src/components/CloudCampaignPanel.tsx` is integrated into Settings: list/select cloud campaigns, create a cloud campaign explicitly, and load a read-only bootstrap snapshot.
- The panel does not import cloud data into localStorage, overwrite local state, or sync game turns.
- Existing local persistence remains guarded by write -> read-back -> checksum/integrity verification and rollback on failure.
- `src/domain/cloud-mappers.test.ts` covers stable IDs, source-status rules, world/player separation, NPC knowledge mapping, and unresolved relationships.

## Verified backend contract
- Supabase project: `dbchfgkdrqpjspptoezh`.
- Private schema `obsidian`: 13 tables, RLS enabled, currently 0 rows.
- `anon` and `authenticated` have no schema USAGE/table SELECT on `obsidian`; `service_role` has the required access.
- Five migrations are registered, including direct-client lock-down, server-only RPC wrappers, and a private source-document bucket.
- `obsidian-api` verifies the JWT and uses the verified actor for every server-side operation.
- `commit_turn` requires an active campaign, date/location, a verified player character, verified required sources, and a matching sequential turn counter. A preparation campaign is not ready to commit turns.
- `session_log` and `audit_log` remain append-only. `TECHNICAL_NOTE` is not a game turn.

## CI verification
- Latest verified branch commit: `9404220a23211aa1a6869cfc2555cbaf5e446c77`.
- GitHub Actions run: `45610460254` — SUCCESS.
- `bun run test`, `bunx tsc --noEmit`, and `bun run build` all passed.

## Not yet implemented / not yet verified
- No UI -> DB write mapper is wired to automatic synchronization.
- No entity upsert/read-back endpoint exists for the 11 local collections and 13 DB tables.
- The pure mappers are not yet connected to an explicit reviewed import workflow.
- No browser JWT end-to-end test has been performed; the panel requires an authenticated user session.
- No cloud campaign or character data has been created by this work.
- No localStorage-to-cloud migration/import is automatic; any future import must be explicit, previewed, and confirmed.
- The current Lovable project is unpublished and its latest agent status is `needs_attention / out_of_credits`; the GitHub work branch and Supabase backend remain available independently.
- Floot project access was attempted but the platform returned a usage-limit lockout; do not create a replacement project.

## Next safe implementation steps
1. Review the mapper contract against all 13 database tables, including stable IDs for locations/factions and the exact representation of all 11 local collections.
2. Add a reviewed, explicit cloud import preview with a per-collection diff; do not write any local or cloud records during preview.
3. Add server-side entity upsert and read-back/checksum verification only after the mapping contract is approved.
4. Run authenticated end-to-end tests with a dedicated test account and clean up test rows.
5. Wire save/commit only after bootstrap, upsert, and read-back verification pass.

## Safety invariants
- Never put Supabase service-role/secret keys in browser code, the repository, or `VITE_*` variables.
- Do not grant `anon` or `authenticated` direct access to `obsidian` tables.
- Never trust client-supplied owner IDs.
- Do not auto-import local state or overwrite it with cloud data.
- Preserve append-only semantics for `session_log` and `audit_log`.
- Keep `player_character_state` separate from `world_state`.
