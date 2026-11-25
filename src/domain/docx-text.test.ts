import { describe, expect, it } from "vitest";
import { extractDocxText } from "./docx-text";

function storedZip(entryName: string, text: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const name = encoder.encode(entryName);
  const data = encoder.encode(text);
  const local = new Uint8Array(30 + name.length + data.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(8, 0, true);
  lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
  lv.setUint16(26, name.length, true); local.set(name, 30); local.set(data, 30 + name.length);
  const central = new Uint8Array(46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
  cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
  central.set(name, 46);
  const eocd = new Uint8Array(22); const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true); ev.setUint32(16, local.length, true);
  const result = new Uint8Array(local.length + central.length + eocd.length);
  result.set(local, 0); result.set(central, local.length); result.set(eocd, local.length + central.length);
  return result.buffer;
}

describe("DOCX text extraction", () => {
  it("rejects a non-DOCX file with a clear error", async () => {
    const file = { arrayBuffer: async () => new TextEncoder().encode("not a zip").buffer } as File;
    await expect(extractDocxText(file)).rejects.toThrow("ZIP-контейнер не найден");
  });
  it("extracts headings and text from a stored DOCX document.xml", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Досье Лии</w:t></w:r></w:p>
        <w:p><w:r><w:t>Человек. Fighter 20 / Champion.</w:t></w:r></w:p>
      </w:body></w:document>`;
    const file = { arrayBuffer: async () => storedZip("word/document.xml", xml) } as File;
    const result = await extractDocxText(file);
    expect(result).toContain("# Досье Лии");
    expect(result).toContain("Человек. Fighter 20 / Champion.");
  });
});
