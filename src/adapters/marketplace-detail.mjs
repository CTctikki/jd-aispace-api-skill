import { OPERATIONS } from "../operations.mjs";
import { validateServiceCode } from "./service-access.mjs";

function operationRequest(payload) {
  const operation = OPERATIONS["marketplace.detail"];
  return { appId: operation.appId, api: operation.api, payload };
}

function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCode(value) {
  const code = String(value || "").trim();
  return /^[a-z0-9_-]{1,100}$/i.test(code) ? code : null;
}

function normalizeFunctionCode(value) {
  const code = normalizeCode(value);
  return /^fw_tag_\d+$/i.test(code || "") ? code : null;
}

function normalizeCapabilityItem(item = {}) {
  return {
    code: normalizeCode(item.itemCode),
    name: normalizeText(item.itemName),
    description: normalizeText(item.functionVersionIntroduction),
    supported: item.supported === true || Number(item.supported) === 1,
  };
}

function normalizeCapability(capability = {}) {
  const items = Array.isArray(capability.serviceVersionFunctionList)
    ? capability.serviceVersionFunctionList.filter(Boolean).map(normalizeCapabilityItem)
    : [];
  return {
    code: normalizeFunctionCode(capability.functionCode),
    name: normalizeText(capability.functionName),
    description: normalizeText(capability.functionIntroduction),
    active: capability.functionStatus === true || Number(capability.functionStatus) === 1,
    items,
  };
}

function findExtension(data, code) {
  const extensions = Array.isArray(data.fwExtVoList) ? data.fwExtVoList : [];
  return extensions.find((entry) => entry?.extCode === code)?.extValue;
}

export function normalizeMarketplaceDetail(data = {}, serviceCode) {
  const normalized = validateServiceCode(serviceCode);
  const paradigmValue = String(findExtension(data, "market.jm_ai_space_tool_paradigm") || "").toUpperCase();
  const paradigm = ["EXPERT", "FLOW", "INDEPENDENCE"].includes(paradigmValue)
    ? paradigmValue
    : null;
  const capabilities = Array.isArray(data.serviceVersionFunctionBasicConfigs)
    ? data.serviceVersionFunctionBasicConfigs.filter(Boolean).map(normalizeCapability)
    : [];
  return {
    serviceCode: normalized,
    name: normalizeText(data.serviceName),
    description: normalizeText(data.introduce),
    serviceType: Number.isFinite(Number(data.serviceType)) ? Number(data.serviceType) : null,
    paradigm,
    platforms: {
      pc: data.isSupportPC === true || Number(data.isSupportPC) === 1,
      mobile: data.isSupportMobile === true || Number(data.isSupportMobile) === 1,
    },
    chargeMode: Number.isFinite(Number(data.chareMode)) ? Number(data.chareMode) : null,
    capabilities,
    detailUrl: `https://fw.jd.com/market/new/detail/${normalized}`,
  };
}

export class MarketplaceDetailAdapter {
  constructor({ client }) {
    if (!client) throw new Error("client is required");
    this.client = client;
  }

  async inspect(serviceCode) {
    const normalized = validateServiceCode(serviceCode);
    const result = await this.client.call(operationRequest({ request: { serviceCode: normalized } }));
    return normalizeMarketplaceDetail(result.data || {}, normalized);
  }
}
