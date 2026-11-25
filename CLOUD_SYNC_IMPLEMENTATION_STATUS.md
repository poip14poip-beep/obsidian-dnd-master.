# Obsidian Control — implementation status and next roadmap

Updated: 2026-11-25 12:16 UTC

## Source of truth and project continuity
- Product requirements: `OBSIDIAN_PLAYABLE_PROTOTYPE_MASTER_REQUIREMENTS.md`, version 1.0 (Library reference; 250 lines).
- Governing system source: `OBSIDIAN_4.1_DND_2024_MASTER_SYSTEM(1) (1).md`.
- World source: `Ekdrasil_Full_Chronicle_v2.md`, edition 2.0.
- Player source: `Лия_Вейн_полное_досье_Экдрасиль.docx`; keep it in the separate player-character partition.
- Local reference SHA-256:
  - ОБСИДИАН 4.1: `390335e80f3b82c23ac6892fe2cb108af271073a047b2acbd4dcfc630aa6b33e`
  - Экдрасиль 2.0: `a983e3697db72964225716c6452f58d5c6c5ee7cc262de5f514d94f7fcf35976`
  - Лия dossier DOCX: `ed55f68735a7a32e1c0a03ca6b474de41bfae2d0f380330d3d51f92623f45ba2`
- GitHub repository: `poip14poip-beep/obsidian-dnd-master.` (the trailing period is part of its name).
- Continue only on `cloud-api-client`; do not force-push, rewrite history, merge into `main`, or publish without explicit approval.
- Latest verified HEAD: `a51c23f33c49ad24ecffcbc25a0a5ee88a173968`.

## Implemented in the existing application
- Existing React/TypeScript mobile-first app, routes, local state, source ingestion, canon index, DOCX extraction, dossier parser, GM structured output, turn drafts, validation, local append-only journal, and Markdown/JSON exports remain the base. This work does not replace them.
- `src/domain/cloud-mappers.ts`: typed mapping primitives for source metadata, campaign settings, separate world state, player-character state, NPCs, and NPC knowledge. Deterministic UUIDv8 IDs are scoped by campaign + collection + local ID. Missing source/location relationships fail explicitly.
- `src/components/CloudCampaignPanel.tsx`: Settings integration for explicit cloud campaign creation and read-only bootstrap by UUID. It does not import into or overwrite local state.
- `obsidian-api` Edge Function is ACTIVE v3 with `verify_jwt=true`; its deployed source is now versioned at `supabase/functions/obsidian-api/index.ts`. The actor is derived from verified JWT identity. The temporary `list_campaigns` action was removed because the private `obsidian` schema is intentionally not exposed through the Data API. Do not query that schema directly from the browser.
- Source trust lifecycle added:
  - attached content is `UNREVIEWED` and excluded from AI context by default;
  - processing and SHA-256 are separate from human verification;
  - a user must explicitly verify the content;
  - a user must separately opt the source into AI context;
  - changing/replacing attached content resets verification and context opt-in;
  - the GM requires verified, processed, context-enabled ОБСИДИАН 4.1 and player dossier;
  - only verified, context-enabled world-canon sources can supply excerpts;
  - integrity audit detects any unverified source enabled for AI context;
  - cloud metadata mapping preserves the review/context flags.
- Existing local persistence still performs write -> read-back -> checksum/integrity verification and rollback on failure.
- The source UI shows the saved source text and explicit review/context controls. Hashing is not represented as human verification.

## Verified backend contract
- Supabase project: `dbchfgkdrqpjspptoezh`.
- Private schema `obsidian`: 13 tables, RLS enabled; current row count was 0 at last inspection.
- `anon` and `authenticated` have no schema USAGE/table SELECT on `obsidian`; do not weaken this isolation to simplify UI.
- Five migrations are registered, including direct-client lock-down, server-only RPC wrappers, and a private source-document bucket.
- `commit_turn` requires an active campaign, date/location, a verified player character, verified required sources, and a matching sequential turn counter.
- `session_log` and `audit_log` remain append-only. `TECHNICAL_NOTE` is not a game turn.
- No campaign, character, or game-turn records were created by this implementation work.

