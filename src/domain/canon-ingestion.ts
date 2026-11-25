import type { CertaintyStatus } from "./types";

export interface CanonSourceInput {
  sourceId: string;
  title: string;
  fileName: string;
  content: string;
  version: string;
}
export interface CanonSection {
  id: string; sourceId: string; sourceTitle: string; headingPath: string[];
  heading: string; level: number; startLine: number; endLine: number;
  text: string; contentHash: string; chunkIndex: number; chunkCount: number;
}
export interface CanonDateMention {
  id: string; sourceId: string; sectionId: string; rawText: string;
  line: number; reviewStatus: "UNREVIEWED";
}
export interface CanonIngestionManifest {
  schemaVersion: 1; corpusId: string; createdAt: string;
  sources: Array<{ sourceId: string; title: string; fileName: string; version: string; sha256: string; characterCount: number; lineCount: number; sectionCount: number; chunkCount: number }>;
  sections: CanonSection[]; dateMentions: CanonDateMention[]; warnings: string[];
}

export async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
const slug = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 72) || "section";
interface HeadingMarker { line: number; level: number; title: string; }
function getHeadings(lines: string[]): HeadingMarker[] {
  const result: HeadingMarker[] = [];
  lines.forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) result.push({ line: index + 1, level: match[1]!.length, title: match[2]!.trim() });
  });
  return result;
}
function splitIntoChunks(text: string, maxChars: number): string[] {
  if (!text.trim()) return [""];
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n\s*\n/)) {
    const next = current ? current + "\n\n" + paragraph : paragraph;
    if (next.length <= maxChars) { current = next; continue; }
    if (current) chunks.push(current);
    if (paragraph.length <= maxChars) { current = paragraph; continue; }
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

/** Ingests source-attributed text; it never promotes candidate dates or claims to canon. */
export async function ingestCanonSources(
  sources: CanonSourceInput[],
  options: { maxChunkChars?: number; now?: string } = {},
): Promise<CanonIngestionManifest> {
  const maxChunkChars = options.maxChunkChars ?? 4200;
  if (!Number.isInteger(maxChunkChars) || maxChunkChars < 500) throw new Error("maxChunkChars must be an integer >= 500");
  const seen = new Set<string>();
  const sections: CanonSection[] = [];
  const dateMentions: CanonDateMention[] = [];
  const manifestSources: CanonIngestionManifest["sources"] = [];
  const warnings: string[] = [];

  for (const source of sources) {
    if (!source.sourceId.trim() || !source.title.trim() || !source.content.trim()) throw new Error("Every source requires sourceId, title and non-empty content");
    if (seen.has(source.sourceId)) throw new Error(`Duplicate sourceId: ${source.sourceId}`);
    seen.add(source.sourceId);
    const normalized = source.content.replace(/\r\n?/g, "\n");
    const lines = normalized.split("\n");
    const headings = getHeadings(lines);
    const boundaries = headings.length ? headings.map((h, i) => ({ ...h, endLine: (headings[i + 1]?.line ?? lines.length + 1) - 1 })) : [{ line: 0, level: 1, title: source.title, endLine: lines.length }];
    let sourceChunkCount = 0;

    for (const boundary of boundaries) {
      const stack = headings.filter((h) => h.line <= boundary.line && h.level <= boundary.level)
        .reduce<HeadingMarker[]>((acc, heading) => {
          while (acc.length && acc[acc.length - 1]!.level >= heading.level) acc.pop();
          acc.push(heading); return acc;
        }, []);
      const bodyStartIndex = boundary.line;
      const bodyLines = lines.slice(bodyStartIndex, boundary.endLine);
      const body = bodyLines.join("\n").trim();
      const chunks = splitIntoChunks(body, maxChunkChars);
      const sectionBase = `${source.sourceId}:${Math.max(1, boundary.line)}:${slug(boundary.title)}`;
      let searchOffset = 0;
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex]!;
        const sectionId = chunks.length === 1 ? sectionBase : `${sectionBase}:chunk-${chunkIndex + 1}`;
        const chunkOffset = body.indexOf(chunk, searchOffset);
        const safeChunkOffset = chunkOffset >= 0 ? chunkOffset : searchOffset;
        const startLine = bodyStartIndex + 1 + body.slice(0, safeChunkOffset).split("\n").length - 1;
        const endLine = startLine + chunk.split("\n").length - 1;
        sections.push({
          id: sectionId, sourceId: source.sourceId, sourceTitle: source.title,
          headingPath: stack.map((h) => h.title), heading: boundary.title, level: boundary.level,
          startLine, endLine, text: chunk, contentHash: await sha256Text(chunk),
          chunkIndex: chunkIndex + 1, chunkCount: chunks.length,
        });
        const datePattern = /(?:^|\D)(\d{1,4})\s*(?:год(?:а|у|е)?|гг?\.?)|(?:^|\D)(\d{1,4})\s*[–—-]\s*(\d{1,4})/giu;
        let match: RegExpExecArray | null;
        while ((match = datePattern.exec(chunk)) !== null) {
          const line = startLine + chunk.slice(0, match.index).split("\n").length - 1;
          dateMentions.push({ id: `${sectionId}:date:${dateMentions.length + 1}`, sourceId: source.sourceId, sectionId, rawText: match[0]!, line, reviewStatus: "UNREVIEWED" });
        }
        searchOffset = safeChunkOffset + chunk.length;
        sourceChunkCount++;
      }
      }
    }
    if (!headings.length) warnings.push(`Source ${source.sourceId} has no Markdown headings; treated as one section.`);
    manifestSources.push({
      sourceId: source.sourceId, title: source.title, fileName: source.fileName, version: source.version,
      sha256: await sha256Text(normalized), characterCount: normalized.length, lineCount: lines.length,
      sectionCount: boundaries.length, chunkCount: sourceChunkCount,
    });
  }
  const corpusFingerprint = await sha256Text(manifestSources.map((s) => `${s.sourceId}:${s.sha256}`).join("|"));
  return { schemaVersion: 1, corpusId: `ekdrasil-corpus-${corpusFingerprint.slice(0, 16)}`, createdAt: options.now ?? new Date().toISOString(), sources: manifestSources, sections, dateMentions, warnings };
}
export function findCanonSections(manifest: CanonIngestionManifest, query: string, sourceIds?: string[]): CanonSection[] {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return manifest.sections.map((section) => {
    const haystack = `${section.headingPath.join(" ")}\n${section.text}`.toLocaleLowerCase();
    return { section, score: terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0) };
  }).filter(({ section, score }) => score > 0 && (!sourceIds || sourceIds.includes(section.sourceId)))
    .sort((a, b) => b.score - a.score || a.section.startLine - b.section.startLine).map(({ section }) => section);
}
