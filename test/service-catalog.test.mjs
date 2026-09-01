import assert from "node:assert/strict";
import test from "node:test";
import { ServiceCatalog } from "../src/service-catalog.mjs";

class FakeClient {
  constructor() {
    this.calls = [];
  }

  async call(request) {
    this.calls.push(request);
    if (request.api.endsWith("getToolList")) return { data: [] };
    if (request.api.endsWith("getExpertList")) return { data: [] };
    if (request.api.endsWith("queryPublishedAppList")) return { data: [] };
    if (request.api.endsWith("listAiSpacePurchase")) return { data: [] };
    if (request.api.endsWith("queryExpertMapByServiceCodes")) return { data: {} };
    if (request.api.endsWith("queryServiceByCode")) {
      return { data: { serviceCode: request.payload.request.serviceCode, aiSpaceToolParadigm: "FLOW" } };
    }
    return { data: null };
  }
}

test("catalog uses required portal request", async () => {
  const client = new FakeClient();
  const catalog = new ServiceCatalog({ client, now: () => Date.parse("2026-09-01T00:00:00.000Z") });
  const result = await catalog.discover();
  const listCall = client.calls.find((call) => call.api.endsWith("getToolList"));
  assert.deepEqual(listCall.payload, {
    request: {
      belongParam: { client: "WEB" },
      bizRequest: { pageNum: 1, pageSize: 100 },
    },
  });
  assert.equal(client.calls.some((call) => call.api.endsWith("getExpertList")), true);
  assert.equal(client.calls.some((call) => call.api.endsWith("queryPublishedAppList")), true);
  const tool = result.tools.find((entry) => entry.serviceCode === "FW_GOODS-1970202");
  assert.equal(tool.paradigm, "FLOW");
  assert.equal(tool.executionMode, "workflow_stream");
  assert.equal(tool.adapterStatus, "one_click_ready");
  assert.equal(
    result.tools.find((entry) => entry.serviceCode === "FW_GOODS-1970807").adapterStatus,
    "confirmation_validation_required",
  );
  assert.equal(result.summary.withServiceCode, 26);
});

test("catalog maps purchased expert services to callable agent metadata", async () => {
  const client = { async call(request) {
    if (request.api.endsWith("getToolList")) return { data: [] };
    if (request.api.endsWith("getExpertList")) return { data: [] };
    if (request.api.endsWith("queryPublishedAppList")) return { data: [] };
    if (request.api.endsWith("listAiSpacePurchase")) return { data: [{
      serviceCode: "FW_TEST_EXPERT",
      serviceName: "ChatExcel数据分析",
      aiSpaceToolParadigm: "EXPERT",
      publishSource: 1,
    }] };
    if (request.api.endsWith("queryExpertMapByServiceCodes")) {
      assert.deepEqual(request.payload, { request: { serviceCodes: ["FW_TEST_EXPERT"] } });
      return { data: { FW_TEST_EXPERT: {
        agentId: "agent-public-id",
        expertName: "ChatExcel",
        expertAvatar: "https://example.com/avatar.png",
        expertIntroduction: "Spreadsheet assistant",
        account: "private",
      } } };
    }
    if (request.api.endsWith("queryServiceByCode")) return { data: {
      serviceCode: request.payload.request.serviceCode,
      aiSpaceToolParadigm: "EXPERT",
    } };
    throw new Error(`Unexpected API: ${request.api}`);
  } };
  const result = await new ServiceCatalog({ client }).discover();
  const tool = result.tools.find((entry) => entry.serviceCode === "FW_TEST_EXPERT");
  assert.equal(tool.serviceCode, "FW_TEST_EXPERT");
  assert.equal(tool.executionMode, "aispace_conversation");
  assert.deepEqual(tool.agent, {
    agentId: "agent-public-id",
    name: "ChatExcel",
    description: "Spreadsheet assistant",
    avatarUrl: "https://example.com/avatar.png",
  });
  assert.equal(JSON.stringify(tool).includes("private"), false);
  assert.equal(result.source.mappedExpertCount, 1);
});

test("catalog returns fresh memory cache without new calls", async () => {
  const client = new FakeClient();
  let now = Date.parse("2026-09-01T00:00:00.000Z");
  const catalog = new ServiceCatalog({ client, now: () => now });
  await catalog.discover();
  const callCount = client.calls.length;
  now += 1_000;
  const cached = await catalog.discover();
  assert.equal(cached.cache, "hit");
  assert.equal(client.calls.length, callCount);
});

test("catalog retries service resolution after marketplace rate limiting", async () => {
  const attempts = new Map();
  const client = { async call(request) {
    if (request.api.endsWith("getToolList")) return { data: [] };
    if (request.api.endsWith("getExpertList")) return { data: [] };
    if (request.api.endsWith("queryPublishedAppList")) return { data: [] };
    if (request.api.endsWith("listAiSpacePurchase")) return { data: [] };
    if (request.api.endsWith("queryServiceByCode")) {
      const serviceCode = request.payload.request.serviceCode;
      const count = (attempts.get(serviceCode) || 0) + 1;
      attempts.set(serviceCode, count);
      if (serviceCode === "FW_GOODS-1991201" && count === 1) {
        throw Object.assign(new Error("操作频繁，请稍后再试。"), {
          code: "SFF_BUSINESS_ERROR",
          details: { businessCode: "201" },
        });
      }
      return { data: { serviceCode, aiSpaceToolParadigm: "INDEPENDENCE" } };
    }
    return { data: {} };
  } };
  const catalog = new ServiceCatalog({
    client,
    resolveConcurrency: 1,
    resolveRetryDelayMs: 0,
  });
  const result = await catalog.discover();
  assert.equal(attempts.get("FW_GOODS-1991201"), 2);
  assert.equal(
    result.tools.find((tool) => tool.serviceCode === "FW_GOODS-1991201").service.status,
    "resolved",
  );
});
