import { createHash } from "node:crypto";

export function extractScriptUrls(html, pageUrl) {
  const urls = [];
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    urls.push(new URL(match[1], pageUrl).href);
  }
  return [...new Set(urls)];
}

export function findProtocolBundle(protocol, scriptUrls) {
  const pattern = new RegExp(protocol.bundlePattern, "i");
  const matches = scriptUrls.filter((url) => pattern.test(new URL(url).pathname));
  return matches.length === 1 ? matches[0] : null;
}

export function inspectProtocolBundle(protocol, bundleUrl, content) {
  const missingMarkers = protocol.requiredMarkers.filter((marker) => !content.includes(marker));
  const sha256 = createHash("sha256").update(content).digest("hex");
  const changed = bundleUrl !== protocol.bundleUrl || sha256 !== protocol.sha256;
  return {
    id: protocol.id,
    status: missingMarkers.length ? "protocol_mismatch" : changed ? "bundle_changed" : "unchanged",
    bundleUrl,
    sha256,
    missingMarkers,
  };
}
