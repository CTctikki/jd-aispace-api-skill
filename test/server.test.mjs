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
