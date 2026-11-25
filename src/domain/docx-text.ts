/** Extracts readable paragraphs from a .docx file using browser-native ZIP decompression. */
export async function extractDocxText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = 0x06054b50;
  let eocd = -1;
  for (let offset = Math.max(0, bytes.length - 65557); offset <= bytes.length - 22; offset++) {
    if (view.getUint32(offset, true) === signature) eocd = offset;
  }
  if (eocd < 0) throw new Error("Файл не распознан как корректный DOCX (ZIP-контейнер не найден).");
  const entries = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  let documentEntry: { method: number; compressedSize: number; localOffset: number } | null = null;
  for (let index = 0; index < entries; index++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Повреждён каталог DOCX.");
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    if (name === "word/document.xml") {
      documentEntry = { method, compressedSize, localOffset: view.getUint32(cursor + 42, true) };
      break;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (!documentEntry) throw new Error("В DOCX не найден основной текст документа.");
  const local = documentEntry.localOffset;
  if (view.getUint32(local, true) !== 0x04034b50) throw new Error("Повреждён заголовок DOCX.");
  const nameLength = view.getUint16(local + 26, true);
  const extraLength = view.getUint16(local + 28, true);
  const start = local + 30 + nameLength + extraLength;
  const compressed = bytes.slice(start, start + documentEntry.compressedSize);
  let xmlBytes: ArrayBuffer;
  if (documentEntry.method === 0) {
    xmlBytes = compressed.slice().buffer;
  } else if (documentEntry.method === 8) {
    if (typeof DecompressionStream === "undefined") throw new Error("Этот браузер не поддерживает распаковку DOCX. Сохрани документ как .txt или .md.");
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    xmlBytes = await new Response(stream).arrayBuffer();
  } else {
    throw new Error(`Неподдерживаемый метод сжатия DOCX: ${documentEntry.method}.`);
  }
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("Не удалось прочитать XML-содержимое DOCX.");
  const paragraphs = Array.from(xml.getElementsByTagName("w:p"));
  const output = paragraphs.map((paragraph) => {
    const style = paragraph.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") ?? "";
    const level = /^Heading([1-6])$/i.exec(style)?.[1];
    const parts: string[] = [];
    for (const node of Array.from(paragraph.childNodes)) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const element = node as Element;
      if (element.localName === "pPr") continue;
      const textNodes = Array.from(element.getElementsByTagName("w:t"));
      if (textNodes.length) parts.push(textNodes.map((item) => item.textContent ?? "").join(""));
      if (element.getElementsByTagName("w:tab").length) parts.push("\t");
      if (element.getElementsByTagName("w:br").length) parts.push("\n");
    }
    const value = parts.join("").trim();
    return value ? `${level ? "#".repeat(Number(level)) + " " : ""}${value}` : "";
  }).filter(Boolean);
  const result = output.join("\n\n").trim();
  if (!result) throw new Error("В DOCX не найден текст для импорта.");
  return result;
}
