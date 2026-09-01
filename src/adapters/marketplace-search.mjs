import { GatewayError } from "../errors.mjs";
import { OPERATIONS } from "../operations.mjs";

const CLASSIFY = Object.freeze({ tools: "1", services: "2", 1: "1", 2: "2" });

function operationRequest(payload) {
  const operation = OPERATIONS["marketplace.search"];
  return { appId: operation.appId, api: operation.api, payload };
}

function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function boundedInteger(value, fallback, minimum, maximum, name) {
  const parsed = value == null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new GatewayError(`${name} must be an integer from ${minimum} to ${maximum}`, {
      code: "INVALID_MARKETPLACE_SEARCH",
      status: 400,
    });
  }
  return parsed;
}

export function normalizeMarketplaceItem(item = {}, query = "") {
  const name = normalizeText(item.serviceName);
  const serviceCode = /^FW_GOODS-\d+$/.test(String(item.serviceCode || ""))
    ? String(item.serviceCode)
    : null;
  return {
    serviceCode,
    name,
    exactMatch: name === normalizeText(query),
    publisher: Number(item.publishSource) === 1 ? "third_party" : "unknown",
    serviceType: item.serviceType ?? null,
    hasFreeTrial: item.hasFreeTryUse === true || item.hasFreeTryUse === 1,
    supportsPc: item.isSupportPC === true || item.isSupportPC === 1,
    supportsMobile: item.isSupportMobile === true || item.isSupportMobile === 1,
    detailUrl: serviceCode ? `https://fw.jd.com/market/new/detail/${serviceCode}` : null,
  };
}

export class MarketplaceSearchAdapter {
  constructor({ client }) {
    if (!client) throw new Error("client is required");
    this.client = client;
  }

  async search(input = {}) {
    const query = normalizeText(input.query);
    if (!query || query.length > 100) {
      throw new GatewayError("query must contain 1 to 100 characters", {
        code: "INVALID_MARKETPLACE_SEARCH",
        status: 400,
      });
    }
    const classify = CLASSIFY[input.classify || "tools"];
    if (!classify) {
      throw new GatewayError("classify must be tools or services", {
        code: "INVALID_MARKETPLACE_SEARCH",
        status: 400,
      });
    }
    const page = boundedInteger(input.page, 1, 1, 100, "page");
    const pageSize = boundedInteger(input.pageSize, 24, 1, 24, "pageSize");
    const result = await this.client.call(operationRequest({
      request: { key: query, searchClassify: classify, page, pageSize },
    }));
    const data = result.data || {};
    const services = Array.isArray(data.serSearchVoList)
      ? data.serSearchVoList.map((item) => normalizeMarketplaceItem(item, query))
      : [];
    return {
      query,
      classify: classify === "1" ? "tools" : "services",
      page: Number(data.page) || page,
      pageSize: Number(data.pageSize) || pageSize,
      total: Number(data.totalItemNum ?? data.totalItem) || 0,
      exactMatches: services.filter((item) => item.exactMatch && item.serviceCode),
      services,
    };
  }
}
