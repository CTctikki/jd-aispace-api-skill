import { inflateRawSync } from "node:zlib";

const MAX_REPORT_BYTES = 20 * 1024 * 1024;

function decodeXml(value) {
  return value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function textNodes(xml) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join("");
}

function columnIndex(reference) {
  const letters = String(reference).match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  let index = 0;
  for (const letter of letters) index = (index * 26) + letter.charCodeAt(0) - 64;
  return index - 1;
}

export function parseWorksheetXml(sharedStringsXml, worksheetXml) {
  const sharedStrings = [...String(sharedStringsXml || "").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)]
    .map((match) => textNodes(match[1]));
  const rows = [];
  for (const rowMatch of String(worksheetXml || "").matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const reference = attributes.match(/\br="([^"]+)"/)?.[1] || "A1";
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] || "";
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const value = type === "s"
        ? sharedStrings[Number(raw)] ?? ""
        : type === "inlineStr"
          ? textNodes(body)
          : decodeXml(raw);
      row[columnIndex(reference)] = value;
    }
    rows.push(row);
  }
  return rows;
}

function unzipEntries(buffer) {
  let endOffset = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65_557); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      endOffset = index;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Invalid XLSX archive");
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const entries = new Map();
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid XLSX directory");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    if (method === 0) entries.set(name, compressed);
    else if (method === 8) entries.set(name, inflateRawSync(compressed));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function parseInspectionWorkbook(buffer) {
  const entries = unzipEntries(buffer);
  const worksheet = entries.get("xl/worksheets/sheet1.xml")?.toString("utf8");
  if (!worksheet) throw new Error("Inspection report has no first worksheet");
  const sharedStrings = entries.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  const [headers = [], ...rows] = parseWorksheetXml(sharedStrings, worksheet);
  const resultColumn = headers.findIndex((header) => String(header).endsWith("元素有无"));
  if (resultColumn < 0) throw new Error("Inspection result column is missing");
  return rows.filter((row) => row.some((value) => value !== "")).map((row) => ({
    skuId: String(row[0] ?? ""),
    terminal: String(row[1] ?? ""),
    location: String(row[2] ?? ""),
    matched: String(row[resultColumn] ?? "") === "是",
    result: String(row[resultColumn] ?? ""),
  }));
}

export async function fetchInspectionReport(url, fetchImpl = globalThis.fetch) {
  const normalizedUrl = String(url).startsWith("//") ? `https:${url}` : String(url);
  const parsedUrl = new URL(normalizedUrl);
  if (!new Set(["storage.jd.com", "storage.360buyimg.com"]).has(parsedUrl.hostname)) {
    throw new Error("Inspection report host is not allowed");
  }
  const response = await fetchImpl(parsedUrl);
  if (!response.ok) throw new Error(`Inspection report returned HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_REPORT_BYTES) throw new Error("Inspection report is too large");
  return { url: normalizedUrl, rows: parseInspectionWorkbook(buffer) };
}
