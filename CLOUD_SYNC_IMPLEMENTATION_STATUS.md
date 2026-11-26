# Obsidian D&D Master — implementation status

Updated: 2026-11-26

## Source of truth and working rules

- GitHub repository: `poip14poip-beep/obsidian-dnd-master.` (the final period belongs to the repository name).
- Active development branch: `cloud-api-client`.
- GitHub is the code, review, CI and publication source of truth. Lovable is not used.
- No force-push, history rewrite, or merge into the default branch is part of this work.
- The app must support any valid imported player character. No named example character is a built-in protagonist or required fixture.
- Keep the three epistemic layers separate: D&D 2024/SRD rules, Ekdrasil world canon, and campaign-local state. A player dossier is a separate character source, never global world canon.

## Current architecture

- Mobile-first React/TypeScript app, local browser persistence, source ingestion and review lifecycle, campaign setup gate, character sheet, GM structured turn output, explicit turn preview/confirmation, append-only local journal, integrity audit and JSON backup/restore.
- Rules source: D&D 2024 / SRD 5.2.1.
- Procedure source: ОБСИДИАН 4.1.
- World source: the Ekdrasil Chronicle stored in the private GM base.
- The GM distinguishes objective world facts, player-character knowledge, NPC-specific knowledge and out-of-character information.
- Unknown facts remain UNKNOWN; uncertain facts are not silently upgraded to canon.
- The AI proposes a structured turn. The local store validates the proposed deltas and requires explicit confirmation before committing the turn.

## Recent GM improvements

- The server prompt now defines an explicit source hierarchy: rules, governing procedure, world chronicle, campaign state, character sheet and player intent.
- The server receives a compact chronicle index for the last 300 committed turns plus detailed recent and query-relevant journal entries.
- The GM is instructed to consult that chronicle before every action and preserve earlier consequences, promises, debts, relationships, injuries and discoveries.
- Canon retrieval now also uses campaign date, current/start location, start narrative, player species/class and known NPC/faction/location names when selecting relevant Chronicle passages.
- The GM model router uses DeepSeek V4.1 Flash for routine actions, Claude Sonnet 5.5 first for high-impact actions and biographies, and Gemini 4 Argon as a later fallback. Only one model is called on a successful attempt; subsequent models are fallbacks, not parallel calls.
- High-impact routing includes combat, attacks, damage, injuries, death, saving throws, spells, resources, inventory, currency, factions, NPCs, negotiations, stealth, quests and consequential world changes.
- The deployed `obsidian-gm` Edge Function is ACTIVE version 14, JWT verification enabled. The deployed source was checked after publication: it contains the new model routes, source hierarchy, chronicle instructions and character appearance schema. The old Lovable origin has been removed from its allowlist.
- RouterAI model IDs used by the router were checked against the provider's current catalogue: `anthropic/claude-sonnet-5.5`, `google/gemini-4-argon`, and `deepseek/deepseek-v4.1-flash`.

## Character portability

- Removed hardcoded named-character assumptions from campaign setup copy and the player/NPC knowledge instructions.
- The character biography schema has a structured appearance section: height, build, skin, hair, eyes, face, clothing, footwear, accessories, distinctive features and first impression.
- The preview renders these fields separately.
- The import flow accepts a supplied character sheet; it is not tied to a sample character.
- The random level-one generator remains limited to three supported classes (Fighter, Rogue, Barbarian). This is a limitation of the random generator, not of importing a ready-made character.

## Cloud snapshot persistence — implemented stage

Supabase project contains a private `obsidian` schema with 16 tables and 12 registered migrations. RLS is enabled. Direct `anon` and `authenticated` access to the private schema remains locked down.

Added:

