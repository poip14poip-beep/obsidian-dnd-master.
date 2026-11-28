# Ekdrasil AI Master — integration status

Last updated: 2026-11-28

## Active code base and safety

- Base: the existing `cloud-api-client` branch, not `main`.
- Active development and publication branch: `cloud-api-client`.
- Application remains React + TypeScript, Android-first, with the existing Supabase project `obsidian-control`.
- No Lovable Cloud migration, second database, local model, or browser-held provider API key.
- The production `main` branch is untouched.
- The active game page is `/game`; `/play` prepares a campaign and checks server readiness.

## Authoritative sources

1. **Obsidian 4.1** — governing campaign protocol, stored in private server source storage.
2. **D&D 2024 / SRD 5.2.1** — rules reference, separate from world canon.
3. **Ekdrasil full canon v2.4** — private server source `EKDRASIL_WORLD_BIBLE`.
   - Original file: `Ekdrasil_Master_Canon_v2.4.md`
   - Full edition: 41 tomes, 250 numbered sections
   - World snapshot / end of global chronology: year 2000
   - Original source SHA-256: `6a3aaef38a0275c72970af5a78cd3600762761b5dac6337c34dbd8a38b0a2fc4`
   - Current database record version: 4
4. Character dossier and campaign state remain separate from global canon.

The deployed `obsidian-gm` Edge Function is ACTIVE version 65 (JWT verification enabled). It refuses a game request if the canonical record does not match the v2.4 title, source checksum, required headings, and database version. Readiness also checks Obsidian 4.1, SRD 5.2.1, character-generation guide, and the server-side RouterAI key.

## Latest runtime reliability correction — 2026-11-27

The opening-scene failure was reproduced in Supabase logs. The DeepSeek request was accepted, but its 6,144-token completion budget was consumed by 5,234 reasoning tokens; the visible structured JSON was truncated (`finish_reason=length`). The application correctly refused to save the invalid turn.

Initial reliability correction deployed in v64 and retained in the active `obsidian-gm` v65:

- Game turns are now classified explicitly by `operation === GAME_TURN`, rather than treating every non-biography request as a turn.
- DeepSeek game turns request `reasoning.effort = none`, reserving the completion budget for the required state JSON.
- Game-turn output budget increased to 8,192 tokens.
- Ordinary turns use DeepSeek first and Gemini as bounded fallback; high-impact turns use Claude first and Gemini as fallback. A fallback is called only after an upstream error, truncation, invalid JSON or schema mismatch.
- Provider attempts are bounded to 42 seconds for the primary and 28 seconds for the fallback, below the 95-second client request timeout.
- Routing policy and timeout behaviour are covered by `src/domain/game-master-routing.test.ts`; GitHub CI passed tests, TypeScript and production build for commit `a742c572f0b6984d382de671689b2082e7d0e191`.

This repairs the known token-truncation route; it does not replace the required authenticated Android acceptance test. A real opening scene and a complete action/save/read-back/reload cycle still need to be performed from the player's signed-in app session.

## Context selection correction — 2026-11-27

Validated with CI and deployed in Edge Function v65:

- Browser-side canon retrieval now sends complete source chunks only, capped at 10,500 characters of canon excerpts plus 3,500 characters of matching campaign facts. It preserves edition identity, source ID, section ID and original line ranges; it skips a whole chunk rather than cutting a paragraph.
- Server-side retrieval from the canonical v2.4 source preserves original paragraph line ranges and has a 12,000-character excerpt budget for ordinary game turns (lower budgets for story/compatibility requests). The complete canonical file remains intact in private storage and the source hash is still checked before every model request.
- NDP/NPL retrieval passes normative sections 1, 2, 4, 5, 8 and 10–14 only. Empty registry templates, reference links, test fixtures and appended campaign NPC records are not sent as simulation rules. Every selected section includes source ID and source-line provenance.
- Regression coverage verifies the old canon is excluded, relevant excerpts remain whole and attributed, campaign facts are relevance-filtered, and NPC campaign records/test fixtures do not leak into the rules context.

CI passed for commit `9a76fba81042e0c7ea7a58a10ffdb9876d2770f1` (`bun run test`, `bunx tsc --noEmit`, `bun run build`). GitHub Pages and Supabase static-host publication both succeeded. These tests do not substitute for the player's authenticated Android end-to-end acceptance test.


