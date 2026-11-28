# Ekdrasil canon ingestion pipeline

## Purpose

Keep the world canon as one versioned, source-attributed authority for the autonomous D&D 2024 master. The uploaded source is never silently rewritten, merged with a player dossier, or replaced by a campaign event.

## Sole active world-canon source

- File: `Ekdrasil_Master_Canon_v2.4.md`
- Canon edition: **2.4**, the complete edition with 41 tomes and 250 numbered sections.
- Current global-history endpoint: year **2000**.
- Original SHA-256: `6a3aaef38a0275c72970af5a78cd3600762761b5dac6337c34dbd8a38b0a2fc4`.
- Private server record: `obsidian.gm_base_documents`, source kind `EKDRASIL_WORLD_BIBLE`, record version **4**, 405,412 characters.
- The server validates the edition title, full-source checksum and required end markers before accepting a game request.

**Legacy world-canon editions are not active sources.** The previous reference to “Экдрасиль, полная летопись v2” is obsolete and must not be uploaded, selected or treated as a competing canon. The current server base contains one world-bible record: edition 2.4. Browser-side copies are not authoritative and are excluded unless they carry the complete 2.4 identity markers. Campaign state and player dossiers remain separate from world canon.

## Ingestion and retrieval guarantees

- Every ingested source has a stable source ID, file name, declared version, SHA-256, line count and character count.
- Markdown heading hierarchy is retained as a heading path.
- Long sections are split into bounded chunks; each chunk retains source identity, heading, line range and content hash.
- Search returns original chunk text and does not synthesize facts.
- Date-like strings are only candidates marked `UNREVIEWED`; they are not timeline events until explicitly validated.
- The pipeline does not infer objective truth, NPC knowledge, faction membership, geography or character biography.
- Player dossiers are a separate source partition and are never merged into the world chronicle.

## Implemented

- Markdown source parsing, heading-aware sectioning, bounded chunking and content hashes: `src/domain/canon-ingestion.ts`.
- Lexical section retrieval with source filtering and original source text: `findCanonSections`.
- Server-side private base-document storage for the four governing sources, with version and checksum metadata.
- Canon identity validation and readiness gate in `supabase/functions/obsidian-gm/index.ts`.
- Client-side canon filtering that accepts only the full edition 2.4 identity markers.
- Authenticated upload of Markdown/text and DOCX master documents through the private server function. PDF upload is explicitly rejected by the current UI.

## Not yet complete

- PDF ingestion in the application.
- Semantic/vector retrieval; current canon selection is bounded lexical relevance, not a vector index.
- Entity extraction and a reviewed entity registry.
- Contradiction detection, temporal validity and an explicit approval workflow for candidate facts.
- A full UI for comparing canonical versions, reviewing changes and inspecting section-level provenance.
- Campaign bootstrap that materializes approved canon facts into a relational, per-campaign world registry.

## Change-control rules

1. The attached/current edition 2.4 source remains the sole world-canon authority until a new edition is explicitly approved.
2. Replacing the global world-bible record requires a complete source file and an integrity-check match; never concatenate two editions.
3. Preserve old source revisions and append-only campaign backups for audit/recovery, but do not feed old world-canon content into a live campaign as authoritative canon.
4. Dates extracted from a source remain `UNREVIEWED` until checked against the original section and explicitly approved.
5. Campaign developments after year 2000 remain campaign-local unless the world owner separately promotes them to global canon.