- `obsidian.campaign_snapshots`: append-only cloud snapshot table, RLS enabled, no direct client policies or grants.
- `public.obsidian_api_save_campaign_snapshot`: service-role-only RPC. Validates the complete backup envelope, collection separation, turn number and all 11 collection checksums; uses a per-campaign advisory lock and optimistic revision checks; stores a SHA-256 digest; verifies the saved row by reading it back; appends an audit record.
- `public.obsidian_api_get_latest_campaign_snapshot`: service-role-only RPC. Checks campaign ownership and verifies the stored SHA-256 before returning the latest snapshot.
- The authenticated `obsidian-api` Edge Function exposes `save_snapshot` and `latest_snapshot`. It is ACTIVE version 6 with JWT verification enabled.
- Settings now supports creating a cloud campaign, loading the latest snapshot, and explicitly restoring it. Restore downloads a backup of the current local state first and requires player acknowledgement before replacing all 11 local collections.
- After every locally confirmed game turn, the store attempts to append a full cloud snapshot. The game and journal screens show saving/success/failure status and allow retry.
- A local cloud-campaign pointer stores only campaign UUID and last known revision. Revision conflicts block overwriting a newer snapshot from another device.
- Resetting the active local trial campaign clears the cloud link but does not delete older cloud snapshots.
- The internal RLS event-trigger function no longer grants direct EXECUTE to anon/authenticated. A transaction probe confirmed the event trigger still automatically enables RLS on newly created tables.

Important boundary: cloud snapshots are full backup archives of all 11 local collections. They are not yet a relational projection/upsert of every collection into the existing normalized campaign tables, and the app's normal gameplay path still commits locally rather than using the server-side `commit_turn` transaction as the authoritative turn commit. This is the next cloud-persistence stage.

## Backend inventory

- Private schema: 16 tables, RLS enabled.
- Registered migrations: 12.
- `obsidian-gm`: ACTIVE v14, JWT required.
- `obsidian-api`: ACTIVE v6, JWT required.
- `obsidian-app`: ACTIVE v8, serves the public app shell; JWT disabled only for this static public endpoint.
- Supabase service-role credentials and RouterAI key remain server-side; no service-role secret is placed in browser code or `VITE_*` variables.
- Security advisor currently reports three RLS-enabled private tables with no policies (`campaign_snapshots`, `gm_base_documents`, `gm_source_documents`). This is intentional: the schema is not directly exposed to browser roles and access is mediated by server functions.
- Leaked-password protection in Supabase Auth is still disabled and should be enabled as a separate account-security hardening task.

## Verification status

- GitHub Actions CI runs: `bun run test`, `bunx tsc --noEmit`, and `bun run build`.
- Cloud snapshot client validation and local-only mode have unit coverage.
- Database migration application, private table/RLS state, RPC existence and service-role-only execution grants were checked.
- `obsidian-gm` v14 was deployed and its deployed source was read back to verify the expected changes.
- No authenticated end-to-end cloud save/restore test has yet been completed using a real player session.
- No full Android-device acceptance run has yet been completed.
- No claim of complete production-ready autonomous gameplay is made at this stage.

## Remaining implementation sequence

1. **Relational cloud state and authoritative turn commit.** Map all 11 local collections into the existing normalized tables; create an atomic server transaction for the complete turn delta; preserve append-only session/audit history; add idempotency, optimistic locking and read-back; migrate the gameplay commit path to the server only after authenticated integration tests pass.
2. **Deterministic D&D 2024 mechanics.** Separate trusted dice generation and mechanical calculations from model narration. Validate action economy, attacks, damage, conditions, concentration, rests, HP, inventory, encumbrance, currency, movement and spell resources in code.
3. **Canon ingestion and review.** Preserve exact source references and section boundaries; add candidate facts, temporal validity, contradiction review and explicit approval. Never auto-select a winning version or promote candidate dates.
4. **NPC/world simulation.** Persist individual NPC goals, resources, knowledge boundaries, relationships, schedules and delayed consequences; ensure no NPC receives knowledge without an in-world channel.
5. **Android acceptance.** Test touch targets, keyboard, long text, offline/error states, reload, cloud recovery and the complete action → model proposal → roll → delta preview → player confirmation → save → read-back → restart → restore scenario.

Do not call the prototype accepted/playable until the complete end-to-end Definition of Done has been verified.