## Canon rules enforced in the model context

- `CANON-CORE` and `CANON-EXPANDED` in v2.4 are the active world source.
- `CAMPAIGN-STATE` is limited to its own campaign; it does not rewrite global history or another campaign.
- Global chronology ends in year 2000. Later events must arise from the selected campaign or an explicitly approved scenario.
- Master knowledge is not character or NPC knowledge. Every NPC fact requires a plausible acquisition path in campaign events.
- Distinguish objective truth, documentary evidence, rumor, and personal belief.
- Old browser-side canon copies are not sent as authoritative facts unless they carry the full v2.4 markers. The server's private v2.4 source remains authoritative.

## Adopted upstream reference

`mfarme/lorekeeper` (MIT) was audited as an upstream AI-DM architecture reference:
https://github.com/mfarme/lorekeeper

Useful patterns identified: bounded turn orchestration, engine/narration boundary, semantic campaign memory, NPC agency, retry/idempotency, and consistency tests. The current app's own architecture is retained; the upstream project is not copied wholesale, and its older 2014/5e rules data is not used as authority.

## Implemented in this integration

- Server-side canonical version lock and refusal on mismatch.
- Server readiness reports exact canon edition, record version, checksum, and required source checks.
- Main game flow continues through authenticated Supabase session and server-side model gateway.
- Manual fallback no longer asks the player for an OpenAI API key; it uses the authenticated app session.
- Local stale canon copies are filtered from the prompt; the server's v2.4 retrieval remains authoritative.
- Existing structured-turn validation still rejects model-invented die results and disallows state changes while a player roll or clarification is pending.
- `/play` displays the result of the server readiness check.

## Not yet complete — do not claim full upstream engine adoption

- Porting a full tool-call loop and deterministic D&D 2024 rules engine from the upstream architecture.
- Full automated attack/damage/condition/initiative adjudication in the server. Current game flow uses the existing player-roll workflow and validated structured turn.
- Durable server-side campaign event ledger, full NPC/faction off-screen simulation, and retry/idempotency across every mutation.
- End-to-end Android acceptance: opening scene, action, roll, reviewed draft, commit, read-back, reload/recovery.
- These items remain acceptance gates for a fully finished master.

## Integration and release policy

1. Run tests, TypeScript, and production build on this integration branch.
2. Open a PR to `cloud-api-client`; merge only after checks pass.
3. GitHub Pages deploys from `cloud-api-client`. Do not merge into `main` as part of this work.
4. Test with a disposable campaign before using the user's main campaign.

## Latest engine work — 2026-11-28, PRs #23, #29–#33

Target branch: `cloud-api-client`  
Current deployed Edge Function: `obsidian-gm` v94 (ACTIVE, JWT required).

### Adopted and deployed

- PR #23: bounded upstream-compatible model → tool → model loop, SRD 5.2.1 / Ekdrasil 2.4 retrieval, deterministic player/NPC attack and damage preparation, signed dice challenges, server-side damage events, NPC verified-combat-profile protection.
- PR #29: universal `request_roll` for all 18 D&D skills, raw ability checks and saving throws. Russian/English skill names map to the same server-owned ability and verified character-sheet bonus; DC difficulty ladder and advantage/disadvantage are handled server-side.
- PR #30: `social_check` for Persuasion, Deception and Intimidation against a tracked NPC. The DC is derived from the confirmed NPC attitude; ordinary conversation does not trigger a roll.
- PR #31: `check_notice` for passive detection without a player die roll; active searching remains `request_roll`.
- PR #32: `npc_reaction` for first meetings. Server rolls 2d6 and returns hostile/indifferent/friendly; the result is persisted to the NPC record. Existing NPCs are not rerolled.
- PR #33: server-authoritative social outcomes. A decisive result (at least 5 above/below DC) shifts NPC attitude by one step, with one shift per NPC per exchange; the server synchronizes the resulting NPC change rather than leaving it to model narration.

### Verification

- CI for current `cloud-api-client` HEAD `ef826c5541eea3db506837c863c40486cc95b3dd`: SUCCESS — tests, TypeScript check and production build.
- GitHub Pages deployment: SUCCESS.
- Supabase static app deployment: SUCCESS.
- Supabase `obsidian-gm`: v93 ACTIVE.
- `main` was not changed. Existing campaign data, Supabase project and Obsidian sources were retained.

