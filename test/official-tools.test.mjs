import assert from "node:assert/strict";
import test from "node:test";
import {
  ActivitySignupAdapter,
  ACTIVITY_SIGNUP_APP_ID,
  buildActivitySignupPlan,
  validateActivitySignupSheets,
} from "../src/adapters/activity-signup.mjs";
import { HostingAdapter } from "../src/adapters/hosting.mjs";

test("hosting inspection returns only actionable safe configuration", async () => {
  const client = { async call(request) {
    assert.deepEqual(request.payload, { param: { manageType: 1 } });
    return { data: {
      canOpenManage: 1,
      manageJobResult: { jobId: "job-1", status: 1, venderId: "private" },
      manageTemplateResult: {
        manageMaterialTypeResults: [{ materialType: 1, name: "白底图", tip: null, type: 31 }],
        manageTemplateRuleResults: [{ code: "isSale", name: "动销商品" }],
      },
    } };
  } };
  const result = await new HostingAdapter({ client }).inspect("material");
  assert.deepEqual(result.options.materialTypes, [{ materialType: 1, name: "白底图", tip: null, type: 31 }]);
  assert.equal(result.job.jobId, "job-1");
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("hosting rejects unknown types", async () => {
  const adapter = new HostingAdapter({ client: {} });
  await assert.rejects(() => adapter.inspect("unknown"), { code: "INVALID_HOSTING_TYPE" });
});

test("hosting mutation planning uses live options without calling a write API", async () => {
  const calls = [];
  const client = { async call(request) {
    calls.push(request.api);
    return { data: {
      manageTemplateResult: {
        manageMaterialTypeResults: [
          { materialType: 1, name: "白底图", type: 31 },
          { materialType: 2, name: "短标题", type: 1001 },
        ],
        manageTemplateRuleResults: [{ code: "isSale", name: "动销商品" }],
      },
    } };
  } };
  const result = await new HostingAdapter({ client }).plan("material", {
    action: "start",
    scopeRule: "isSale",
    materialTypes: [31, 1001],
  });
  assert.equal(result.executionEnabled, false);
  assert.equal(result.status, "live_write_validation_required");
  assert.deepEqual(result.input, {
    scopeRule: "isSale",
    materialTypes: [31, 1001],
  });
  assert.deepEqual(calls, ["dsm.ware.manage.job.queryManagePageInfo"]);
});

test("comment hosting inspection returns verified status, agreement, and styles", async () => {
  const calls = [];
  const client = { async call(request) {
    calls.push(request.api);
    switch (request.api) {
      case "dsm.ware.manage.job.queryManagePageInfo":
        assert.deepEqual(request.payload, { param: { manageType: 3 } });
        return { data: { manageTemplateResult: {}, manageCommentTemplateResults: [] } };
      case "dsm.support.hosting.CommentsHostingFacadeService.getHostStatus":
        assert.deepEqual(request.payload, { hostStatusRequest: { hostScene: 1 } });
        return { data: { taskStatus: 0, taskId: "private", pullProductStatus: 1 } };
      case "dsm.support.hosting.CommentsHostingFacadeService.hostProtocolEnabled":
        assert.deepEqual(request.payload, { protocolRequest: {} });
        return { data: 1 };
      case "dsm.support.hosting.CommentsHostingFacadeService.getHostProtocol":
        return { data: { id: 1, url: "https://storage.jd.com/protocol.pdf" } };
      case "dsm.support.hosting.CommentsHostingFacadeService.replyStyleDefaultList":
        return { data: {
          replyTuneList: [{ id: 1, name: "智能", isDefaultShow: "1", privateField: "hidden" }],
          textLengthList: [{ id: 2, name: "丰富", isDefaultShow: "0" }],
        } };
      default:
        throw new Error(`Unexpected API: ${request.api}`);
    }
  } };
  const result = await new HostingAdapter({ client }).inspect("comment-reply");
  assert.equal(result.status, "not_hosting");
  assert.deepEqual(result.comment.agreement, {
    enabled: true,
    id: "1",
    url: "https://storage.jd.com/protocol.pdf",
  });
  assert.deepEqual(result.comment.replyTunes, [{ id: 1, name: "智能", default: true }]);
  assert.deepEqual(result.comment.textLengths, [{ id: 2, name: "丰富", default: false }]);
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(calls.length, 5);
});

test("comment hosting planning validates live reply options without writes", async () => {
  const calls = [];
  const client = { async call(request) {
    calls.push(request.api);
    switch (request.api) {
      case "dsm.ware.manage.job.queryManagePageInfo":
        return { data: { manageTemplateResult: {}, manageCommentTemplateResults: [] } };
      case "dsm.support.hosting.CommentsHostingFacadeService.getHostStatus":
        return { data: { taskStatus: 0 } };
      case "dsm.support.hosting.CommentsHostingFacadeService.hostProtocolEnabled":
        return { data: 1 };
      case "dsm.support.hosting.CommentsHostingFacadeService.getHostProtocol":
        return { data: { id: 1, url: "https://storage.jd.com/protocol.pdf" } };
      case "dsm.support.hosting.CommentsHostingFacadeService.replyStyleDefaultList":
        return { data: {
          replyTuneList: [{ id: 1, name: "智能", isDefaultShow: "1" }],
          textLengthList: [{ id: 2, name: "丰富", isDefaultShow: "1" }],
        } };
      default:
        throw new Error("unexpected write operation");
    }
  } };
  const plan = await new HostingAdapter({ client }).plan("comment-reply", {
    action: "start",
    selectionMode: "all",
    replyTuneId: 1,
    textLengthId: 2,
    acceptAgreement: true,
  });
  assert.deepEqual(plan.input, {
    selectionMode: "all",
    replyTuneId: 1,
    textLengthId: 2,
    acceptAgreement: true,
  });
  assert.equal(plan.protocol.operation, "openCommentHosting");
  assert.equal(calls.length, 5);
});

test("activity signup schema parses the fixed official app", async () => {
  const client = { async call(request) {
    assert.equal(request.payload.request.appId, ACTIVITY_SIGNUP_APP_ID);
    return { data: {
      appId: ACTIVITY_SIGNUP_APP_ID,
      appName: "批量预约活动报名",
      version: "11",
      appParameter: JSON.stringify([{ name: "inputExcel", required: true, editor: { kind: "UploadFile", accept: ".xlsx", templateUrl: "https://storage.360buyimg.com/template.xlsx" } }]),
      privateField: "hidden",
    } };
  } };
  const result = await new ActivitySignupAdapter({ client }).inspect();
  assert.equal(result.version, "11");
  assert.equal(result.fields[0].name, "inputExcel");
  assert.equal(JSON.stringify(result).includes("hidden"), false);
});

test("activity signup planning exposes phases without file contents or path", () => {
  const plan = buildActivitySignupPlan({
    appId: ACTIVITY_SIGNUP_APP_ID,
    appName: "批量预约活动报名",
    version: "11",
    fields: [{ name: "inputExcel", required: true, editor: { kind: "UploadFile", accept: ".xlsx" } }],
  }, {
    valid: true,
    fileName: "activity.xlsx",
    sizeBytes: 1024,
    totalRows: 3,
    sheets: [{ name: "POP商家", rowCount: 3, missingHeaders: [] }],
    errors: [],
  });
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.uploadField.name, "inputExcel");
  assert.deepEqual(plan.phases, ["upload", "register_file", "check_duplicate", "create_task"]);
  assert.equal(JSON.stringify(plan).includes("filePath"), false);
});

test("activity signup preflight validates both official worksheet formats without returning product ids", () => {
  const result = validateActivitySignupSheets([
    {
      name: "POP商家",
      rows: [
        ["预约开始时间（必填）", "预约结束时间（必填）", "抢购开始时间（必填）", "抢购结束时间（必填）", "预约类型（必填）", "预约开始前销售（必填）", "预约时校验手机号（必填）", "同SPU合并为组（必填）", "预约成功后自动加车（必填）", "预约SPU（必填）"],
        ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "预约购买资格", "可销售", "不需校验", "合并为组", "是", "1234567890"],
      ],
    },
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.totalRows, 1);
  assert.equal(JSON.stringify(result).includes("1234567890"), false);
});

test("activity signup preflight rejects unchanged example product ids", () => {
  const result = validateActivitySignupSheets([
    {
      name: "自营供应商",
      rows: [
        ["预约开始时间（必填）", "预约结束时间（必填）", "抢购开始时间（必填）", "抢购结束时间（必填）", "预约类型（必填）", "预约开始前销售（必填）", "预约时校验手机号（必填）", "预约成功后自动加车（必填）", "预约SKU（必填）"],
        ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "预约购买资格", "可销售", "不需校验", "是", "11111111111"],
      ],
    },
  ]);
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, "INVALID_PRODUCT_ID");
});