## CI verification
- Latest verified HEAD: `a51c23f33c49ad24ecffcbc25a0a5ee88a173968`.
- GitHub Actions run `45612294850`: SUCCESS.
- `bun run test`, `bunx tsc --noEmit`, and `bun run build` all passed.
- Earlier intermediate commits in this source-review change set had failing CI while the store context and types were being wired. The latest HEAD above passed all three required checks.

## Source review observations
- The uploaded player dossier explicitly records Lия as Fighter 20 / Champion plus one epic campaign level, not a standard D&D 2024 level 21 progression. It explicitly states 184 HP, PB +6, four attacks, AC 20, and that current coin balance is variable/unknown. Do not infer current HP or coin amounts from the dossier.
- The dossier distinguishes canon of Ekdrasil 2.0, author-added biography, and D&D mechanics/homebrew. The importer must preserve that distinction and must not promote all biography statements to objective world canon.
- The dossier's seven-day return curse restores the body at the death location, not equipment; the character remains physically vulnerable. Keep these as separately attributed dossier facts, not global canon unless independently supported by the chronicle.
- The Chronicle is 1,295 lines and 93,753 extracted characters; it has 20 volumes and sections through the 2000-year timeline and later supplements. Section 47 states the consolidated edition and subsequent appendices take priority where earlier summaries are brief.
- The governing document has 795 lines and 32,862 extracted characters; v4.1 adds required turn header, sensory, spatial, time, inventory/weight, travel, response structure, and audit rules. The product must pass the full governing text, not a summary.

## Not yet implemented / not yet verified
- Source review lifecycle is implemented locally, but there is not yet a full authenticated browser-to-Supabase end-to-end test.
- No complete Android-device E2E run has been performed.
- The cloud mappers are not yet wired to an import/write workflow; no local-to-cloud bulk sync occurs.
- No server-side upsert/read-back transaction covers all 11 local collections / 13 DB tables yet.
- No complete source verification UI workflow has been run with the actual three original files on a real Android browser.
- Canon extraction candidates, contradictions, and human approval queue need a dedicated full workflow; date mentions remain candidates, not facts.
- D&D 2024 full mechanics/combat, authoritative dice execution, full spatial accounting, and autonomous time/faction simulation are not yet complete.
- No production/public deployment. Do not call this an accepted playable prototype.
- Lovable remains unpublished and was last reported `needs_attention / out_of_credits`; Floot access previously returned a usage-limit lockout; Replit project creation required an active subscription. Continue with existing GitHub/Supabase base; do not create a replacement project.

## Proposed implementation sequence (follow the master requirements)
1. **Source and character import acceptance.** Add integration tests against the actual extracted DOCX/Markdown content; verify exact text counts, section boundaries, table extraction, parser evidence, and UNKNOWN preservation. Add review screen showing each extracted field with its evidence; user confirms player sheet separately.
2. **Canon review workflow.** Store source-attributed claims with stable IDs, exact line ranges, excerpts, certainty, temporal validity, and review status. Add contradiction queue; never auto-select a winning version or promote candidate dates.
3. **Campaign setup gate.** Make required source, character, calendar/date/location, rule options, and no-auto-import acknowledgements explicit. Keep campaign NOT_STARTED until the full setup is confirmed.
4. **Authoritative mechanics and dice.** Implement deterministic D&D 2024 rule modules and a trusted dice engine. The AI may request a roll but cannot supply a fabricated result. Add combat/action economy, conditions, concentration, rests, HP, inventory/weight, currency, and movement validations.
5. **Turn transaction.** Preview all world and character deltas; block unresolved rolls/clarifications and invalid state changes; require explicit player confirmation. Keep world state and player character separate; journal/audit append-only.
6. **Cloud persistence.** Approve exact mappings for all collections, add server-side transactional upsert + idempotency + read-back/checksum, then authenticated recovery tests. Keep private schema inaccessible to direct browser queries.
7. **Android acceptance.** Test narrow viewport, touch targets, keyboard, long text, offline/error states, relaunch and restore. Run the full action -> response -> roll -> delta review -> confirm -> save -> read-back -> restart -> restore scenario.