### Still blocks declaring the app fully playable

- Complete D&D 2024 rules coverage: initiative/action economy, conditions and durations, player damage defenses, spell resolution, rests and remaining exploration/group-check mechanics.
- Full NPC agency and independent faction/world simulation with bounded memory updates.
- One durable server-side transaction/event ledger covering all campaign mutations. The current app still uses a validated local draft + explicit player confirmation + local persistence/read-back + cloud snapshot.
- Authenticated Android end-to-end acceptance remains unperformed: opening scene → non-combat skill check → player die → attack → damage → review draft → explicit commit → read-back → reload/recovery.
- Manual acceptance must use a disposable test campaign first; do not reset or overwrite the user's existing campaign.

The integrated engine is materially more capable, but it is **not yet a fully accepted autonomous D&D 2024 campaign engine**. Continue one isolated subsystem at a time, with CI and deployment verification after each merge.


## Latest engine work — 2026-11-28, v94

- Added the upstream-compatible `travel` tool to the active `cloud-api-client` branch and deployed it as `obsidian-gm` v94.
- The server reads only the current campaign environment weather/precipitation when calculating travel.
- The tool handles normal/fast/slow pace, normal/difficult terrain, distance/time, and weather penalties; it returns time delta, travel distance, passive Perception penalty and slow-pace stealth handling.
- Forced march and journeys exceeding the supported 8-hour segment remain deliberately rejected until Constitution saves, exhaustion and rest recovery can be resolved as a complete server-owned sequence.
- Verified that all five deployed Edge Function source files exactly match the five corresponding files on GitHub `cloud-api-client` at the time of verification.
- GitHub Actions CI run `46184683431`: SUCCESS — `bun run test`, `bunx tsc --noEmit`, and `bun run build` all completed successfully.
- Supabase confirms `obsidian-gm` is ACTIVE at version 94 with JWT verification enabled.
- No version-94 runtime game request was present in the available function logs at verification time; Android acceptance is therefore still pending.

### Next engine priorities

1. Complete the D&D 2024 condition lifecycle: validated condition application/removal, mechanical effects, and explicit expiry triggers. Do not invent round-based durations until encounter turn tracking exists.
2. Implement short/long rest recovery using verified character resources and time advancement; no spell-slot assumptions for Ekdrasil characters without spellcasting.
3. Add initiative/action-economy and encounter state only as a separate deterministic subsystem, not as narrative-only labels.
4. Continue NPC agency and world simulation with persisted, bounded updates.
5. Complete Android end-to-end acceptance on a disposable campaign: non-combat check, player die, travel, social interaction, combat, save/read-back, reload and interrupted-turn recovery.

The v94 deployment is an integration milestone, not final acceptance of the complete autonomous master.

## Condition lifecycle foundation — 2026-11-28

- Added `src/domain/conditions.ts` with canonical Russian/English aliases for the 15 standard D&D conditions, while preserving Ekdrasil-specific custom conditions such as curses and mutations.
- Added deterministic, backward-compatible ADD/REMOVE handling for the existing string-based character state. Duplicate ADD operations are idempotent; exhaustion is stored as one explicit level; stale numbered exhaustion removals are rejected.
- Wired the resolver into turn-draft validation and the actual `commitTurnDraft` persistence path. Existing saved campaigns continue to use the current `conditions: string[]` shape.
- Added unit coverage for aliases, custom states, exhaustion levels, invalid removals, and store commit/read-back.
- Added server-side roll effects in `game-master-retrieval.ts`: poisoned checks and attacks impose disadvantage; restrained Dexterity saves impose disadvantage; paralyzed/petrified/stunned/unconscious automatically fail Strength and Dexterity saves; incapacitated states block player attacks; blinded/poisoned/prone/restrained impose attack disadvantage; invisibility grants player-attack advantage; NPC attacks gain advantage against blinded/incapacitated/paralyzed/petrified/restrained/stunned/unconscious targets and disadvantage against invisible targets; exhaustion penalties apply to attack rolls and passive checks.\n- **Not yet accepted or deployed:** no CI result is available for these direct branch commits. This is a partial mechanical implementation, not the full condition ruleset: sensory automatic failures, fear-source/charmer targeting, prone melee-distance logic, grapple movement restrictions, petrified damage resistance, and other condition-specific effects still need contextual state. No round-based expiry is claimed because encounter-round state is not implemented.
