import assert from "node:assert/strict";
import test from "node:test";
import { BusinessOpportunityAdapter } from "../src/adapters/business-opportunity.mjs";

test("business opportunity asks once and collects streamed answer", async () => {
  const calls = [];
  const client = {
    async call(request) {
      calls.push(request);
      if (request.api.endsWith("createSession")) return { data: "session-1" };
      if (request.api.endsWith("chat")) return { data: { groupId: "group-1", traceId: "trace-1" } };
      throw new Error("unexpected call");
    },
  };
  let streamRequest;
  const transport = {
    async sendStream(request) {
      streamRequest = request;
      return new Response([
        'data: {"code":200,"record_type":"think","content":"分析中"}',
        'data: {"code":200,"record_type":"output","content":"建议结果"}',
        "",
      ].join("\n\n"), { status: 200, headers: { "content-type": "text/event-stream" } });
    },
  };
  const adapter = new BusinessOpportunityAdapter({ client, transport });
  const result = await adapter.ask({ query: "推荐一个家居机会" });
  assert.equal(calls[0].payload.request.bizRequest.query, "推荐一个家居机会");
  assert.deepEqual(calls[1].payload, { groupId: "session-1", query: "推荐一个家居机会" });
  assert.deepEqual(JSON.parse(streamRequest.body), { traceId: "trace-1", groupId: "group-1" });
  assert.equal(result.answer, "建议结果");
  assert.equal(result.thinking, "分析中");
  assert.equal(result.status, "completed");
});

test("business opportunity validates query before creating a session", async () => {
  const adapter = new BusinessOpportunityAdapter({ client: {}, transport: {} });
  await assert.rejects(() => adapter.ask({ query: "" }), { code: "INVALID_BUSINESS_OPPORTUNITY_INPUT" });
  await assert.rejects(() => adapter.ask({ query: "x".repeat(2001) }), { code: "INVALID_BUSINESS_OPPORTUNITY_INPUT" });
});

test("business opportunity exposes recommended questions as read-only data", async () => {
  const client = { async call() { return { data: ["问题一", "问题二"] }; } };
  const adapter = new BusinessOpportunityAdapter({ client, transport: {} });
  assert.deepEqual(await adapter.listQuestions(), { questions: ["问题一", "问题二"] });
});
