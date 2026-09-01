import assert from "node:assert/strict";
import test from "node:test";
import { ConfirmationRequiredError, InvalidOperationError } from "../src/errors.mjs";
import { AiSpaceGateway } from "../src/gateway.mjs";
import { SffClient } from "../src/sff-client.mjs";
import { summarizeTools, TOOL_REGISTRY } from "../src/tool-registry.mjs";
import { ChromeProfileTransport } from "../src/transports/chrome-profile.mjs";

class FakeTransport {
  constructor(data) {
    this.data = data;
    this.requests = [];
  }

  async send(request) {
    this.requests.push(request);
    return { status: 200, data: this.data };
  }
}

test("registry contains all 26 discovered tools", () => {
  assert.equal(TOOL_REGISTRY.length, 26);
  assert.deepEqual(summarizeTools(), {
    total: 26,
    official: 8,
    thirdParty: 18,
    serviceCodesKnown: 26,
  });
});

test("gateway delegates public marketplace search", async () => {
  const gateway = new AiSpaceGateway({
    client: {},
    marketplaceSearchAdapter: { search: async (input) => ({ ...input, total: 1 }) },
  });
  assert.deepEqual(await gateway.searchMarketplace({ query: "AI会员诊断" }), {
    query: "AI会员诊断",
    total: 1,
  });
});

test("gateway delegates public marketplace detail", async () => {
  const gateway = new AiSpaceGateway({
    client: {},
    marketplaceDetailAdapter: { inspect: async (serviceCode) => ({ serviceCode, capabilities: [] }) },
  });
  assert.deepEqual(await gateway.inspectMarketplaceService("FW_GOODS-1977404"), {
    serviceCode: "FW_GOODS-1977404",
    capabilities: [],
  });
});

test("gateway delegates sanitized service access inspection", async () => {
  const gateway = new AiSpaceGateway({
    client: {},
    serviceAccessAdapter: { inspect: async (serviceCode) => ({ serviceCode, active: false }) },
  });
  assert.deepEqual(await gateway.inspectServiceAccess("FW_GOODS-1961214"), {
    serviceCode: "FW_GOODS-1961214",
    active: false,
  });
});

test("gateway requires confirmation for sanitized service launch", async () => {
  const gateway = new AiSpaceGateway({
    client: {},
    serviceLaunchAdapter: {
      async prepare(serviceCode) {
        return { serviceCode, status: "launch_ready" };
      },
    },
  });
  await assert.rejects(
    () => gateway.prepareServiceLaunch("FW_GOODS-1961214"),
    ConfirmationRequiredError,
  );
  assert.deepEqual(
    await gateway.prepareServiceLaunch("FW_GOODS-1961214", { confirm: true }),
    { serviceCode: "FW_GOODS-1961214", status: "launch_ready" },
  );
});

test("gateway delegates dynamic service discovery", async () => {
  const expected = { summary: { total: 26 } };
  const gateway = new AiSpaceGateway({
    client: {},
    catalog: { discover: async (options) => ({ ...expected, options }) },
  });
  assert.deepEqual(await gateway.discoverServices({ refresh: true }), {
    ...expected,
    options: { refresh: true },
  });
});

test("SFF request uses the real endpoint shape and access context", async () => {
  const transport = new FakeTransport({ code: 200, data: { serviceName: "主图批量下载" } });
  const gateway = new AiSpaceGateway({ client: new SffClient({ transport }) });
  const result = await gateway.resolveService("FW_GOODS-1970202");
  assert.equal(result.data.serviceName, "主图批量下载");
  const request = transport.requests[0];
  const url = new URL(request.url);
  assert.equal(url.hostname, "sff.jd.com");
  assert.equal(url.searchParams.get("appId"), "RHF4TRSNMOTM9W9O3UKH");
  assert.equal(url.searchParams.get("api"), "dsm.fuwu.microApp.MicroAppServiceDsmProvider.queryServiceByCode");
  assert.deepEqual(JSON.parse(request.body), {
    request: { serviceCode: "FW_GOODS-1970202" },
    accessContext: { source: "web" },
  });
});

