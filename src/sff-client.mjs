import { AuthRequiredError, BusinessError } from "./errors.mjs";

const DEFAULT_HEADERS = Object.freeze({
  "content-type": "application/json;charset=UTF-8",
  "x-requested-with": "XMLHttpRequest",
  "dsm-platform": "pc",
  "dsm-file-path": "lineation-price",
});

export class SffClient {
  constructor({ transport, baseUrl = "https://sff.jd.com", version = "1.0" }) {
    if (!transport) throw new Error("transport is required");
    this.transport = transport;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.version = version;
  }

  buildRequest({ appId, api, payload = {}, headers = {} }) {
    const url = new URL("/api", this.baseUrl);
    url.searchParams.set("v", this.version);
    url.searchParams.set("appId", appId);
    url.searchParams.set("api", api);
    const body = {
      ...payload,
      accessContext: { source: "web", ...(payload.accessContext || {}) },
    };
    return {
      method: "POST",
      url: url.toString(),
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(body),
    };
  }

  async call(input) {
    const response = await this.transport.send(this.buildRequest(input));
    const result = response.data || {};
    const code = String(result.code ?? response.status);
    if (code === "1001" || code === "601") {
      throw new AuthRequiredError(result.msg, {
        redirectUrl: result.redirectUrl,
        traceId: result["dsm-trace-id"],
      });
    }
    if (code !== "200") {
      throw new BusinessError(result.msg, {
        businessCode: code,
        details: {
          bCode: result.bCode,
          traceId: result["dsm-trace-id"],
          httpStatus: response.status,
        },
      });
    }
    return { data: result.data, traceId: result["dsm-trace-id"], raw: result };
  }
}
