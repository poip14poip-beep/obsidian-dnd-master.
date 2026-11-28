# Ekdrasil AI Master Adoption

Status: selected upstream foundation; integration not yet complete.

## Decision

Use **Open Dungeon Master** by `mfarme/lorekeeper` as the source project for the AI game-master orchestration patterns and reusable implementation modules.

- Upstream: https://github.com/mfarme/lorekeeper
- Upstream license: MIT (retain copyright and license notices for reused code).
- The upstream app describes itself as a complete AI Dungeon Master with a server-side tool loop, rules boundary, combat/encounter tools, campaign memory, NPC agency, and retryable interrupted turns.
- This is an adoption into the existing Ekdrasil application, not a replacement of the existing app, Supabase project, or mobile-first interface.

## Non-negotiable project constraints

- Keep the existing React + TypeScript application and its Android-friendly interface.
- Keep the existing Supabase project `obsidian-control`; do not introduce Lovable Cloud, a second database, a local SQLite dependency, or a new paid hosting dependency.
- Keep model access provider-neutral through the existing server-side AI gateway / Edge Function. Never expose provider secrets in browser code. Do not require a local model or a desktop computer on the player's device.
- Preserve manual mode.
- Preserve Obsidian 4.1 as the governing campaign procedure.
- Preserve D&D 2024 / SRD 5.2.1 as the ruleset. Upstream Open Dungeon Master currently advertises D&D 5e SRD 5.1; its 2014 rules content must NOT become authoritative for this project.
- AI proposes intent and narration; deterministic server code validates mechanics and commits state.
- Campaign turns use draft -> validate -> explicit player confirmation -> reverify/commit.
- The session journal and audit history remain append-only. A failed model/tool request must not silently commit a partial turn or display a false success.
- World canon, campaign state, player-character state, and each NPC's knowledge remain separate authorities.

## Ekdrasil canon source of truth

The current authoritative source is the user-supplied file:

- File: `Ekdrasil_Master_Canon_v2.4.md`
- Edition: **2.4 — full canonical edition**
- Declared structure: 41 tomes, 250 numbered sections; global chronology ends in year 2000.
- SHA-256: `6a3aaef38a0275c72970af5a78cd3600762761b5dac6337c34dbd8a38b0a2fc4`
- The original Markdown source is immutable. Do not rewrite, silently normalize, or merge it with older canon versions.
- Keep the source private in the existing protected source-storage path; do not commit the full world bible to this public GitHub repository.
- Index bounded chunks with source ID, version, heading path, line range, and content hash. Retrieval must return source-grounded excerpts and provenance.
- Facts in the canon are authoritative for the world. Campaign events after the chosen start date belong only to that campaign unless separately approved as canon.
- The GM's omniscient canon knowledge must not be confused with what an NPC, faction, or player character knows. NPC knowledge requires an acquisition path and campaign evidence.
- Preserve the canon's distinction between confirmed fact, documented evidence, rumor, and an NPC's personal belief.
- The world snapshot is year 2000. Later dates must be derived from campaign events or a separately approved scenario; future events are not prewritten.

## What to adopt from Open Dungeon Master

Audit and selectively adapt the following patterns/modules, retaining upstream MIT notices:

1. Tool-driven DM turn orchestration (`src/lib/dm/turn.ts`): bounded tool calls, explicit turn lifecycle, tool results fed back to the model, controlled final narration.
2. Engine boundary and narration consistency guard (`src/lib/dm/engine-boundary.ts` plus its guard): the model cannot invent dice, hit/miss, damage, HP, conditions, resources, inventory, or time outcomes.
3. Structured check, combat, action, rest, social, NPC, faction, and world tools.
4. Memory retrieval and context budgeting (`memory-index.ts`, context retrieval and compaction): retrieve relevant campaign episodes without treating summaries as stronger than the event ledger.
5. NPC agency and relationship/memory patterns, adapted to Ekdrasil's four NPC tiers and knowledge permissions.
6. Interrupted-turn retry and idempotency patterns (`retry-turn.ts`): resume the same turn, do not replay already-committed effects, and never lose the player's submitted action.
7. Test strategy: unit, integration, replay/idempotency, rule coverage, and adversarial prompt-vs-engine consistency tests.

