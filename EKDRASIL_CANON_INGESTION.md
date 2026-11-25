# Ekdrasil canon ingestion pipeline

## Purpose
Ingest the player-supplied Markdown chronicle as a versioned, source-attributed corpus without publishing or rewriting the source itself.

## Guarantees
- Every source has a stable source ID, file name, declared version, SHA-256, line count and character count.
- Markdown heading hierarchy is retained as a heading path.
- Long sections are split into bounded chunks; each chunk retains source identity, heading, line range and content hash.
- Search returns original chunk text and does not synthesize facts.
- Date-like strings are only candidates marked UNREVIEWED. They are not timeline events until explicitly validated.
- The pipeline does not infer objective truth, NPC knowledge, faction membership, geography or character biography.
- Player dossiers must be ingested as a separate source partition and must never be merged into the world chronicle.

## Current source inputs
The initial source bundle supplied for this project contains:
1. ОБСИДИАН 4.1 — governing play procedure.
2. Экдрасиль, полная летопись v2 — world canon.
3. Лия Вейн, полное досье — player-authored character biography and mechanics overlay.

The third source is deliberately not part of the world-canon corpus. Its own document distinguishes established chronicle facts from author-added personal biography. Those personal additions require provenance and a compatibility review before they can be accepted into a campaign character sheet.

## Not yet implemented
- PDF/DOCX ingestion inside the application.
- Persistent cloud corpus tables and retrieval endpoints.
- Entity extraction and reviewed entity registry.
- Contradiction detection and resolution workflow.
- Full-text semantic retrieval.
- UI source upload, version diff and re-index controls.
- Campaign bootstrap from approved canon selections.
