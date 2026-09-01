import assert from "node:assert/strict";
import test from "node:test";
import {
  buildImageDownloadFeedback,
  buildMainImageInspectionFeedback,
  buildMainRecommendationLabelFeedback,
} from "../src/adapters/product-workflows.mjs";
import { WorkflowToolAdapter } from "../src/adapters/workflow-tools.mjs";

test("main image inspection input becomes verified card feedback", () => {
  assert.deepEqual(buildMainImageInspectionFeedback({
    skuIds: [" 123 ", "456", "123"],
    terminalTypes: ["APP"],
    inspectElements: ["京喜自营"],
    imageNumbers: [1],
  }), {
    terminalType: ["APP"],
    inspectElement: ["京喜自营"],
    imageNum: ["1"],
    description: { text: "123\n456", file: [] },
    erpGoodsSource: "",
    skuList: "123\n456",
    inspectsScopeType: "3",
  });
});

test("main image inspection validates card selections", () => {
  assert.throws(() => buildMainImageInspectionFeedback({
    skuIds: ["123"],
    inspectElements: ["未知标识"],
  }), { code: "INVALID_WORKFLOW_INPUT" });
  assert.throws(() => buildMainImageInspectionFeedback({
    skuIds: ["123"],
    inspectElements: ["京喜自营"],
    imageNumbers: [6],
  }), { code: "INVALID_WORKFLOW_INPUT" });
});

test("image download input becomes verified card feedback", () => {
  assert.deepEqual(buildImageDownloadFeedback({
    skuList: "123, 456",
    squareImageIndexes: [1, 3],
    rectangleImageIndexes: [2],
  }), {
    collcetSkuType: "4",
    inputValue: "123\n456",
    imageIndex: {
      squareIndexList: [1, 3],
      rectangleIndexList: [2],
    },
  });
});

test("image download requires a selection and limits SKU count", () => {
  assert.throws(() => buildImageDownloadFeedback({ skuIds: ["123"] }), {
    code: "INVALID_WORKFLOW_INPUT",
  });
  assert.throws(() => buildImageDownloadFeedback({
    skuIds: Array.from({ length: 501 }, (_, index) => String(index + 1)),
    squareImageIndexes: [1],
  }), { code: "INVALID_WORKFLOW_INPUT" });
});

test("main recommendation label input becomes verified card feedback", () => {
  assert.deepEqual(buildMainRecommendationLabelFeedback({ skuIds: ["123", "456"] }), {
    description: { text: "123\n456", file: [] },
    inputValue: "123\n456",
    collcetSkuType: "4",
  });
});

test("main recommendation label planning validates input without creating a task", () => {
  const adapter = new WorkflowToolAdapter({
    client: { async call() { throw new Error("must not call DSM"); } },
  });
  assert.deepEqual(adapter.planMainRecommendationLabel({ skuIds: ["123", "456"] }), {
    serviceCode: "FW_GOODS-1970807",
    bizCode: "CODE501",
    inputCardId: "404",
    status: "live_write_validation_required",
    executionEnabled: false,
    input: { skuCount: 2 },
    protocol: {
      transport: "ag-ui-sse",
      feedbackFields: ["description", "inputValue", "collcetSkuType"],
    },
  });
});
