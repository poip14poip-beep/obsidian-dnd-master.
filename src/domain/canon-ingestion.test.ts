import { describe, expect, it } from "vitest";
import { findCanonSections, ingestCanonSources } from "./canon-ingestion";

describe("Ekdrasil canon ingestion", () => {
  it("preserves source identity, heading hierarchy, line ranges and hashes", async () => {
    const manifest = await ingestCanonSources([{
      sourceId: "ekdrasil-v2", title: "Летопись", fileName: "chronicle.md", version: "2.0",
      content: "# Мир\nВводный текст.\n\n## История\nВ 851 году произошёл Великий разлом.\n\n### Причины\nЭксперименты с жизненной силой.",
    }], { now: "2026-11-25T00:00:00.000Z" });
    expect(manifest.sources[0]!.sha256).toHaveLength(64);
    expect(manifest.sections.map((section) => section.heading)).toEqual(["Мир", "История", "Причины"]);
    expect(manifest.sections[2]!.headingPath).toEqual(["Мир", "История", "Причины"]);
    expect(manifest.sections[1]!.text).toContain("Великий разлом");
    expect(manifest.sections[1]!.startLine).toBe(5);
    expect(manifest.sections[1]!.endLine).toBe(5);
    expect(manifest.dateMentions.some((mention) => mention.rawText.includes("851"))).toBe(true);
  });
  it("tracks distinct line ranges across multiple chunks", async () => {
    const content = "# Раздел\n" + Array.from({ length: 18 }, (_, index) =>
      `Абзац ${index + 1}: ${"текст ".repeat(70)}`).join("\n\n");
    const manifest = await ingestCanonSources([{ sourceId: "chunks", title: "Chunks", fileName: "chunks.md", version: "1", content }], { maxChunkChars: 500 });
    expect(manifest.sections.length).toBeGreaterThan(1);
    expect(manifest.sections[0]!.startLine).toBe(2);
    expect(manifest.sections[1]!.startLine).toBeGreaterThan(manifest.sections[0]!.startLine);
  });
  it("rejects duplicate source IDs", async () => {
    await expect(ingestCanonSources([
      { sourceId: "same", title: "A", fileName: "a.md", version: "1", content: "# A\ntext" },
      { sourceId: "same", title: "B", fileName: "b.md", version: "1", content: "# B\ntext" },
    ])).rejects.toThrow("Duplicate sourceId");
  });
  it("keeps date mentions unreviewed", async () => {
    const manifest = await ingestCanonSources([{ sourceId: "chron", title: "Хроника", fileName: "chron.md", version: "1", content: "# Эпоха\nВ 851 году начался период 851–1000." }]);
    expect(manifest.dateMentions.length).toBeGreaterThan(0);
    expect(manifest.dateMentions.every((mention) => mention.reviewStatus === "UNREVIEWED")).toBe(true);
  });
  it("searches without rewriting source text", async () => {
    const manifest = await ingestCanonSources([{ sourceId: "chron", title: "Хроника", fileName: "chron.md", version: "1", content: "# Мир\nТри измерения.\n\n## Разлом\nДревние эксперименты." }]);
    const results = findCanonSections(manifest, "древние эксперименты");
    expect(results).toHaveLength(1);
    expect(results[0]!.text).toBe("Древние эксперименты.");
  });
});
