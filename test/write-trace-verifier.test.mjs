import assert from "node:assert/strict";
import test from "node:test";
import { verifyAuthorizedTrace } from "../src/write-trace-verifier.mjs";

test("verifies a sanitized main recommendation labeling trace", () => {
  assert.deepEqual(verifyAuthorizedTrace({
    schemaVersion: 1,
    protocol: "main-recommendation-label",
    sanitized: true,
    request: {
      serviceCode: "FW_GOODS-1970807",
      bizCode: "CODE501",
      inputCardId: "404",
      feedbackRoot: "feedback",
      feedbackFields: ["description", "inputValue", "collcetSkuType"],
    },
    result: {
      terminal: true,
      status: "completed",
      terminalEvent: "RUN_FINISHED",
      resultFields: ["status", "output"],
    },
  }), {
    valid: true,
    protocol: "main-recommendation-label",
    evidence: { request: true, terminalResult: true },
  });
});

test("rejects incomplete labeling evidence and raw identifiers", () => {
  assert.throws(() => verifyAuthorizedTrace({
    schemaVersion: 1,
    protocol: "main-recommendation-label",
    sanitized: true,
    skuIds: ["123456789"],
    request: {
      serviceCode: "FW_GOODS-1970807",
      bizCode: "CODE501",
      inputCardId: "404",
      feedbackRoot: "feedback",
      feedbackFields: ["description"],
    },
    result: { terminal: false },
  }), /prohibited field/i);
});

test("verifies exact hosting mutation operation and shapes", () => {
  assert.deepEqual(verifyAuthorizedTrace({
    schemaVersion: 1,
    protocol: "hosting-material",
    sanitized: true,
    action: "start",
    request: {
      operation: "dsm.ware.manage.job.openManageJob",
      requestFields: ["request.scopeRule", "request.materialTypes"],
    },
    result: {
      success: true,
      successField: "code",
      successValueType: "number",
      responseFields: ["code", "data.jobId"],
    },
  }), {
    valid: true,
    protocol: "hosting-material",
    action: "start",
    operation: "dsm.ware.manage.job.openManageJob",
  });
  assert.throws(() => verifyAuthorizedTrace({
    schemaVersion: 1,
    protocol: "hosting-material",
    sanitized: true,
    action: "start",
    request: { operation: "dsm.ware.manage.job.updateManageJob", requestFields: ["request.scopeRule"] },
    result: { success: true, successField: "code", successValueType: "number", responseFields: ["code"] },
  }), /operation does not match/i);
});

test("verifies all four activity submission stages in order", () => {
  const stages = [
    ["upload", "HTTP_POST_UPLOAD"],
    ["register_file", "dsm.oxygenflow.designer.AppManagement.registerFile"],
    ["check_duplicate", "dsm.oxygenflow.purchase.task.checkParamRepeat"],
    ["create_task", "dsm.oxygenflow.purchase.task.createTask"],
  ].map(([name, operation]) => ({
    name,
    operation,
    requestFields: ["request.fileKey"],
    responseFields: ["code", "data"],
    successField: "code",
  }));
  assert.deepEqual(verifyAuthorizedTrace({
    schemaVersion: 1,
    protocol: "activity-signup",
    sanitized: true,
    stages,
  }), {
    valid: true,
    protocol: "activity-signup",
    stages: ["upload", "register_file", "check_duplicate", "create_task"],
  });
});
