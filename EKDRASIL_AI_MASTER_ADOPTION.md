# Ekdrasil AI Master — integration status

Last updated: 2026-11-27

## Active code base and safety

- Base: the existing `cloud-api-client` branch, not `main`.
- Integration branch: `adopt/ekdrasil-master-cloud`.
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

The deployed `obsidian-gm` Edge Function is version 62. It refuses a game request if the canonical record does not match the v2.4 title, source checksum, required headings, and database version. Readiness also checks Obsidian 4.1, SRD 5.2.1, character-generation guide, and the server-side RouterAI key.

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
