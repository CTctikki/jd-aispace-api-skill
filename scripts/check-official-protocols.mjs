import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractScriptUrls,
  findProtocolBundle,
  inspectProtocolBundle,
} from "../src/official-protocols.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const baselinePath = path.join(root, "references", "official-write-protocols.json");
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const results = [];

for (const protocol of baseline.protocols) {
  const pageResponse = await fetch(protocol.pageUrl);
  if (!pageResponse.ok) throw new Error(`${protocol.id} page returned HTTP ${pageResponse.status}`);
  const scriptUrls = extractScriptUrls(await pageResponse.text(), protocol.pageUrl);
  const bundleUrl = findProtocolBundle(protocol, scriptUrls);
  if (!bundleUrl) throw new Error(`${protocol.id} bundle could not be resolved uniquely`);
  const bundleResponse = await fetch(bundleUrl);
  if (!bundleResponse.ok) throw new Error(`${protocol.id} bundle returned HTTP ${bundleResponse.status}`);
  results.push(inspectProtocolBundle(protocol, bundleUrl, await bundleResponse.text()));
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  total: results.length,
  unchanged: results.filter((result) => result.status === "unchanged").length,
  results,
}, null, 2));

const write = process.argv.includes("--write");
const hasMismatch = results.some((result) => result.status === "protocol_mismatch");
if (write && hasMismatch) {
  throw new Error("Refusing to update baseline while required protocol markers are missing");
}
if (write) {
  const updated = {
    ...baseline,
    protocols: baseline.protocols.map((protocol) => {
      const result = results.find((entry) => entry.id === protocol.id);
      return { ...protocol, bundleUrl: result.bundleUrl, sha256: result.sha256 };
    }),
  };
  await writeFile(baselinePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
}

if (!write && results.some((result) => result.status !== "unchanged")) process.exitCode = 2;
