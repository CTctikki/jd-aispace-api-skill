import { MarketplaceSearchAdapter } from "../src/adapters/marketplace-search.mjs";
import { SffClient } from "../src/sff-client.mjs";
import { TOOL_REGISTRY } from "../src/tool-registry.mjs";
import { DirectHttpTransport } from "../src/transports/direct-http.mjs";

const delayMs = Math.max(500, Number(process.env.AISPACE_MARKETPLACE_DELAY_MS || 1500));
const adapter = new MarketplaceSearchAdapter({
  client: new SffClient({ transport: new DirectHttpTransport() }),
});

function sleep(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

const checks = [];
const thirdPartyTools = TOOL_REGISTRY.filter((tool) => tool.publisher === "third_party");
for (const [index, tool] of thirdPartyTools.entries()) {
  const result = await adapter.search({ query: tool.name, classify: "tools" });
  const exactCodes = [...new Set(result.exactMatches.map((item) => item.serviceCode))];
  const status = exactCodes.length === 0
    ? "missing"
    : exactCodes.length > 1
      ? "ambiguous"
      : exactCodes[0] === tool.serviceCode
        ? "unchanged"
        : "changed";
  checks.push({ name: tool.name, expectedServiceCode: tool.serviceCode, exactCodes, status });
  if (index < thirdPartyTools.length - 1) await sleep(delayMs);
}

const changes = checks.filter((check) => check.status !== "unchanged");
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  total: checks.length,
  unchanged: checks.length - changes.length,
  changes,
}, null, 2));
if (changes.length > 0) process.exitCode = 2;
