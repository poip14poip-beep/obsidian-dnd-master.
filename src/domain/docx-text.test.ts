import { describe, expect, it } from "vitest";
import { extractDocxText } from "./docx-text";
describe("DOCX text extraction", () => {
  it("rejects a non-DOCX file with a clear error", async () => {
    const file = { arrayBuffer: async () => new TextEncoder().encode("not a zip").buffer } as File;
    await expect(extractDocxText(file)).rejects.toThrow("ZIP-контейнер не найден");
  });
});
