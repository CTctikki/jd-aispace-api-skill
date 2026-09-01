import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const baselinePath = path.join(root, "references", "tool-baseline.json");
const baseUrl = (process.env.AISPACE_GATEWAY_URL || "http://127.0.0.1:17321").replace(/\/$/, "");
const headers = process.env.AISPACE_GATEWAY_TOKEN
  ? { authorization: `Bearer ${process.env.AISPACE_GATEWAY_TOKEN}` }
  : {};

function normalize(tool) {
  return {
    name: tool.name,
    category: tool.category ?? null,
    publisher: tool.publisher ?? "unknown",
    serviceCode: tool.serviceCode ?? null,
    paradigm: tool.paradigm ?? null,
    executionMode: tool.executionMode ?? "unknown",
    adapterStatus: tool.adapterStatus ?? "unknown",
  };
}

function key(tool) {
  return tool.serviceCode || `${tool.category || "unknown"}:${tool.name}`;
}

const response = await fetch(`${baseUrl}/v1/services?refresh=true`, { headers });
if (!response.ok) throw new Error(`Gateway returned HTTP ${response.status}`);
const payload = await response.json();
const current = (payload.tools || []).map(normalize).sort((left, right) => key(left).localeCompare(key(right)));
let baseline = [];
try {
  baseline = JSON.parse(await readFile(baselinePath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const previous = new Map(baseline.map((tool) => [key(tool), tool]));
const next = new Map(current.map((tool) => [key(tool), tool]));
const added = current.filter((tool) => !previous.has(key(tool)));
const removed = baseline.filter((tool) => !next.has(key(tool)));
const changed = current.filter((tool) => {
  const old = previous.get(key(tool));
  return old && JSON.stringify(old) !== JSON.stringify(tool);
}).map((tool) => ({ before: previous.get(key(tool)), after: tool }));
const result = { checkedAt: new Date().toISOString(), total: current.length, added, removed, changed };
console.log(JSON.stringify(result, null, 2));
if (process.argv.includes("--write")) {
  await writeFile(baselinePath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  console.error(`Updated ${baselinePath}`);
} else if (added.length || removed.length || changed.length) {
  process.exitCode = 2;
}
