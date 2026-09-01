import { inflateRawSync } from "node:zlib";
import path from "node:path";

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
  const [headers, rows] = parseFirstWorksheet(buffer);
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

export function parseWorkbookSheets(buffer) {
  const entries = unzipEntries(buffer);
  const sharedStrings = entries.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  const workbook = entries.get("xl/workbook.xml")?.toString("utf8") || "";
  const relationships = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";
  const targets = new Map([...relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map((match) => {
    const attributes = match[1];
    return [
      attributes.match(/\bId="([^"]+)"/)?.[1] || "",
      attributes.match(/\bTarget="([^"]+)"/)?.[1] || "",
    ];
  }).filter(([id, target]) => id && target));
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)].map((match, index) => {
    const attributes = match[1];
    const name = decodeXml(attributes.match(/\bname="([^"]+)"/)?.[1] || `Sheet${index + 1}`);
    const relationshipId = attributes.match(/\br:id="([^"]+)"/)?.[1] || "";
    const target = targets.get(relationshipId) || `worksheets/sheet${index + 1}.xml`;
    const entryName = target.startsWith("/")
      ? target.slice(1)
      : target.startsWith("xl/")
        ? target
        : path.posix.normalize(path.posix.join("xl", target));
    const worksheet = entries.get(entryName)?.toString("utf8");
    if (!worksheet) throw new Error(`Workbook worksheet is missing: ${name}`);
    return { name, rows: parseWorksheetXml(sharedStrings, worksheet) };
  });
  if (sheets.length === 0) {
    const worksheet = entries.get("xl/worksheets/sheet1.xml")?.toString("utf8");
    if (!worksheet) throw new Error("Workbook has no worksheet");
    return [{ name: "Sheet1", rows: parseWorksheetXml(sharedStrings, worksheet) }];
  }
  return sheets;
}

function parseFirstWorksheet(buffer) {
  const [{ rows: worksheetRows } = {}] = parseWorkbookSheets(buffer);
  if (!worksheetRows) throw new Error("Workflow report has no first worksheet");
  const [headers = [], ...rows] = worksheetRows;
  return [headers.map(String), rows.filter((row) => row.some((value) => value !== ""))];
}

function requiredColumn(headers, name) {
  const index = headers.indexOf(name);
  if (index < 0) throw new Error(`Workflow report column is missing: ${name}`);
  return index;
}

export function parseMainImageInspectionRows(headers, rows) {
  const skuColumn = requiredColumn(headers, "商品编号");
  const terminalColumn = requiredColumn(headers, "端");
  const urlColumn = requiredColumn(headers, "主图url");
  const indexColumn = requiredColumn(headers, "主图第几张");
  const checkColumns = headers.map((header, index) => ({ header, index }))
    .filter(({ header }) => header.startsWith("主图含") && header.length > 3);
  if (checkColumns.length === 0) throw new Error("Main image inspection result columns are missing");
  return rows.map((row) => ({
    skuId: String(row[skuColumn] ?? ""),
    terminal: String(row[terminalColumn] ?? ""),
    imageUrl: String(row[urlColumn] ?? ""),
    imageIndex: Number.parseInt(String(row[indexColumn] ?? "").match(/\d+/)?.[0] || "0", 10),
    checks: Object.fromEntries(checkColumns.map(({ header, index }) => [
      header.slice(3),
      String(row[index] ?? "") === "是",
    ])),
  }));
}

export function parseImageDownloadRows(headers, rows) {
  const skuColumn = requiredColumn(headers, "SKUID");
  const typeColumn = requiredColumn(headers, "图片比例");
  const resultColumn = requiredColumn(headers, "下载结果");
  const imageColumns = headers.map((header, index) => ({ header, index }))
    .filter(({ header, index }) => index > typeColumn && index < resultColumn && /^第\d+帧$/.test(header));
  return rows.map((row) => {
    const result = String(row[resultColumn] ?? "");
    return {
      skuId: String(row[skuColumn] ?? ""),
      imageType: String(row[typeColumn] ?? ""),
      images: imageColumns.map(({ header, index }) => ({
        index: Number.parseInt(header.match(/\d+/)[0], 10),
        url: String(row[index] ?? ""),
      })).filter(({ url }) => url.length > 0),
      success: result === "成功",
      result,
    };
  });
}

export function parseMainImageInspectionWorkbook(buffer) {
  const [headers, rows] = parseFirstWorksheet(buffer);
  return parseMainImageInspectionRows(headers, rows);
}

export function parseImageDownloadWorkbook(buffer) {
  const [headers, rows] = parseFirstWorksheet(buffer);
  return parseImageDownloadRows(headers, rows);
}

export async function fetchWorkflowReport(url, parser, fetchImpl = globalThis.fetch) {
  const normalizedUrl = String(url).startsWith("//") ? `https:${url}` : String(url);
  const parsedUrl = new URL(normalizedUrl);
  if (parsedUrl.protocol !== "https:" || !new Set([
    "storage.jd.com",
    "storage.360buyimg.com",
    "s3-chubaofs-internal.jd.com",
  ]).has(parsedUrl.hostname)) {
    throw new Error("Workflow report host is not allowed");
  }
  const response = await fetchImpl(parsedUrl);
  if (!response.ok) throw new Error(`Inspection report returned HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_REPORT_BYTES) throw new Error("Inspection report is too large");
  return { url: normalizedUrl, rows: parser(buffer) };
}

export function fetchInspectionReport(url, fetchImpl = globalThis.fetch) {
  return fetchWorkflowReport(url, parseInspectionWorkbook, fetchImpl);
}

export function fetchMainImageInspectionReport(url, fetchImpl = globalThis.fetch) {
  return fetchWorkflowReport(url, parseMainImageInspectionWorkbook, fetchImpl);
}

export function fetchImageDownloadReport(url, fetchImpl = globalThis.fetch) {
  return fetchWorkflowReport(url, parseImageDownloadWorkbook, fetchImpl);
}
