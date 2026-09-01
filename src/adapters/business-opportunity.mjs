import { GatewayError } from "../errors.mjs";
import { APP_IDS, OPERATIONS } from "../operations.mjs";

const TRACE_API = "dsm.grow.ai.opportunity.getTrace";

function operationRequest(name, payload) {
  const operation = OPERATIONS[name];
  return { appId: operation.appId, api: operation.api, payload };
}

function parseData(value) {
  let result = value;
  for (let depth = 0; depth < 2 && typeof result === "string"; depth += 1) {
    if (result === "[DONE]") return null;
    try { result = JSON.parse(result); } catch { break; }
  }
  return result && typeof result === "object" ? result : null;
}

function parseSseBlock(block) {
  const data = block.split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  return data ? parseData(data) : null;
}

async function readTraceResponse(response) {
  if (response.ok === false) {
    throw new GatewayError(`Business opportunity stream returned HTTP ${response.status}`, {
      code: "BUSINESS_OPPORTUNITY_STREAM_ERROR",
      status: 502,
    });
  }
  const records = [];
  let timedOut = false;
  const consume = (text) => {
    for (const block of text.replace(/\r\n/g, "\n").split("\n\n")) {
      const data = parseSseBlock(block);
      if (data) records.push(data);
    }
  };
  if (response.body == null || typeof response.body.getReader !== "function") {
    consume(await response.text());
  } else {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        let separator = buffer.indexOf("\n\n");
        while (separator >= 0) {
          const data = parseSseBlock(buffer.slice(0, separator));
          if (data) records.push(data);
          buffer = buffer.slice(separator + 2);
          separator = buffer.indexOf("\n\n");
        }
      }
      buffer += decoder.decode();
    } catch (error) {
      if (error?.name !== "AbortError" && error?.name !== "TimeoutError") throw error;
      timedOut = true;
    }
    const final = parseSseBlock(buffer);
    if (final) records.push(final);
  }
  const failed = records.find((record) => Number(record.code) !== 200);
  if (failed) {
    throw new GatewayError(failed.msg || failed.message || "Business opportunity stream failed", {
      code: "BUSINESS_OPPORTUNITY_STREAM_ERROR",
      status: 502,
      details: { businessCode: failed.code },
    });
  }
  const thinking = records.filter((record) => (record.record_type || record.recordType) === "think")
    .map((record) => record.content || "").join("");
  const answer = records.filter((record) => (record.record_type || record.recordType || "output") === "output")
    .map((record) => record.content || "").join("");
  return {
    status: timedOut ? "running" : "completed",
    timedOut,
    thinking,
    answer,
    recordCount: records.length,
  };
}

function normalizeQuery(input) {
  const query = String(input.query || "").trim();
  if (!query || query.length > 2000) {
    throw new GatewayError("query 必填且不能超过 2000 字", {
      code: "INVALID_BUSINESS_OPPORTUNITY_INPUT",
      status: 400,
    });
  }
  return query;
}

export class BusinessOpportunityAdapter {
  constructor({ client, transport, streamBaseUrl = "https://ai-sff.jd.com" }) {
    if (!client) throw new Error("client is required");
    this.client = client;
    this.transport = transport;
    this.streamBaseUrl = streamBaseUrl;
  }

  async listQuestions() {
    const result = await this.client.call(operationRequest("business-opportunity.questions", { request: {} }));
    return { questions: Array.isArray(result.data) ? result.data.map(String) : [] };
  }

  async readTrace({ traceId, groupId, timeoutMs = 120_000 } = {}) {
    if (!traceId || !groupId) {
      throw new GatewayError("traceId 和 groupId 必填", {
        code: "INVALID_BUSINESS_OPPORTUNITY_INPUT",
        status: 400,
      });
    }
    if (typeof this.transport?.sendStream !== "function") {
      throw new GatewayError("Current transport does not support streaming", {
        code: "STREAM_TRANSPORT_UNAVAILABLE",
        status: 501,
      });
    }
    const url = new URL("/api", this.streamBaseUrl);
    url.searchParams.set("v", "1.0");
    url.searchParams.set("appId", APP_IDS.businessOpportunity);
    url.searchParams.set("api", TRACE_API);
    const response = await this.transport.sendStream({
      method: "POST",
      url: url.toString(),
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
        "dsm-platform": "pc",
        origin: "https://ncz.jd.com",
      },
      body: JSON.stringify({ traceId, groupId }),
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    return { traceId, groupId, ...await readTraceResponse(response) };
  }

  async ask(input = {}) {
    const query = normalizeQuery(input);
    const session = await this.client.call(operationRequest("business-opportunity.session.create", {
      request: { bizRequest: { query } },
    }));
    const sessionId = String(session.data || "");
    if (!sessionId) throw new GatewayError("Business opportunity session was not created", {
      code: "BUSINESS_OPPORTUNITY_PROTOCOL_ERROR",
      status: 502,
    });
    const submitted = await this.client.call(operationRequest("business-opportunity.chat", {
      groupId: sessionId,
      query,
    }));
    const groupId = String(submitted.data?.groupId || sessionId);
    const traceId = String(submitted.data?.traceId || "");
    if (!traceId) throw new GatewayError("Business opportunity trace was not created", {
      code: "BUSINESS_OPPORTUNITY_PROTOCOL_ERROR",
      status: 502,
    });
    return {
      sessionId,
      query,
      ...await this.readTrace({ traceId, groupId, timeoutMs: input.timeoutMs }),
    };
  }
}
