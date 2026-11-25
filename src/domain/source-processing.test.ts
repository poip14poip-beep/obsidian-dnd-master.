import { describe, expect, it } from "vitest";
import { processSourceContent } from "./source-processing";

describe("source processing", () => {
  it("computes SHA-256 and indexed sections for world canon without promoting dates", async () => {
    const result = await processSourceContent({
      id: "ekdrasil", title: "Хроника Экдрасиля", type: "WORLD_CANON", fileName: "chronicle.md",
    }, "# История\nВ 851 году произошёл Великий разлом.\n\n## Последствия\nИзменился ход истории.", "2026-11-25T12:00:00.000Z");
    expect(result.processing.status).toBe("PROCESSED");
    expect(result.processing.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.processing.lineCount).toBe(4);
    expect(result.processing.sectionCount).toBe(2);
    expect(result.processing.dateCandidateCount).toBeGreaterThan(0);
    expect(result.dateMentions.every((mention) => mention.reviewStatus === "UNREVIEWED")).toBe(true);
    expect(result.canonSections[0]!.startLine).toBe(2);
    expect(result.canonSections[0]!.text).toContain("Великий разлом");
  });

  it("hashes the full governing document without treating it as world canon", async () => {
    const result = await processSourceContent({
      id: "obsidian", title: "ОБСИДИАН 4.1", type: "GOVERNING_DOC", fileName: "obsidian.md",
    }, "# Раздел правил\nПолный текст правил.", "2026-11-25T12:00:00.000Z");
    expect(result.processing.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.processing.characterCount).toBe("# Раздел правил\nПолный текст правил.".length);
    expect(result.canonSections).toEqual([]);
    expect(result.dateMentions).toEqual([]);
  });

  it("rejects an empty source rather than marking it processed", async () => {
    await expect(processSourceContent({
      id: "empty", title: "Пустой источник", type: "WORLD_CANON", fileName: null,
    }, "  ")).rejects.toThrow("Нельзя обработать пустой источник");
  });
});
