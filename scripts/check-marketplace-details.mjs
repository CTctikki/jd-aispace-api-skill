import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MarketplaceDetailAdapter } from "../src/adapters/marketplace-detail.mjs";
import { SffClient } from "../src/sff-client.mjs";
import { TOOL_REGISTRY } from "../src/tool-registry.mjs";
import { DirectHttpTransport } from "../src/transports/direct-http.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const baselinePath = path.join(root, "references", "third-party-capabilities.json");
const delayMs = Math.max(500, Number(process.env.AISPACE_MARKETPLACE_DELAY_MS || 800));
const adapter = new MarketplaceDetailAdapter({
  client: new SffClient({ transport: new DirectHttpTransport() }),
});

function sleep(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

function key(detail) {
  return detail.serviceCode;
}

const current = [];
const tools = TOOL_REGISTRY.filter((tool) => tool.publisher === "third_party");
for (const [index, tool] of tools.entries()) {
  current.push(await adapter.inspect(tool.serviceCode));
  if (index < tools.length - 1) await sleep(delayMs);
}
current.sort((left, right) => key(left).localeCompare(key(right)));

let baseline = [];
try {
  baseline = JSON.parse(await readFile(baselinePath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const previous = new Map(baseline.map((detail) => [key(detail), detail]));
const next = new Map(current.map((detail) => [key(detail), detail]));
const added = current.filter((detail) => !previous.has(key(detail)));
const removed = baseline.filter((detail) => !next.has(key(detail)));
const changed = current.filter((detail) => {
  const old = previous.get(key(detail));
  return old && JSON.stringify(old) !== JSON.stringify(detail);
}).map((detail) => ({ before: previous.get(key(detail)), after: detail }));

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  total: current.length,
  unchanged: current.length - added.length - changed.length,
  added: added.map((detail) => detail.serviceCode),
  removed: removed.map((detail) => detail.serviceCode),
  changed: changed.map((entry) => entry.after.serviceCode),
}, null, 2));

if (process.argv.includes("--write")) {
  await writeFile(baselinePath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
} else if (added.length || removed.length || changed.length) {
  process.exitCode = 2;
}
