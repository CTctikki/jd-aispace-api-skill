const PROHIBITED_FIELDS = new Set([
  "accessContext",
  "accessToken",
  "account",
  "accountId",
  "authorization",
  "body",
  "cookie",
  "cookies",
  "filePath",
  "headers",
  "merchantId",
  "payload",
  "pin",
  "refreshToken",
  "runId",
  "shopId",
  "sign",
  "skuIds",
  "skuList",
  "state",
  "taskId",
  "threadId",
  "token",
  "url",
  "userId",
  "venderId",
  "vendorId",
]);

const HOSTING_OPERATIONS = Object.freeze({
  "hosting-material": Object.freeze({
    start: "dsm.ware.manage.job.openManageJob",
    update: "dsm.ware.manage.job.updateManageJob",
    stop: "dsm.ware.manage.job.clsoeManageJob",
  }),
  "hosting-comment-reply": Object.freeze({
    start: "dsm.support.hosting.CommentsHostingFacadeService.openCommentHosting",
    update: "dsm.support.hosting.CommentsHostingFacadeService.updateReplyStyleData",
    stop: "dsm.support.hosting.CommentsHostingFacadeService.operateHost",
  }),
});

const ACTIVITY_STAGES = Object.freeze([
  Object.freeze({ name: "upload", operation: "HTTP_POST_UPLOAD" }),
  Object.freeze({ name: "register_file", operation: "dsm.oxygenflow.designer.AppManagement.registerFile" }),
  Object.freeze({ name: "check_duplicate", operation: "dsm.oxygenflow.purchase.task.checkParamRepeat" }),
  Object.freeze({ name: "create_task", operation: "dsm.oxygenflow.purchase.task.createTask" }),
]);

function invalid(message) {
  throw new Error(`Invalid authorized trace: ${message}`);
}

function assertObject(value, label) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object`);
}

function assertAllowedKeys(value, allowed, label) {
  assertObject(value, label);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) invalid(`${label} contains unsupported fields: ${unknown.join(", ")}`);
}

function assertFieldList(value, label) {
  if (!Array.isArray(value) || value.length === 0) invalid(`${label} must contain field paths`);
  const invalidFields = value.filter((field) => (
    typeof field !== "string"
    || field.length > 160
    || !/^[A-Za-z][A-Za-z0-9_.\[\]-]*$/.test(field)
  ));
  if (invalidFields.length > 0) invalid(`${label} contains an invalid field path`);
}

function assertSafeOperation(value, label) {
  if (typeof value !== "string" || value.length < 3 || value.length > 240) invalid(`${label} is required`);
  if (!/^[A-Za-z0-9_./: -]+$/.test(value) || /[?&=#]/.test(value)) {
    invalid(`${label} must be a sanitized method or path without query values`);
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value)) {
    invalid(`${label} must be a sanitized identifier`);
  }
}

function scanProhibitedFields(value) {
  if (Array.isArray(value)) {
    for (const item of value) scanProhibitedFields(item);
    return;
  }
  if (value == null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (PROHIBITED_FIELDS.has(key)) invalid(`prohibited field ${key} must be removed`);
    scanProhibitedFields(child);
  }
}

function verifyMainRecommendationLabel(trace) {
  assertAllowedKeys(trace.request, [
    "serviceCode",
    "bizCode",
    "inputCardId",
    "feedbackRoot",
    "feedbackFields",
  ], "request");
  if (trace.request.serviceCode !== "FW_GOODS-1970807") invalid("serviceCode does not match main recommendation labeling");
  if (trace.request.bizCode !== "CODE501") invalid("bizCode must be CODE501");
  if (trace.request.inputCardId !== "404") invalid("inputCardId must be 404");
  if (trace.request.feedbackRoot !== "feedback") invalid("feedbackRoot must be feedback");
  assertFieldList(trace.request.feedbackFields, "request.feedbackFields");
  for (const field of ["description", "inputValue", "collcetSkuType"]) {
    if (!trace.request.feedbackFields.includes(field)) invalid(`request.feedbackFields must include ${field}`);
  }

  assertAllowedKeys(trace.result, ["terminal", "status", "terminalEvent", "resultFields"], "result");
  if (trace.result.terminal !== true) invalid("result must be terminal");
  assertIdentifier(trace.result.status, "result.status");
  assertIdentifier(trace.result.terminalEvent, "result.terminalEvent");
  assertFieldList(trace.result.resultFields, "result.resultFields");
  return {
    valid: true,
    protocol: trace.protocol,
    evidence: { request: true, terminalResult: true },
  };
}

function verifyHosting(trace) {
  if (!Object.hasOwn(HOSTING_OPERATIONS, trace.protocol)) invalid("unsupported hosting protocol");
  if (!Object.hasOwn(HOSTING_OPERATIONS[trace.protocol], trace.action)) invalid("hosting action must be start, update, or stop");
  assertAllowedKeys(trace.request, ["operation", "requestFields"], "request");
  const expectedOperation = HOSTING_OPERATIONS[trace.protocol][trace.action];
  if (trace.request.operation !== expectedOperation) invalid("hosting operation does not match protocol and action");
  assertFieldList(trace.request.requestFields, "request.requestFields");
  assertAllowedKeys(trace.result, ["success", "successField", "successValueType", "responseFields"], "result");
  if (trace.result.success !== true) invalid("hosting result must demonstrate success");
  assertFieldList(trace.result.responseFields, "result.responseFields");
  assertFieldList([trace.result.successField], "result.successField");
  if (!["boolean", "number", "string", "object", "null"].includes(trace.result.successValueType)) {
    invalid("result.successValueType is invalid");
  }
  return {
    valid: true,
    protocol: trace.protocol,
    action: trace.action,
    operation: expectedOperation,
  };
}

function verifyActivitySignup(trace) {
  if (!Array.isArray(trace.stages) || trace.stages.length !== ACTIVITY_STAGES.length) {
    invalid("activity signup must contain four stages");
  }
  for (const [index, expected] of ACTIVITY_STAGES.entries()) {
    const stage = trace.stages[index];
    assertAllowedKeys(stage, ["name", "operation", "requestFields", "responseFields", "successField"], `stages[${index}]`);
    if (stage.name !== expected.name) invalid("activity signup stages are out of order");
    assertSafeOperation(stage.operation, `stages[${index}].operation`);
    if (stage.operation !== expected.operation) {
      invalid(`activity signup ${expected.name} operation does not match`);
    }
    assertFieldList(stage.requestFields, `stages[${index}].requestFields`);
    assertFieldList(stage.responseFields, `stages[${index}].responseFields`);
    assertFieldList([stage.successField], `stages[${index}].successField`);
  }
  return {
    valid: true,
    protocol: trace.protocol,
    stages: ACTIVITY_STAGES.map((stage) => stage.name),
  };
}

export function verifyAuthorizedTrace(trace) {
  assertObject(trace, "trace");
  scanProhibitedFields(trace);
  assertAllowedKeys(trace, ["schemaVersion", "protocol", "sanitized", "request", "result", "action", "stages"], "trace");
  if (trace.schemaVersion !== 1) invalid("schemaVersion must be 1");
  if (trace.sanitized !== true) invalid("sanitized must be true");
  if (trace.protocol === "main-recommendation-label") return verifyMainRecommendationLabel(trace);
  if (trace.protocol === "activity-signup") return verifyActivitySignup(trace);
  if (typeof trace.protocol === "string" && trace.protocol.startsWith("hosting-")) return verifyHosting(trace);
  invalid("unsupported protocol");
}
