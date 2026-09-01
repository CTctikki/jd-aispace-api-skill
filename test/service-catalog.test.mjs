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
    if (request.api.endsWith("listAiSpacePurchase")) return { data: [] };
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
  const tool = result.tools.find((entry) => entry.serviceCode === "FW_GOODS-1970202");
  assert.equal(tool.paradigm, "FLOW");
  assert.equal(tool.executionMode, "workflow_stream");
  assert.equal(tool.adapterStatus, "one_click_ready");
  assert.equal(
    result.tools.find((entry) => entry.serviceCode === "FW_GOODS-1970807").adapterStatus,
    "confirmation_validation_required",
  );
  assert.equal(result.summary.withServiceCode, 8);
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
