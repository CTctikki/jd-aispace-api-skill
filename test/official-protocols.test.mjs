import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  extractScriptUrls,
  findProtocolBundle,
  inspectProtocolBundle,
} from "../src/official-protocols.mjs";

const protocol = {
  id: "hosting",
  bundlePattern: "/js/app\\.[a-f0-9]+\\.js$",
  bundleUrl: "https://example.com/js/app.abc123.js",
  sha256: "c4f31c5d4b26941b7646952b93e9c00f9e0c0b3b18aa04653b2c2a5f7d1bb371",
  requiredMarkers: ["openManageJob", "clsoeManageJob"],
};

test("official protocol checker resolves protocol bundles", () => {
  const scripts = extractScriptUrls(
    '<script src="//example.com/js/vendor.js"></script><script src="/js/app.abc123.js"></script>',
    "https://example.com/page",
  );
  assert.equal(findProtocolBundle(protocol, scripts), protocol.bundleUrl);
});

test("official protocol checker reports changed and missing contracts", () => {
  const content = "openManageJob clsoeManageJob";
  const changed = inspectProtocolBundle(protocol, protocol.bundleUrl, content);
  assert.equal(changed.status, "bundle_changed");
  assert.deepEqual(changed.missingMarkers, []);
  const unchanged = inspectProtocolBundle({
    ...protocol,
    sha256: createHash("sha256").update(content).digest("hex"),
  }, protocol.bundleUrl, content);
  assert.equal(unchanged.status, "unchanged");
  const missing = inspectProtocolBundle(protocol, protocol.bundleUrl, "openManageJob");
  assert.equal(missing.status, "protocol_mismatch");
  assert.deepEqual(missing.missingMarkers, ["clsoeManageJob"]);
});
