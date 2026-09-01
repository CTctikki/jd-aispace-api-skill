import assert from "node:assert/strict";
import test from "node:test";
import { ActivitySignupAdapter, ACTIVITY_SIGNUP_APP_ID } from "../src/adapters/activity-signup.mjs";
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