test("unknown operations are rejected", async () => {
  const gateway = new AiSpaceGateway({ client: {} });
  await assert.rejects(() => gateway.callOperation("unknown.operation"), InvalidOperationError);
});

test("side-effecting operations require explicit confirmation", async () => {
  const gateway = new AiSpaceGateway({ client: {} });
  await assert.rejects(
    () => gateway.callOperation("service.use", { request: {} }),
    ConfirmationRequiredError,
  );
});

test("workflow execution requires explicit confirmation", async () => {
  const gateway = new AiSpaceGateway({
    client: {},
    workflowAdapter: { run: async () => ({ ok: true }) },
  });
  await assert.rejects(
    () => gateway.runWorkflow("FW_GOODS-1969405", {}),
    ConfirmationRequiredError,
  );
  assert.deepEqual(
    await gateway.runWorkflow("FW_GOODS-1969405", {}, { confirm: true }),
    { ok: true },
  );
});

test("typed inspection requires confirmation while result replay is read-only", async () => {
  const workflowAdapter = {
    runProductDetailInspection: async () => ({ status: "completed" }),
    readRun: async (_serviceCode, input) => ({ status: "completed", ...input }),
  };
  const gateway = new AiSpaceGateway({ client: {}, workflowAdapter });
  await assert.rejects(
    () => gateway.runProductDetailInspection({ skuIds: ["123"] }),
    ConfirmationRequiredError,
  );
  assert.deepEqual(
    await gateway.runProductDetailInspection({ skuIds: ["123"] }, { confirm: true }),
    { status: "completed" },
  );
  assert.deepEqual(
    await gateway.readWorkflowRun("FW_GOODS-1968206", { threadId: "t1", runId: "r1" }),
    { status: "completed", threadId: "t1", runId: "r1" },
  );
});

test("write plans are read-only delegations", async () => {
  const gateway = new AiSpaceGateway({
    client: {},
    workflowAdapter: {
      planMainRecommendationLabel: (input) => ({ type: "label", input }),
    },
    hostingAdapter: {
      plan: async (type, input) => ({ type, input }),
    },
    activitySignupAdapter: {
      plan: async (input) => ({ type: "activity", input }),
    },
  });
  assert.deepEqual(gateway.planMainRecommendationLabel({ skuIds: ["123"] }), {
    type: "label",
    input: { skuIds: ["123"] },
  });
  assert.deepEqual(await gateway.planHosting("material", { action: "start" }), {
    type: "material",
    input: { action: "start" },
  });
  assert.deepEqual(await gateway.planActivitySignup({ filePath: "activity.xlsx" }), {
    type: "activity",
    input: { filePath: "activity.xlsx" },
  });
});

test("Chrome profile transport loads cookies once and never exposes them in results", async () => {
  let loads = 0;
  const seenCookies = [];
  const transport = new ChromeProfileTransport({
    userDataDir: "unused-in-test",
    cookieLoader: async () => {
      loads += 1;
      return "secret-cookie=value";
    },
    fetchImpl: async (_url, options) => {
      seenCookies.push(options.headers.get("cookie"));
      return new Response(JSON.stringify({ code: 200, data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const request = { method: "POST", url: "https://sff.jd.com/api", headers: {}, body: "{}" };
  const first = await transport.send(request);
  const second = await transport.send(request);
  assert.equal(loads, 1);
  assert.deepEqual(seenCookies, ["secret-cookie=value", "secret-cookie=value"]);
  assert.deepEqual(first.data, { code: 200, data: { ok: true } });
  assert.deepEqual(second.data, { code: 200, data: { ok: true } });
  assert.equal(JSON.stringify(first).includes("secret-cookie"), false);
});
