import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowToolAdapter } from "../src/adapters/workflow-tools.mjs";

test("workflow adapter resolves deployment without exposing identity", async () => {
  const client = {
    async call(request) {
      if (request.api.endsWith("getAccessContext")) {
        return { data: { userId: "private", accountType: 2002, locale: "zh-CN" } };
      }
      if (request.api.endsWith("getSpecialist")) {
        return { data: { name: "Inspector", status: 1, currentUserPermission: "READ" } };
      }
      return { data: { workflowId: "workflow-1", workflowVersion: "v1", deploymentId: "1" } };
    },
  };
  const adapter = new WorkflowToolAdapter({ client });
  const result = await adapter.inspect("FW_GOODS-1969405");
  assert.equal(result.bizCode, "CODE402");
  assert.equal(result.ready, true);
  assert.equal(result.access.authenticated, true);
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("workflow adapter rejects unsupported services", async () => {
  const adapter = new WorkflowToolAdapter({ client: {} });
  await assert.rejects(() => adapter.inspect("unknown"), { code: "WORKFLOW_NOT_SUPPORTED" });
});

test("workflow run sends the discovered deployment to the stream endpoint", async () => {
  const client = {
    async call(request) {
      if (request.api.endsWith("getAccessContext")) return { data: { userId: "u1" } };
      if (request.api.endsWith("getSpecialist")) return { data: { name: "Inspector" } };
      return { data: { workflowId: "workflow-1", workflowVersion: "v1" } };
    },
  };
  let streamRequest;
  const transport = {
    async sendStream(request) {
      streamRequest = request;
      return new Response('data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1"}\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    },
  };
  const result = await new WorkflowToolAdapter({ client, transport }).run("FW_GOODS-1969405");
  const body = JSON.parse(streamRequest.body);
  assert.equal(body.bizCode, "CODE402");
  assert.equal(body.workflowId, "workflow-1");
  assert.equal(result.threadId, "t1");
  assert.equal(result.runId, "r1");
});

test("product detail inspection starts and resumes with fields at feedback root", async () => {
  const client = {
    async call(request) {
      if (request.api.endsWith("getAccessContext")) return { data: { userId: "u1" } };
      if (request.api.endsWith("getSpecialist")) return { data: { name: "Inspector" } };
      return { data: { workflowId: "workflow-1", workflowVersion: "v1" } };
    },
  };
  const requests = [];
  const responses = [
    [
      'data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1"}',
      'data: {"type":"TOOL_CALL_START","toolCallId":"card-1","toolCallName":"material_card"}',
      'data: {"type":"TOOL_CALL_ARGS","toolCallId":"card-1","delta":"{\\"cardId\\":\\"405\\"}"}',
      'data: {"type":"RUN_INTERRUPTED"}',
      "",
    ].join("\n\n"),
    [
      'data: {"type":"TOOL_CALL_START","toolCallId":"result-1","toolCallName":"PRODUCT_INSPECTION-result"}',
      'data: {"type":"TOOL_CALL_ARGS","toolCallId":"result-1","delta":"{\\"rows\\":[]}"}',
      'data: {"type":"RUN_FINISHED"}',
      "",
    ].join("\n\n"),
  ];
  const transport = {
    async sendStream(request) {
      requests.push(JSON.parse(request.body));
      return new Response(responses.shift(), { status: 200 });
    },
  };
  const result = await new WorkflowToolAdapter({ client, transport }).runProductDetailInspection({
    skuIds: ["123"],
    inspectText: "7天无理由退货",
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].resume, true);
  assert.equal(requests[1].threadId, "t1");
  assert.equal(requests[1].feedback.inspectElement, "7天无理由退货");
  assert.equal(requests[1].feedback.skuList, "123");
  assert.equal(requests[1].feedback.content, undefined);
  assert.equal(result.status, "completed");
  assert.deepEqual(result.resultCards[0].content, { rows: [] });
});

test("typed product workflows submit their verified material cards", async (context) => {
  const cases = [
    {
      method: "runMainImageInspection",
      cardId: "402",
      input: { skuIds: ["123"], inspectElements: ["京喜自营"], imageNumbers: [1] },
      verify(feedback) {
        assert.deepEqual(feedback.inspectElement, ["京喜自营"]);
        assert.deepEqual(feedback.imageNum, ["1"]);
      },
    },
    {
      method: "runImageDownload",
      cardId: "403",
      input: { skuIds: ["123"], squareImageIndexes: [1] },
      verify(feedback) {
        assert.deepEqual(feedback.imageIndex, { squareIndexList: [1], rectangleIndexList: [] });
      },
    },
  ];
  for (const current of cases) await context.test(current.method, async () => {
    const client = {
      async call(request) {
        if (request.api.endsWith("getAccessContext")) return { data: { userId: "u1" } };
        if (request.api.endsWith("getSpecialist")) return { data: { name: "Tool" } };
        return { data: { workflowId: "workflow-1", workflowVersion: "v1" } };
      },
    };
    const requests = [];
    const responses = [
      [
        'data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1"}',
        'data: {"type":"TOOL_CALL_START","toolCallId":"card-1","toolCallName":"material_card"}',
        `data: {"type":"TOOL_CALL_ARGS","toolCallId":"card-1","delta":"{\\"cardId\\":\\"${current.cardId}\\"}"}`,
        'data: {"type":"RUN_INTERRUPTED"}',
        "",
      ].join("\n\n"),
      'data: {"type":"RUN_FINISHED"}\n\n',
    ];
    const transport = { async sendStream(request) {
      requests.push(JSON.parse(request.body));
      return new Response(responses.shift(), { status: 200 });
    } };
    const adapter = new WorkflowToolAdapter({ client, transport });
    const result = await adapter[current.method](current.input);
    assert.equal(result.status, "completed");
    assert.equal(requests[1].resume, true);
    current.verify(requests[1].feedback);
  });
});

test("typed workflow stops when the input card protocol changes", async () => {
  const client = {
    async call(request) {
      if (request.api.endsWith("getAccessContext")) return { data: { userId: "u1" } };
      if (request.api.endsWith("getSpecialist")) return { data: { name: "Tool" } };
      return { data: { workflowId: "workflow-1", workflowVersion: "v1" } };
    },
  };
  const transport = { async sendStream() {
    return new Response([
      'data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1"}',
      'data: {"type":"TOOL_CALL_START","toolCallId":"card-1","toolCallName":"material_card"}',
      'data: {"type":"TOOL_CALL_ARGS","toolCallId":"card-1","delta":"{\\"cardId\\":\\"changed\\"}"}',
      'data: {"type":"RUN_INTERRUPTED"}',
      "",
    ].join("\n\n"), { status: 200 });
  } };
  const adapter = new WorkflowToolAdapter({ client, transport });
  await assert.rejects(() => adapter.runImageDownload({ skuIds: ["123"], squareImageIndexes: [1] }), {
    code: "WORKFLOW_PROTOCOL_ERROR",
  });
});
