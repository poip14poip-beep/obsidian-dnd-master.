# Ekdrasil AI Master — integration status

Last updated: 2026-11-27

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

## Latest engine work — 2026-11-28, PR #23

Branch: `adopt/open-game-master-ekdrasil-cloud-v2`  
Target: `cloud-api-client`  
Validated HEAD: `1a97e69df90e6c29f27be33c2cdf91270f55f2ff`

- The bounded model → tool → model adjudication loop is active in the integration branch. Repeated rule/canon retrieval is capped so the D&D specialist can reach the deterministic check/attack/damage tools instead of spending the full turn budget searching.
- Player and NPC attack rolls use verified character/SRD data and server-owned dice. Natural 1/20 attack rules are distinct from ordinary checks and saving throws.
- Completed attack + damage results produce structured combat events only after signed roll proof verification. The server derives damage to the player and the app applies it through the temporary-HP-first HP resolver.
- Damage to an existing NPC is applied to its tracked combat HP only when its combat profile is already SRD-verified. NPC resistance, vulnerability and immunity are applied; unknown damage type with listed defenses fails closed.
- Verified NPC combat profiles cannot be overwritten by model narration. Combat events are stored in the turn log/checksum and update the NPC profile history.
- The Android-facing flow uses the signed server dice challenge and a visible `Бросить кубик` control; manual numeric result entry is removed.
- Regression coverage includes server-derived combat events, NPC damage persistence, resistance/vulnerability/immunity, verified-profile protection and natural 1/20 semantics.

CI run `46179467687` on HEAD `1a97e69df90e6c29f27be33c2cdf91270f55f2ff`: **SUCCESS** — 28 test files, 217 tests, TypeScript and production build.

### Still blocks declaring the app playable

- This integration branch is not yet merged into `cloud-api-client` and its Edge Function code is not deployed. The currently deployed `obsidian-gm` is version 86; it does not contain this branch's latest changes.
- A first-time/untracked NPC cannot receive persistent damage until a verified combat profile is present in the NPC registry. This is deliberately fail-closed; automatic SRD-backed creation of ephemeral combatants remains to be completed.
- Player-character damage resistance/vulnerability/immunity, full initiative/action economy, conditions, ongoing effects, rests and spell resolution still need authoritative implementation.
- There is no single server-side transaction/event ledger for all campaign mutations yet; local draft validation and storage remain in the existing app architecture.
- The authenticated Android end-to-end acceptance cycle is still required: open campaign → action → player dice → damage dice → draft → commit → reload/recovery.

Do not merge or deploy the new game-turn path until the remaining acceptance gates and the Android test are complete. `main`, Lovable and the Obsidian Library remain untouched.