Do not transplant the upstream 5e 2014 rules catalog as the source of truth. Map each reused mechanic to the existing D&D 2024 rules implementation and tests; any uncovered 2024 mechanic remains explicitly unsupported until implemented and tested.

## Integration order

1. Freeze the current working `main`; work only on branch `adopt/open-dungeon-master-ekdrasil`.
2. Audit upstream modules and dependencies; record exact source files and license notices before reuse.
3. Map upstream campaign/turn abstractions to Obsidian 4.1 and the existing Supabase private schema / Edge Function contract.
4. Implement a single server-side turn coordinator with draft, tool execution, validation, player confirmation, and atomic commit.
5. Add versioned canon 2.4 ingestion and retrieval with provenance, then load the Obsidian 4.1 protocol and canon excerpts into the correct model context.
6. Adapt memory and NPC agency without merging world canon, campaign events, or NPC knowledge.
7. Connect D&D 2024 rules tools; add recovery/idempotency and tests before enabling the new master in the play screen.
8. Run an end-to-end acceptance campaign with a disposable test campaign before changing the default game flow.

## Implementation log — 27 November 2026

### Upstream source audit
- Primary project: [Lebbitheplow/open-game-master](https://github.com/Lebbitheplow/open-game-master), formerly named Open Dungeon Master.
- MIT-licensed fork inspected during the initial selection: [mfarme/lorekeeper](https://github.com/mfarme/lorekeeper).
- The upstream project is a complete application with a large server-side engine, but it is built around Next.js, local SQLite, and its own persistence model. Its D&D rules content identifies itself as SRD 5.1. Therefore, copying the whole app or its 2014 rules catalog into this React/Supabase project would violate the agreed architecture and rules authority. We are porting reusable orchestration patterns, not replacing the application.
- Upstream MIT notice is retained at `licenses/OPEN_GAME_MASTER_MIT.txt`.

### Implemented in the Ekdrasil branch
- `supabase/functions/obsidian-gm/upstream-adoption.ts`: adapted engine-boundary contract. The model is not the authority for rolls or state mutations.
- `supabase/functions/obsidian-gm/game-master-retrieval.ts`: bounded server-side tool loop adapted from upstream tool-driven orchestration. It exposes only two read-only tools: `search_dnd_rules` against the protected D&D 2024 / SRD 5.2.1 source and `search_ekdrasil_canon` against the verified Ekdrasil 2.4 source.
- Tool calls are bounded to three rounds and six total calls per model attempt; each call returns at most three short source excerpts. No tool can modify campaign state, the character sheet, NPCs, dice, or persistence.
- `supabase/functions/obsidian-gm/game-master-retrieval.test.ts`: tests exact source authority, rejection of unknown tools and malformed arguments, and the model -> tool -> model loop.
- The retrieval loop is enabled only for GAME_TURN. Character-generation and compatibility operations retain their existing request formats and timeout budgets.

### Still required before this can be called a ready autonomous master
1. Port deterministic D&D 2024 mechanics as server-side tools, using the existing SRD 5.2.1 source and existing app state model. Do not import SRD 5.1 mechanics as authoritative.
2. Implement the agreed roll ownership: player rolls for their character; server RNG for NPCs/opponents. Persist pending player rolls and resume the same turn after the result.
3. Add a single bounded turn coordinator with tool execution, result validation, player confirmation, re-verification, and atomic commit. Read-only retrieval tools are not a substitute for this.
4. Port retry/idempotency and interrupted-turn recovery without duplicate rolls or mutations.
5. Adapt NPC agency and multi-layer memory to Obsidian 4.1, canon 2.4, campaign events, character knowledge, and per-NPC knowledge.
6. Add tests and run CI/build, then perform a disposable end-to-end campaign on Android before enabling the new engine by default.

Current status: **PARTIAL INTEGRATION — NOT READY FOR PLAYER TESTING AS A COMPLETE MASTER.** Existing app, saved campaigns, Supabase project, and the original canon source remain unchanged.

## Acceptance gates

- A model/tool/server failure leaves the turn visibly uncommitted; retry resumes the same turn safely.
- No duplicate dice roll, inventory mutation, HP change, or time advancement after retry.
- The model cannot directly choose or fabricate mechanical outcomes.
- Obsidian 4.1 response structure and campaign-time rules are enforced.
- Canon answers cite the exact v2.4 source chunk; no older canon version is silently mixed in.
- NPCs only act on information they could have acquired.
- Character sheet and campaign state remain separate.
- The interface works on Android; no desktop-only or local-model requirement is introduced.
- Existing manual mode and saved campaigns remain usable.


### Implementation log — 28 November 2026 — two-stage game-turn pipeline
- Added a distinct first-stage analyst request to `supabase/functions/obsidian-gm/index.ts`: DeepSeek reads the submitted action, campaign/character context, Obsidian 4.1 instructions, D&D 2024 / SRD 5.2.1 excerpts, and Ekdrasil 2.4 excerpts through the bounded read-only retrieval tools.
- The analyst returns a compact validated JSON report: action class, player checks, NPC checks, rule findings, canon findings, campaign-state findings, mutation permission, and unresolved facts.
- A separate second-stage model (Claude Sonnet, with Gemini as a bounded fallback) receives that report and produces the existing strict game-turn schema. The second model does not repeat canon/rules retrieval.
- Corrected request classification so the two-stage pipeline runs only for `operation: GAME_TURN`, not character appearance/story/origin generation.
- Added a server-side acceptance gate: when the analyst identifies a required player-character roll, the final response must request the player roll and must not change HP, time, inventory, resources, currency, conditions, NPC/world facts, or location before the roll result exists.
- Request budgets are bounded to 20 seconds for analysis, 42 seconds for the primary narration model, and 18 seconds for the Gemini fallback. This is intended to keep the ordinary path within the mobile request window; real provider latency still requires live testing.
- This is an incremental implementation, not yet a complete autonomous engine. Deterministic D&D 2024 attack/check resolution, server RNG for NPC rolls, durable pending-roll persistence/resume, idempotent commit, and full end-to-end tests remain required.


### Implementation log — 28 November 2026 — player dice UI and engine-boundary enforcement
- Added `src/domain/dice-roll.ts`: bounded dice-expression parser and cryptographically secure player-side roller. It accepts simple D&D expressions such as `1d20+5` and `2d6-1`, rejects unsupported expressions and out-of-range inputs, and uses rejection sampling to avoid modulo bias.
- Added `src/domain/dice-roll.test.ts`: deterministic tests for modifiers, multiple dice, unsupported formulas, range limits, and invalid random-source values.
- Updated `src/routes/turns.tsx`: pending player checks now show an on-screen dice control. The player taps “Бросить кубик”; the generated result is displayed and passed to the existing continuation flow. The previous free-text result field is removed for pending GM rolls.
- Added the upstream-adapted engine-boundary contract to both the analyst and narrator system prompts, so the two-stage pipeline is explicitly governed by the same no-fabricated-roll/no-premature-mutation rules.
- The dice UI still uses the existing same-action continuation mechanism. A durable server-side pending-roll record, signed/verified roll submission, resume after page reload, and idempotent continuation are not yet implemented.
- Validation status: source files and tests were committed to the feature branch, but GitHub Actions has not returned a workflow run for the current PR head. Do not treat tests/build as passed until a CI run or equivalent local test is available.

- Added same-action continuation detection: once the player has supplied dice results, the server passes that fact to both stages and rejects any final response that asks for the same player roll again.
- The player dice button becomes disabled after the roll is made, preventing repeated rerolls for the same pending check. A failed network request can be retried using the already-entered result embedded in the continuation action.

- Refined roll continuation matching: the server parses submitted player roll labels/formulas, blocks a repeated request for the same completed check, and still permits a genuinely different new check in a multi-step action. Any newly pending player check remains subject to the no-mutation gate. If the analyst says a roll is required but omits enough check detail to distinguish it from a completed check, the server fails closed rather than silently advancing.
