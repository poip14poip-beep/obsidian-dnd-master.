import { createHash } from "node:crypto";

export interface CanonSourceInput {
  sourceId: string;
  title: string;
  fileName: string;
  content: string;
  version: string;
}

export interface CanonSection {
  id: string;
  sourceId: string;
  sourceTitle: string;
  headingPath: string[];
  heading: string;
  level: number;
  startLine: number;
  endLine: number;
  text: string;
  contentHash: string;
  chunkIndex: number;
  chunkCount: number;
}

export interface CanonDateMention {
  id: string;
  sourceId: string;
  sectionId: string;
  rawText: string;
  line: number;
  reviewStatus: "UNREVIEWED";
}

export interface CanonIngestionManifest {
  schemaVersion: 1;
  corpusId: string;
  createdAt: string;
  sources: Array<{
    sourceId: string;
    title: string;
    fileName: string;
    version: string;
    sha256: string;
    characterCount: number;
    lineCount: number;
    sectionCount: number;
    chunkCount: number;
  }>;
  sections: CanonSection[];
  dateMentions: CanonDateMention[];
  warnings: string[];
}

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const slug = (value: string) =>
  value.toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "section";

interface HeadingMarker {
  line: number;
  level: number;
  title: string;
}

function getHeadings(lines: string[]): HeadingMarker[] {
  const result: HeadingMarker[] = [];
  lines.forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) result.push({ line: index + 1, level: match[1].length, title: match[2].trim() });
  });
  return result;
}

function splitIntoChunks(text: string, maxChars: number): string[] {
  if (!text.trim()) return [""];
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const next = current ? current + "\n\n" + paragraph : paragraph;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }
    let remaining = paragraph;
    while (remaining.length > maxChars) {
      let cut = remaining.lastIndexOf("\n", maxChars);
      if (cut < Math.floor(maxChars * 0.55)) cut = remaining.lastIndexOf(" ", maxChars);
      if (cut < Math.floor(maxChars * 0.55)) cut = maxChars;
      chunks.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    current = remaining;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [""];
}

/**
 * Lossless-by-reference Markdown ingestion.
 * It does not rewrite facts, infer entities, or promote player-dossier claims
 * into world canon. Date strings are only candidate mentions for human review.
 */
export function ingestCanonSources(
  sources: CanonSourceInput[],
  options: { maxChunkChars?: number; now?: string } = {},
): CanonIngestionManifest {
  const maxChunkChars = options.maxChunkChars ?? 4200;
  if (!Number.isInteger(maxChunkChars) || maxChunkChars < 500) {
    throw new Error("maxChunkChars must be an integer >= 500");
  }
  const seen = new Set<string>();
  const sections: CanonSection[] = [];
  const dateMentions: CanonDateMention[] = [];
  const manifestSources: CanonIngestionManifest["sources"] = [];
  const warnings: string[] = [];

  for (const source of sources) {
    if (!source.sourceId.trim() || !source.title.trim() || !source.content.trim()) {
      throw new Error("Every source requires sourceId, title and non-empty content");
    }
    if (seen.has(source.sourceId)) throw new Error(`Duplicate sourceId: ${source.sourceId}`);
    seen.add(source.sourceId);

    const normalized = source.content.replace(/\r\n?/g, "\n");
    const lines = normalized.split("\n");
    const headings = getHeadings(lines);
    const stack: string[] = [];
    const boundaries = headings.length
      ? headings.map((h, i) => ({ ...h, endLine: (headings[i + 1]?.line ?? lines.length + 1) - 1 }))
      : [{ line: 1, level: 1, title: source.title, endLine: lines.length }];

    let sourceChunkCount = 0;
    for (const boundary of boundaries) {
      stack.length = boundary.level - 1;
      stack[boundary.level - 1] = boundary.title;
      const bodyStart = boundary.line;
      const bodyLines = lines.slice(bodyStart, boundary.endLine);
      const body = bodyLines.join("\n").trim();
      const chunks = splitIntoChunks(body, maxChunkChars);
      const sectionBase = `${source.sourceId}:${boundary.line}:${slug(boundary.title)}`;
      chunks.forEach((chunk, chunkIndex) => {
        const sectionId = chunks.length === 1 ? sectionBase : `${sectionBase}:chunk-${chunkIndex + 1}`;
        sections.push({
          id: sectionId,
          sourceId: source.sourceId,
          sourceTitle: source.title,
          headingPath: stack.slice(0, boundary.level),
          heading: boundary.title,
          level: boundary.level,
          startLine: bodyStart + 1,
          endLine: boundary.endLine,
          text: chunk,
          contentHash: sha256(chunk),
          chunkIndex: chunkIndex + 1,
          chunkCount: chunks.length,
        });
        sourceChunkCount++;
        const datePattern = /\b(?:год(?:у|а|е)?\s*)?(\d{1,4})\s*(?:года|год|гг\.?|г\.)\b|\b(\d{1,4})\s*[–—-]\s*(\d{1,4})\b/giu;
        let match: RegExpExecArray | null;
        while ((match = datePattern.exec(chunk)) !== null) {
          const localOffset = body.indexOf(chunk);
          const before = body.slice(0, Math.max(0, localOffset + match.index));
          const line = bodyStart + 1 + before.split("\n").length - 1;
          dateMentions.push({
            id: `${sectionId}:date:${dateMentions.length + 1}`,
            sourceId: source.sourceId,
            sectionId,
            rawText: match[0],
            line,
            reviewStatus: "UNREVIEWED",
          });
        }
      });
    }

    if (!headings.length) warnings.push(`Source ${source.sourceId} has no Markdown headings; treated as one section.`);
    manifestSources.push({
      sourceId: source.sourceId,
      title: source.title,
      fileName: source.fileName,
      version: source.version,
      sha256: sha256(normalized),
      characterCount: normalized.length,
      lineCount: lines.length,
      sectionCount: boundaries.length,
      chunkCount: sourceChunkCount,
    });
  }

  const corpusFingerprint = sha256(manifestSources.map((s) => `${s.sourceId}:${s.sha256}`).join("|"));
  return {
    schemaVersion: 1,
    corpusId: `ekdrasil-corpus-${corpusFingerprint.slice(0, 16)}`,
    createdAt: options.now ?? new Date().toISOString(),
    sources: manifestSources,
    sections,
    dateMentions,
    warnings,
  };
}

export function findCanonSections(
  manifest: CanonIngestionManifest,
  query: string,
  sourceIds?: string[],
): CanonSection[] {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return manifest.sections
    .filter((section) => !sourceIds || sourceIds.includes(section.sourceId))
    .map((section) => {
      const haystack = `${section.headingPath.join(" ")}\n${section.text}`.toLocaleLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { section, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.section.startLine - b.section.startLine)
    .map((item) => item.section);
}