## Safety and canon invariants
- Never place Supabase service-role/secret keys in browser code, repository, or `VITE_*` variables.
- Never grant `anon` or `authenticated` direct access to `obsidian` tables.
- Never trust client-supplied owner IDs.
- Never auto-import local state or overwrite it with cloud data.
- Preserve append-only `session_log` and `audit_log`.
- Keep `player_character_state` separate from `world_state`.
- Do not treat dossier biography as objective chronicle canon.
- Do not auto-start a campaign or invent starting date, time, location, turn number, HP, money, or missing values.
- Do not call the app playable until the complete Definition of Done in the master requirements is verified.

## Progress update — 2026-11-25, local entry work

- The last fully verified CI commit before this update is `65e2dbe9d7b66efdcda4730f7bda06a08572cd86`; workflow run `45612412913` passed tests, TypeScript, and build.
- Added the existing local-only guest-entry flow from the newer `main` work into `cloud-api-client`, without merging branches or changing `main`:
  - `src/auth/auth-context.tsx`: explicit guest-mode state persisted as a browser-local opt-in.
  - `src/routes/auth.tsx`: “Продолжить без аккаунта · локальный режим” entry with an explicit warning that storage is limited to this browser.
  - `src/components/AppShell.tsx`: visible guest-mode labeling and local-storage warning.
  - `src/auth/auth-guard.ts`: an unconfigured visitor is routed to `/auth`; protected routes are not silently unlocked before the player opts into guest mode.
  - `src/auth/auth-guard.test.ts`: tests for explicit guest entry and protected-route behavior.
- The guest-entry change set passed GitHub Actions run `45613859962` on code commit `549ceee9bb07023d1c57851cbbd5783e7253b786`: `bun run test`, `bunx tsc --noEmit`, and `bun run build` all succeeded. The later documentation-only status commit does not change application code.
- Branches `main` and `cloud-api-client` are diverged (20 commits on main not in this branch; 86 commits on this branch not in main at comparison time). No merge or force-push was performed.
- The existing Lovable project is still `needs_attention / out_of_credits`; no replacement project was created.
- Supabase currently lists only the active `obsidian-api` Edge Function. The newer static-site branch references `/functions/v1/obsidian-app`, but that function is not deployed. Its current `index.html` is an SSR configuration-error shell (“Supabase Auth не настроен”), not a verified playable deployment. Do not give that branch to the player as a live game.
- The current GM still requires a user-supplied OpenAI API key in the browser. No server-side OpenAI proxy/secret has been configured; this is a runtime prerequisite and potential cost to the user.
- The app remains NOT READY for play until the full source import, character review, setup gate, actual AI action/roll/commit cycle, durable save/restore, Android acceptance, and a working access URL have all been verified.
- First CI attempt exposed one stale regression expectation in `src/test/auth-guard.test.tsx`; it was corrected to require explicit guest consent. The corrective code commit `549ceee9bb07023d1c57851cbbd5783e7253b786` passed run `45613859962` with tests, typecheck, and build green.

## Progress update — source gate hardening

- Campaign setup now requires all three distinct source partitions to be attached, processed, manually verified, and explicitly enabled for AI context: ОБСИДИАН 4.1, WORLD_CANON (Хроника Экдрасиля), and PLAYER_DOSSIER (Лия). This matches the GM runtime gate; setup can no longer be marked ready with a merely uploaded or unreviewed file.
- Added a positive setup test for the fully verified three-source path and a negative test proving an unreviewed player dossier blocks campaign start.
- Verified code commit `e2092385f43b330a92ac209a60f86a6941bf048a` passed GitHub Actions run `45614238643`: 18 test files / 73 tests passed, TypeScript passed, production build passed.
- The prior CI failure on commit `0cc3933acba187bf5d266246aafb36a93c7b2679` was caused by the old store test fixture not satisfying the newly tightened source gate; the fixture was updated to model reviewed/processed/enabled sources. The corrected test suite is green.
- The current reference only establishes the campaign year as 2000 (from Liya's dossier); the exact day/time and Liya's starting location are not established. The Chronicle does not name Liya or place her at a specific location. These must remain APPROXIMATE/UNKNOWN until the player selects a start point; do not silently invent one.
