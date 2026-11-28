import { ingestCanonSources, sha256Text } from "./canon-ingestion";
import type { SourceDocument, SourceProcessingSummary } from "./types";
import type { CanonDateMention, CanonSection } from "./canon-ingestion";

export interface ProcessedSourceContent {
  processing: SourceProcessingSummary;
  canonSections: CanonSection[];
  dateMentions: CanonDateMention[];
}

/** Produces a SHA-256 report and, for world canon only, a source-attributed section index. */
export async function processSourceContent(
  source: Pick<SourceDocument, "id" | "title" | "type" | "fileName">,
  content: string,
  now = new Date().toISOString(),
): Promise<ProcessedSourceContent> {
  const normalized = content.replace(/\r\n?/g, "\n");
  if (!normalized.trim()) throw new Error("Нельзя обработать пустой источник.");
  const lines = normalized.split("\n");
  if (source.type === "WORLD_CANON") {
    const manifest = await ingestCanonSources([{
      sourceId: source.id, title: source.title, fileName: source.fileName ?? "manual.md",
      content: normalized, version: "uploaded",
    }], { now });
    const imported = manifest.sources[0];
    if (!imported) throw new Error("Индексатор не вернул сведения об источнике.");
    return {
      processing: {
        status: "PROCESSED", sha256: imported.sha256, characterCount: imported.characterCount,
        lineCount: imported.lineCount, sectionCount: imported.sectionCount, chunkCount: imported.chunkCount,
        dateCandidateCount: manifest.dateMentions.length, processedAt: now, warnings: manifest.warnings,
      },
      canonSections: manifest.sections,
      dateMentions: manifest.dateMentions,
    };
  }
  const headings = lines.filter((line) => /^#{1,6}\s+/.test(line)).length;
  return {
    processing: {
      status: "PROCESSED", sha256: await sha256Text(normalized), characterCount: normalized.length,
      lineCount: lines.length, sectionCount: headings || 1, chunkCount: 1,
      dateCandidateCount: 0, processedAt: now,
      warnings: headings ? [] : ["В документе нет Markdown-заголовков; сохранён полный текст без секционной разметки."],
    },
    canonSections: [],
    dateMentions: [],
  };
}
