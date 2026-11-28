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


## Implementation update — 28 November 2026 — server dice and NPC combat

The status above is superseded where it conflicts with the implementation below.

- NPC-owned attack and damage rolls are now executed with cryptographically secure server RNG inside the bounded tool loop. They are not returned as pending player rolls.
- The loop feeds the completed server roll back into the next tool call. A verified NPC attack hit unlocks its damage roll; a miss does not. Natural 1/20 attack handling and critical damage-dice doubling are applied by deterministic code.
- The final JSON is still validated against the strict model schema first. Only then are server-generated NPC roll records appended, so the language model cannot invent numeric NPC results.
- The player UI now uses the signed `ROLL_DICE` challenge flow instead of accepting a manually typed number. The client verifies the returned formula/dice/arithmetic, submits the signed proof with the same action, and preserves multiple completed checks during a multi-step action.
- Added the atomic `gm_dice_nonce_consumptions` table and service-role-only RPC. The migration `20261128160000_add_one_time_gm_dice_nonces.sql` was applied to Supabase project `dbchfgkdrqpjspptoezh`; the table and RPC were verified present.
- Added the missing Edge Function nonce-consumption helper and deployed `obsidian-gm` version 73 with the current `main` source.
- GitHub Actions validation completed successfully for the implementation commits: Vitest, TypeScript `--noEmit`, and production build all passed.

### Remaining release blockers

- A durable pending-turn record and reload/resume path are still required. The current pending challenge and completed player-roll state live in the active page until the action is continued; a reload can lose that in-memory state.
- The complete autonomous combat pipeline still needs broader deterministic support (initiative, multiple targets, conditions, reactions, saves, movement, and all relevant D&D 2024 action economy), plus tests for each supported mechanic.
- The current NPC server roller supports the verified attack/damage paths implemented by the existing SRD tools; it does not claim to simulate every NPC ability or encounter rule.
- Run a disposable Android campaign end-to-end against the deployed function before using an important campaign.


## Implementation update — 28 November 2026 — durable pending turns and deployment

This update supersedes earlier status notes that described signed rolls, server NPC rolls, or reload recovery as not yet implemented.

- Added a server-only `gm_pending_turns` table with a 24-hour expiry, one active pending action per account, the exact action text, validated turn draft, prepared player check, signed challenge, and completed signed roll proofs.
- Added service-role-only RPCs to save, read, append a verified player result, and clear a pending turn. The migration `20261128190000_add_durable_gm_pending_turns.sql` is applied. The table and all four RPC signatures were verified in the live project.
- Player roll execution now requires the signed challenge to match the user's active pending turn. The server rolls the dice, signs the proof, consumes one-time nonces, and atomically records the result before returning it.
- The client restores the pending action, turn draft, signed challenge, and completed roll proofs after a reload. If the roll was already stored but the continuation response was lost, the player sees the saved result and can resume the same action without rolling again.
- Repeated submission of the same action before the player rolls returns the saved pending turn and challenge instead of invoking the model again or repeating NPC rolls. A different action is rejected until the pending action is resumed or resolved.
- Added server-side NPC attack and damage dice execution inside the bounded tool loop. The tool result is fed into the next tool call; final GM roll records are appended only after the model's structured output passes validation.
- Deployed the current `main` Edge Function source to Supabase project `dbchfgkdrqpjspptoezh`: `obsidian-gm` version 74, status ACTIVE, JWT verification enabled.
- GitHub Actions for current `main` commit `710956c96623abfe09fee82099263c8547ceb855` passed: `bun run test`, `bunx tsc --noEmit`, and `bun run build`.

### Current verification boundary

The code and CI gates are now in place, and the updated Edge Function is deployed. A real authenticated Android campaign has not yet been run through the complete sequence (submit action → player roll → network interruption/reload → resume → confirm draft → commit). Do not describe the whole autonomous master as fully accepted until that end-to-end campaign succeeds.

The implementation has been committed to `main`. The earlier draft PR #21 still points to an older feature-branch head and is not the source of the deployed code. No further PR merge is required to make these `main` commits live.


### 2026-11-28 — universal pending-roll recovery correction

- Removed the two action-label-based fallback paths that attempted to infer player roll mechanics from Russian roll labels, including the generic passerby/shortbow special case.
- The engine's own D&D 2024 action interpretation remains responsible for selecting the mechanic. If it returns a pending PLAYER roll without invoking a deterministic preparation tool, the retrieval loop now sends the full action back through the available preparation tools with required tool calling, rather than parsing the label or inventing a mechanic.
- The recovery prompt directs the engine to choose among ability/skill/save checks, player attacks, player damage after a verified hit, and NPC attack/damage tools; rule or AC gaps must be resolved through SRD retrieval.
- Once a tool prepares the roll, the server-signed preparation is authoritative and the final structured roll is synchronized to the verified formula, DC/AC, and target type. The application still shows the dice control only for PLAYER rolls; NPC rolls remain server-executed.
- Added a regression test for a pending player skill check returned without a tool call. It verifies that the engine is re-invoked with required tool selection and that the final pending roll matches the server-prepared formula.
- Strengthened the shared engine boundary contract to require a preparation tool for every PLAYER roll and to prohibit choosing mechanics from roll-label text.
- Verification on main: bun run test, bunx tsc --noEmit, and bun run build all passed. The changes are deployed to Supabase obsidian-gm Edge Function version 84 (ACTIVE); GitHub Pages and Supabase Static Host workflows completed successfully.
- Remaining acceptance gate: run real authenticated gameplay from Android for several different action classes (ability/skill check, weapon attack, and NPC action), including player roll UI, server-side NPC rolls, and reload recovery. CI is not a substitute for this end-to-end test.
