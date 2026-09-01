import { GatewayError } from "../errors.mjs";

export const PRODUCT_DETAIL_INSPECTION_SERVICE = "FW_GOODS-1968206";

export const PRODUCT_DETAIL_TERMINALS = Object.freeze(["APP", "PC"]);
export const PRODUCT_DETAIL_LOCATIONS = Object.freeze([
  "BeltImage",
  "Title",
  "ActivityTag",
  "ServiceTag",
  "SellingPoint",
  "ProductParam",
]);

const PC_DISABLED_LOCATIONS = new Set(["SellingPoint", "ProductParam"]);
const DEFAULT_LOCATIONS = Object.freeze(["BeltImage", "Title", "ActivityTag", "ServiceTag"]);

function invalidInput(message, details) {
  throw new GatewayError(message, { code: "INVALID_WORKFLOW_INPUT", status: 400, details });
}

function normalizeSelection(value, defaults, allowed, fieldName) {
  const source = value == null ? defaults : value;
  if (!Array.isArray(source) || source.length === 0) invalidInput(`${fieldName} 至少选择一项`);
  const values = [...new Set(source.map((item) => String(item).trim()).filter(Boolean))];
  const invalid = values.filter((item) => !allowed.includes(item));
  if (invalid.length) invalidInput(`${fieldName} 包含不支持的值`, { invalid, allowed });
  return values;
}

export function normalizeSkuIds(input, maxCount = 5000) {
  const source = Array.isArray(input.skuIds) ? input.skuIds.join("\n") : input.skuList;
  if (source == null) invalidInput("skuIds 或 skuList 必填");
  const skuIds = String(source).split(/[\s,，;；]+/u).map((item) => item.trim()).filter(Boolean);
  if (skuIds.length === 0) invalidInput("至少提供一个 SKU ID");
  if (skuIds.length > maxCount) invalidInput(`SKU ID 不能超过 ${maxCount} 个`, { count: skuIds.length, maxCount });
  const invalid = skuIds.filter((skuId) => !/^\d+$/.test(skuId));
  if (invalid.length) invalidInput("SKU ID 只能包含数字", { invalid: invalid.slice(0, 10) });
  return [...new Set(skuIds)];
}

export function buildProductDetailInspectionFeedback(input = {}) {
  const inspectText = String(input.inspectText ?? input.inspectElement ?? "").trim();
  if (!inspectText) invalidInput("inspectText 必填");
  const terminalTypes = normalizeSelection(input.terminalTypes ?? input.terminalType, ["APP"], PRODUCT_DETAIL_TERMINALS, "terminalTypes");
  const locations = normalizeSelection(input.locations ?? input.inspectLocationDesc, DEFAULT_LOCATIONS, PRODUCT_DETAIL_LOCATIONS, "locations");
  if (!terminalTypes.includes("APP")) {
    const invalid = locations.filter((location) => PC_DISABLED_LOCATIONS.has(location));
    if (invalid.length) invalidInput("PC 端暂不支持部分巡检位置", { invalid });
  }
  const skuIds = normalizeSkuIds(input);
  const skuList = skuIds.join("\n");
  return {
    terminalType: terminalTypes,
    inspectElement: inspectText,
    inspectLocationDesc: locations,
    description: { text: skuList, file: [] },
    skuList,
    inspectsScopeType: ["3"],
  };
}

const SENSITIVE_KEYS = new Set([
  "accessContext",
  "authorization",
  "cookie",
  "creator",
  "erp",
  "modifier",
  "pin",
  "token",
  "userId",
  "userUniqueName",
]);

function parseJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {}
  const values = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{" || character === "[") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" || character === "]") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try { values.push(JSON.parse(value.slice(start, index + 1))); } catch { return value; }
        start = -1;
      }
    }
  }
  if (values.length === 0) return value;
  if (values.every((item) => item && !Array.isArray(item) && typeof item === "object")) {
    return Object.assign({}, ...values);
  }
  return values.length === 1 ? values[0] : values;
}

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_KEYS.has(key))
    .map(([key, item]) => [key, sanitizeValue(item)]));
}

function collectUrls(value, output = new Set()) {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value) || value.startsWith("//")) output.add(value);
    else {
      const parsed = parseJson(value);
      if (parsed !== value) collectUrls(parsed, output);
    }
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, output);
    return output;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectUrls(item, output);
  }
  return output;
}

export function normalizeWorkflowEvents(events = []) {
  const toolCalls = new Map();
  let status = "running";
  let error = null;
  for (const event of events) {
    const data = event?.data ?? event;
    if (!data || typeof data !== "object") continue;
    if (data.type === "RUN_FINISHED") status = "completed";
    if (data.type === "RUN_INTERRUPTED") status = "waiting_input";
    if (data.type === "RUN_ERROR") {
      status = "failed";
      error = data.message || "Workflow failed";
    }
    if (!data.toolCallId) continue;
    const current = toolCalls.get(data.toolCallId) || { id: data.toolCallId, name: data.toolCallName || null, argumentsText: "", result: null };
    if (data.toolCallName) current.name = data.toolCallName;
    if (data.type === "TOOL_CALL_ARGS" && typeof data.delta === "string") current.argumentsText += data.delta;
    if (data.type === "TOOL_CALL_RESULT") current.result = parseJson(data.content ?? data.toolCallResult ?? data.result ?? null);
    toolCalls.set(data.toolCallId, current);
  }
  const calls = [...toolCalls.values()].map((call) => ({
    id: call.id,
    name: call.name,
    arguments: sanitizeValue(parseJson(call.argumentsText)),
    result: sanitizeValue(call.result),
  }));
  const resultCards = calls.filter((call) => (
    call.name?.endsWith("-result") || call.arguments?.output != null
  )).map((call) => ({
    ...call,
    content: call.result ?? call.arguments?.output ?? call.arguments,
  }));
  const files = [...new Set(resultCards.flatMap((call) => [...collectUrls(call.content)]))];
  const summaries = resultCards.flatMap((call) => (
    Array.isArray(call.content?.data) ? call.content.data : []
  ));
  return { status, error, toolCalls: calls, resultCards, summaries, files };
}
