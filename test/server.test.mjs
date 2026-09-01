import assert from "node:assert/strict";
import test from "node:test";
import { AiSpaceGateway } from "../src/gateway.mjs";
import { createServer } from "../src/server.mjs";

async function withServer(callback, gateway = new AiSpaceGateway({ client: {} })) {
  const server = createServer({ gateway, token: "test-token" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("health endpoint is local and token protected", async () => {
  await withServer(async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/health`);
    assert.equal(denied.status, 401);
    const allowed = await fetch(`${baseUrl}/health`, {
      headers: { authorization: "Bearer test-token" },
    });
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).ok, true);
  });
});

test("tool registry is exposed without contacting JD", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/tools`, {
      headers: { authorization: "Bearer test-token" },
    });
    const body = await response.json();
    assert.equal(body.summary.total, 26);
    assert.equal(body.tools.length, 26);
  });
});

test("typed workflow endpoint forwards input only with confirmation", async () => {
  let received;
  const gateway = new AiSpaceGateway({
    client: {},
    workflowAdapter: {
      async runProductDetailInspection(input) {
        received = input;
        return { status: "completed" };
      },
    },
  });
  await withServer(async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/workflows/product-detail-inspection`, {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ input: { skuIds: ["123"] } }),
    });
    assert.equal(denied.status, 409);
    const allowed = await fetch(`${baseUrl}/v1/workflows/product-detail-inspection`, {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ confirm: true, input: { skuIds: ["123"], inspectText: "test" } }),
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(received, { skuIds: ["123"], inspectText: "test" });
  }, gateway);
});

test("typed product workflow endpoints require confirmation", async () => {
  const received = [];
  const workflowAdapter = {
    async runMainImageInspection(input) { received.push(["main-image", input]); return { status: "completed" }; },
    async runImageDownload(input) { received.push(["image-download", input]); return { status: "completed" }; },
  };
  const gateway = new AiSpaceGateway({ client: {}, workflowAdapter });
  await withServer(async (baseUrl) => {
    const endpoints = [
      ["main-image-inspection", { skuIds: ["123"], inspectElements: ["京喜自营"] }],
      ["image-download", { skuIds: ["123"], squareImageIndexes: [1] }],
    ];
    for (const [endpoint, input] of endpoints) {
      const denied = await fetch(`${baseUrl}/v1/workflows/${endpoint}`, {
        method: "POST",
        headers: { authorization: "Bearer test-token", "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });
      assert.equal(denied.status, 409);
      const allowed = await fetch(`${baseUrl}/v1/workflows/${endpoint}`, {
        method: "POST",
        headers: { authorization: "Bearer test-token", "content-type": "application/json" },
        body: JSON.stringify({ confirm: true, input }),
      });
      assert.equal(allowed.status, 200);
    }
  }, gateway);
  assert.deepEqual(received.map(([name]) => name), ["main-image", "image-download"]);
});

test("workflow result endpoint is read-only", async () => {
  let received;
  const gateway = new AiSpaceGateway({
    client: {},
    workflowAdapter: {
      async readRun(serviceCode, input) {
        received = { serviceCode, input };
        return { status: "completed", inspectionRows: [] };
      },
    },
  });
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/workflows/result`, {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({
        serviceCode: "FW_GOODS-1968206",
        input: { threadId: "t1", runId: "r1" },
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, {
      serviceCode: "FW_GOODS-1968206",
      input: { threadId: "t1", runId: "r1" },
    });
  }, gateway);
});

test("business opportunity endpoints separate reads from confirmed execution", async () => {
  const received = [];
  const gateway = new AiSpaceGateway({
    client: {},
    businessOpportunityAdapter: {
      async listQuestions() { return { questions: ["问题"] }; },
      async ask(input) { received.push(input); return { status: "completed", answer: "结果" }; },
      async readTrace(input) { return { status: "completed", traceId: input.traceId }; },
    },
  });
  await withServer(async (baseUrl) => {
    const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
    const questions = await fetch(`${baseUrl}/v1/business-opportunity/questions`, { headers });
    assert.equal(questions.status, 200);
    const denied = await fetch(`${baseUrl}/v1/business-opportunity/ask`, {
      method: "POST", headers, body: JSON.stringify({ input: { query: "问题" } }),
    });
    assert.equal(denied.status, 409);
    const allowed = await fetch(`${baseUrl}/v1/business-opportunity/ask`, {
      method: "POST", headers, body: JSON.stringify({ confirm: true, input: { query: "问题" } }),
    });
    assert.equal(allowed.status, 200);
    const replay = await fetch(`${baseUrl}/v1/business-opportunity/result`, {
      method: "POST", headers, body: JSON.stringify({ input: { traceId: "t", groupId: "g" } }),
    });
    assert.equal(replay.status, 200);
  }, gateway);
  assert.deepEqual(received, [{ query: "问题" }]);
});

test("hosting and activity schema endpoints are read-only", async () => {
  const gateway = new AiSpaceGateway({
    client: {},
    hostingAdapter: { async inspect(type) { return { type }; } },
    activitySignupAdapter: { async inspect() { return { appName: "批量预约活动报名" }; } },
  });
  await withServer(async (baseUrl) => {
    const headers = { authorization: "Bearer test-token" };
    const material = await fetch(`${baseUrl}/v1/hosting/material`, { headers });
    assert.equal(material.status, 200);
    assert.equal((await material.json()).type, "material");
    const comment = await fetch(`${baseUrl}/v1/hosting/comment-reply`, { headers });
    assert.equal(comment.status, 200);
    assert.equal((await comment.json()).type, "comment-reply");
    const activity = await fetch(`${baseUrl}/v1/activity-signup/schema`, { headers });
    assert.equal(activity.status, 200);
    assert.equal((await activity.json()).appName, "批量预约活动报名");
  }, gateway);
});
