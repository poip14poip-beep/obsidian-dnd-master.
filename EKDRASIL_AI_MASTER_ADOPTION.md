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
