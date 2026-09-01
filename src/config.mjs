import path from "node:path";

export function loadConfig(environment = process.env) {
  return {
    host: environment.AISPACE_GATEWAY_HOST || "127.0.0.1",
    port: Number(environment.AISPACE_GATEWAY_PORT || 17321),
    token: environment.AISPACE_GATEWAY_TOKEN || "",
    cookie: environment.AISPACE_COOKIE || "",
    dsmEid: environment.AISPACE_DSM_EID || "",
    bridgeUrl: environment.AISPACE_BRIDGE_URL || "",
    bridgeToken: environment.AISPACE_BRIDGE_TOKEN || "",
    chromeUserDataDir: environment.AISPACE_CHROME_USER_DATA_DIR || "",
    chromeProfileName: environment.AISPACE_CHROME_PROFILE_NAME || "Default",
    python: environment.AISPACE_PYTHON || "python",
    catalogPath: environment.AISPACE_CATALOG_PATH || path.resolve("data", "service-catalog.json"),
    catalogTtlMs: Number(environment.AISPACE_CATALOG_TTL_MS || 15 * 60_000),
    serviceResolveConcurrency: Number(environment.AISPACE_SERVICE_RESOLVE_CONCURRENCY || 1),
    serviceResolveDelayMs: Number(environment.AISPACE_SERVICE_RESOLVE_DELAY_MS || 500),
    serviceResolveRetryDelayMs: Number(environment.AISPACE_SERVICE_RESOLVE_RETRY_DELAY_MS || 1_000),
  };
}
