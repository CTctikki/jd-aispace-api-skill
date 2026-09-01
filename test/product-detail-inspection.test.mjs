import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductDetailInspectionFeedback,
  normalizeWorkflowEvents,
} from "../src/adapters/product-detail-inspection.mjs";

test("product detail inspection input becomes the verified material-card fields", () => {
  const result = buildProductDetailInspectionFeedback({
    skuIds: [" 123 ", "456", "123"],
    inspectText: " 7天无理由退货 ",
    terminalTypes: ["APP"],
    locations: ["Title", "SellingPoint"],
  });
  assert.deepEqual(result, {
    terminalType: ["APP"],
    inspectElement: "7天无理由退货",
    inspectLocationDesc: ["Title", "SellingPoint"],
    description: { text: "123\n456", file: [] },
    skuList: "123\n456",
    inspectsScopeType: ["3"],
  });
});

test("product detail inspection rejects invalid fields", () => {
  assert.throws(
    () => buildProductDetailInspectionFeedback({ skuIds: ["abc"], inspectText: "test" }),
    { code: "INVALID_WORKFLOW_INPUT" },
  );
  assert.throws(
    () => buildProductDetailInspectionFeedback({
      skuIds: ["123"],
      inspectText: "test",
      terminalTypes: ["PC"],
      locations: ["SellingPoint"],
    }),
    { code: "INVALID_WORKFLOW_INPUT" },
  );
});

test("workflow events normalize result cards and download urls", () => {
  const events = [
    { data: { type: "TOOL_CALL_START", toolCallId: "result-1", toolCallName: "PRODUCT_INSPECTION-result" } },
    { data: { type: "TOOL_CALL_ARGS", toolCallId: "result-1", delta: '{"rows":[{"skuId":"123"}],"download_url":"https://example.test/report.xlsx"}' } },
    { data: { type: "RUN_FINISHED" } },
  ];
  const result = normalizeWorkflowEvents(events);
  assert.equal(result.status, "completed");
  assert.equal(result.resultCards[0].content.rows[0].skuId, "123");
  assert.deepEqual(result.files, ["https://example.test/report.xlsx"]);
});

test("workflow events merge replayed argument objects and redact identity", () => {
  const events = [
    { data: { type: "TOOL_CALL_START", toolCallId: "card-1", toolCallName: "material_card" } },
    { data: { type: "TOOL_CALL_ARGS", toolCallId: "card-1", delta: '{"cardId":"407"}' } },
    { data: { type: "TOOL_CALL_ARGS", toolCallId: "card-1", delta: '{"feedback":{"accessContext":{"userId":"private"}}}' } },
    { data: { type: "TOOL_CALL_START", toolCallId: "card-2", toolCallName: "material_card" } },
    { data: { type: "TOOL_CALL_ARGS", toolCallId: "card-2", delta: '{"output":{"data":[{"message":"完成"}],"filecards":"[{\\"url\\":\\"//storage.jd.com/report.xlsx\\"}]"}}' } },
    { data: { type: "RUN_FINISHED" } },
  ];
  const result = normalizeWorkflowEvents(events);
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(result.resultCards.length, 1);
  assert.equal(result.summaries[0].message, "完成");
  assert.deepEqual(result.files, ["//storage.jd.com/report.xlsx"]);
});
