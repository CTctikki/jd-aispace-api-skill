import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_IDS, OPERATIONS } from "./operations.mjs";
import { TOOL_REGISTRY } from "./tool-registry.mjs";
import { WORKFLOW_TOOLS } from "./adapters/workflow-tools.mjs";

const CATEGORY_NAMES = Object.freeze({
  10001: "店铺运营",
  10002: "商机选品",
  10003: "商品素材",
  10004: "营销推广",
  10005: "订单履约",
  10006: "客户服务",
});

function operationRequest(name, payload) {
  const operation = OPERATIONS[name];
  return { appId: operation.appId, api: operation.api, payload };
}

function normalizePublisher(service, fallback) {
  if (service?.official === true || fallback === "official") return "official";
  if (Number(service?.publishSource) === 1) return "third_party";
  return fallback || "unknown";
}

function executionMode(paradigm) {
  switch (String(paradigm || "").toUpperCase()) {
    case "EXPERT":
      return "aispace_conversation";
    case "FLOW":
      return "tool_backend";
    case "INDEPENDENCE":
      return "independent_application";
    default:
      return "unknown";
  }
}

function summarizeResolvedService(data = {}) {
  const chargeList = Array.isArray(data.chargeList) ? data.chargeList : [];
  return {
    serviceCode: data.serviceCode,
    serviceName: data.serviceName,
    paradigm: data.aiSpaceToolParadigm || null,
    publishSource: data.publishSource ?? null,
    openInAiSpace: data.openInAiSpace ?? null,
    hasJmAiTerminal: data.hasJmAiTerminal ?? null,
    categoryId: data.cid == null ? null : String(data.cid),
    hasFreeVersion: chargeList.some((item) => item?.freeVersion === true),
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export class ServiceCatalog {
  constructor({ client, cachePath = "", cacheTtlMs = 15 * 60_000, now = () => Date.now() }) {
    if (!client) throw new Error("client is required");
    this.client = client;
    this.cachePath = cachePath;
    this.cacheTtlMs = cacheTtlMs;
    this.now = now;
    this.memoryCache = null;
  }

  async call(name, payload) {
    return this.client.call(operationRequest(name, payload));
  }

  isFresh(snapshot) {
    const generatedAt = Date.parse(snapshot?.generatedAt || "");
    return Number.isFinite(generatedAt) && this.now() - generatedAt < this.cacheTtlMs;
  }

  async readCache() {
    if (this.memoryCache) return this.memoryCache;
    if (!this.cachePath) return null;
    try {
      this.memoryCache = JSON.parse(await readFile(this.cachePath, "utf8"));
      return this.memoryCache;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async writeCache(snapshot) {
    this.memoryCache = snapshot;
    if (!this.cachePath) return;
    await mkdir(path.dirname(this.cachePath), { recursive: true });
    const temporaryPath = `${this.cachePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.cachePath);
  }

  async discover({ refresh = false } = {}) {
    const cached = await this.readCache();
    if (!refresh && this.isFresh(cached)) return { ...cached, cache: "hit" };
    const [portalResult, marketResult] = await Promise.all([
      this.call("portal.tools.list", {
        request: {
          belongParam: { client: "WEB" },
          bizRequest: { pageNum: 1, pageSize: 100 },
        },
      }),
      this.call("portal.purchases.list", { request: {} }),
    ]);
    const portalTools = Array.isArray(portalResult.data) ? portalResult.data : [];
    const marketServices = Array.isArray(marketResult.data) ? marketResult.data : [];
    const serviceCodes = [...new Set([
      ...TOOL_REGISTRY.map((tool) => tool.serviceCode),
      ...portalTools.map((tool) => tool.code),
      ...marketServices.map((service) => service.serviceCode),
    ].filter(Boolean))];
    const resolvedResults = await mapWithConcurrency(serviceCodes, 4, async (serviceCode) => {
      try {
        const result = await this.call("service.resolve", { request: { serviceCode } });
        return [serviceCode, { status: "resolved", ...summarizeResolvedService(result.data) }];
      } catch (error) {
        return [serviceCode, { status: "unresolved", errorCode: error.code || "UNKNOWN_ERROR" }];
      }
    });
    const resolvedByCode = new Map(resolvedResults);
    const portalByCode = new Map(portalTools.filter((tool) => tool.code).map((tool) => [tool.code, tool]));
    const serviceByCode = new Map(marketServices.filter((service) => service.serviceCode).map((service) => [service.serviceCode, service]));
    const serviceByName = new Map(marketServices.filter((service) => service.serviceName).map((service) => [service.serviceName, service]));
    const knownCodes = new Set();
    const tools = TOOL_REGISTRY.map((tool) => {
      const service = serviceByCode.get(tool.serviceCode) || serviceByName.get(tool.name) || {};
      const serviceCode = tool.serviceCode || service.serviceCode || null;
      if (serviceCode) knownCodes.add(serviceCode);
      const portalTool = portalByCode.get(serviceCode) || portalTools.find((entry) => entry.name === tool.name) || {};
      const resolved = resolvedByCode.get(serviceCode) || {};
      const paradigm = service.aiSpaceToolParadigm || resolved.paradigm || null;
      const workflowSupported = Boolean(WORKFLOW_TOOLS[serviceCode]);
      return {
        ...tool,
        serviceCode,
        publisher: normalizePublisher(service, tool.publisher),
        paradigm,
        executionMode: workflowSupported ? "workflow_stream" : executionMode(paradigm),
        adapterStatus: workflowSupported
          ? "workflow_inspection_ready"
          : serviceCode
            ? "metadata_resolved"
            : "service_code_missing",
        launch: {
          type: portalTool.type || null,
          url: portalTool.url || null,
          openInAiSpace: service.openInAiSpace ?? resolved.openInAiSpace ?? null,
          hasJmAiTerminal: resolved.hasJmAiTerminal ?? null,
        },
        service: serviceCode ? resolved : null,
      };
    });
    for (const service of marketServices) {
      if (!service.serviceCode || knownCodes.has(service.serviceCode)) continue;
      const resolved = resolvedByCode.get(service.serviceCode) || {};
      const paradigm = service.aiSpaceToolParadigm || resolved.paradigm || null;
      tools.push({
        id: tools.length + 1,
        category: CATEGORY_NAMES[service.aiSpaceFrontCat] || null,
        name: service.serviceName || service.serviceCode,
        publisher: normalizePublisher(service),
        serviceCode: service.serviceCode,
        paradigm,
        executionMode: executionMode(paradigm),
        adapterStatus: "metadata_resolved",
        launch: {
          type: null,
          url: null,
          openInAiSpace: service.openInAiSpace ?? resolved.openInAiSpace ?? null,
          hasJmAiTerminal: resolved.hasJmAiTerminal ?? null,
        },
        service: resolved,
      });
    }
    const modes = [...new Set(tools.map((tool) => tool.executionMode))];
    const snapshot = {
      generatedAt: new Date(this.now()).toISOString(),
      cache: "miss",
      source: {
        appIds: APP_IDS,
        portalToolCount: portalTools.length,
        marketServiceCount: marketServices.length,
        resolvedServiceCount: resolvedResults.filter(([, result]) => result.status === "resolved").length,
      },
      summary: {
        total: tools.length,
        withServiceCode: tools.filter((tool) => tool.serviceCode).length,
        metadataResolved: tools.filter((tool) => tool.service?.status === "resolved").length,
        executionModes: Object.fromEntries(modes.map((mode) => [mode, tools.filter((tool) => tool.executionMode === mode).length])),
      },
      tools,
    };
    await this.writeCache(snapshot);
    return snapshot;
  }
}
