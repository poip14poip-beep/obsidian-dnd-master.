import { describe, expect, it } from "vitest";
import { extractDocxText } from "./docx-text";
describe("DOCX text extraction", () => {
  it("rejects a non-DOCX file with a clear error", async () => {
    const file = new File(["not a zip"], "bad.docx");
    await expect(extractDocxText(file)).rejects.toThrow("ZIP-контейнер не найден");
  });
});
