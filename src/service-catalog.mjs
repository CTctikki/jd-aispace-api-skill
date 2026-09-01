import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_IDS, OPERATIONS } from "./operations.mjs";
import {
  ADAPTER_STATUS_BY_SERVICE,
  GATEWAY_ACTIONS_BY_SERVICE,
  summarizeAdapterCapabilities,
  TOOL_REGISTRY,
} from "./tool-registry.mjs";
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

function summarizeAgent(data = {}) {
  if (!data.agentId) return null;
  return {
    agentId: String(data.agentId),
    name: data.expertName || "",
    description: data.expertIntroduction || "",
    avatarUrl: data.expertAvatar || "",
  };
}

function overlayRegistryCapabilities(snapshot) {
  if (!Array.isArray(snapshot?.tools)) return snapshot;
  const tools = snapshot.tools.map((tool) => {
    const adapterStatus = ADAPTER_STATUS_BY_SERVICE[tool.serviceCode];
    const gatewayActions = GATEWAY_ACTIONS_BY_SERVICE[tool.serviceCode];
    if (!adapterStatus && !gatewayActions) return tool;
    return {
      ...tool,
      ...(adapterStatus ? { adapterStatus } : {}),
      gatewayActions: gatewayActions || [],
    };
  });
  return {
    ...snapshot,
    summary: {
      ...(snapshot.summary || {}),
      ...summarizeAdapterCapabilities(tools),
    },
    tools,
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
  constructor({
    client,
    cachePath = "",
    cacheTtlMs = 15 * 60_000,
    now = () => Date.now(),
    resolveConcurrency = 4,
    resolveDelayMs = 0,
    resolveRetryDelayMs = 1_000,
    sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  }) {
    if (!client) throw new Error("client is required");
    this.client = client;
    this.cachePath = cachePath;
    this.cacheTtlMs = cacheTtlMs;
    this.now = now;
    this.resolveConcurrency = Math.max(1, Number(resolveConcurrency) || 1);
    this.resolveDelayMs = Math.max(0, Number(resolveDelayMs) || 0);
    this.resolveRetryDelayMs = Math.max(0, Number(resolveRetryDelayMs) || 0);
    this.sleep = sleep;
    this.memoryCache = null;
  }

  async resolveServiceMetadata(serviceCode) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await this.call("service.resolve", { request: { serviceCode } });
        return [serviceCode, { status: "resolved", ...summarizeResolvedService(result.data) }];
      } catch (error) {
        const rateLimited = String(error?.details?.businessCode || "") === "201"
          || String(error?.details?.bCode || "") === "20008";
        if (!rateLimited || attempt === 2) {
          return [serviceCode, { status: "unresolved", errorCode: error.code || "UNKNOWN_ERROR" }];
        }
        await this.sleep(this.resolveRetryDelayMs * (2 ** attempt));
      }
    }
    return [serviceCode, { status: "unresolved", errorCode: "UNKNOWN_ERROR" }];
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
    if (!refresh && this.isFresh(cached)) {
      return { ...overlayRegistryCapabilities(cached), cache: "hit" };
    }
    const portalRequest = {
      request: {
        belongParam: { client: "WEB" },
        bizRequest: { pageNum: 1, pageSize: 100 },
      },
    };
    const [portalResult, expertResult, marketResult, appResult] = await Promise.all([
      this.call("portal.tools.list", {
        ...portalRequest,
      }),
      this.call("portal.experts.list", portalRequest),
      this.call("portal.purchases.list", { request: {} }),
      this.call("portal.apps.list", { request: {} }),
    ]);
    const portalTools = Array.isArray(portalResult.data) ? portalResult.data : [];
    const portalExperts = Array.isArray(expertResult.data) ? expertResult.data : [];
    const marketServices = Array.isArray(marketResult.data) ? marketResult.data : [];
    const publishedApps = Array.isArray(appResult.data) ? appResult.data : [];
    const serviceCodes = [...new Set([
      ...TOOL_REGISTRY.map((tool) => tool.serviceCode),
      ...portalTools.map((tool) => tool.code),
      ...marketServices.map((service) => service.serviceCode),
    ].filter(Boolean))];
    const resolvedResults = await mapWithConcurrency(serviceCodes, this.resolveConcurrency, async (serviceCode) => {
      const result = await this.resolveServiceMetadata(serviceCode);
      if (this.resolveDelayMs > 0) await this.sleep(this.resolveDelayMs);
      return result;
    });
    const resolvedByCode = new Map(resolvedResults);
    const expertServiceCodes = marketServices
      .filter((service) => String(service.aiSpaceToolParadigm || "").toUpperCase() === "EXPERT")
      .map((service) => service.serviceCode)
      .filter(Boolean);
    let expertMap = {};
    if (expertServiceCodes.length > 0) {
      try {
        const result = await this.call("portal.experts.map", {
          request: { serviceCodes: expertServiceCodes },
        });
        if (result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
          expertMap = result.data;
        }
      } catch {}
    }
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
        adapterStatus: ADAPTER_STATUS_BY_SERVICE[serviceCode] || (workflowSupported
          ? "workflow_inspection_ready"
          : serviceCode
            ? "metadata_resolved"
            : "service_code_missing"),
        launch: {
          type: portalTool.type || null,
          url: portalTool.url || null,
          openInAiSpace: service.openInAiSpace ?? resolved.openInAiSpace ?? null,
          hasJmAiTerminal: resolved.hasJmAiTerminal ?? null,
        },
        service: serviceCode ? resolved : null,
        agent: summarizeAgent(expertMap[serviceCode]),
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
        gatewayActions: [],
        launch: {
          type: null,
          url: null,
          openInAiSpace: service.openInAiSpace ?? resolved.openInAiSpace ?? null,
          hasJmAiTerminal: resolved.hasJmAiTerminal ?? null,
        },
        service: resolved,
        agent: summarizeAgent(expertMap[service.serviceCode]),
      });
    }
    const modes = [...new Set(tools.map((tool) => tool.executionMode))];
    const snapshot = {
      generatedAt: new Date(this.now()).toISOString(),
      cache: "miss",
      source: {
        appIds: APP_IDS,
        portalToolCount: portalTools.length,
        portalExpertCount: portalExperts.length,
        marketServiceCount: marketServices.length,
        publishedAppCount: publishedApps.length,
        mappedExpertCount: Object.values(expertMap).filter((entry) => entry?.agentId).length,
        resolvedServiceCount: resolvedResults.filter(([, result]) => result.status === "resolved").length,
      },
      summary: {
        total: tools.length,
        withServiceCode: tools.filter((tool) => tool.serviceCode).length,
        metadataResolved: tools.filter((tool) => tool.service?.status === "resolved").length,
        executionModes: Object.fromEntries(modes.map((mode) => [mode, tools.filter((tool) => tool.executionMode === mode).length])),
        ...summarizeAdapterCapabilities(tools),
      },
      tools,
    };
    await this.writeCache(snapshot);
    return snapshot;
  }
}
