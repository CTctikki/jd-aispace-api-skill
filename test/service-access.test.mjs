import assert from "node:assert/strict";
import test from "node:test";
import { ServiceAccessAdapter } from "../src/adapters/service-access.mjs";

test("service access returns only safe entitlement state", async () => {
  let received;
  const adapter = new ServiceAccessAdapter({
    client: { async call(request) {
      received = request;
      return { data: {
        effectFlag: false,
        newLogic: true,
        mainPinFlag: false,
        buttonList: [{ code: 8, name: "申请订购权限", support: true, tips: "contains account identity" }],
      } };
    } },
  });
  const result = await adapter.inspect("FW_GOODS-1961214");
  assert.equal(received.api, "dsm.jmmarket.remoting.dsm.service.GoodsDsmProvider.queryServiceOpt");
  assert.deepEqual(result, {
    serviceCode: "FW_GOODS-1961214",
    active: false,
    mainAccount: false,
    usesCurrentPurchaseFlow: true,
    actions: [{ code: 8, name: "申请订购权限", supported: true }],
  });
  assert.equal(JSON.stringify(result).includes("account identity"), false);
});

test("service access rejects arbitrary service codes", async () => {
  const adapter = new ServiceAccessAdapter({ client: { call: async () => ({ data: {} }) } });
  await assert.rejects(() => adapter.inspect("https://example.com"), { code: "INVALID_SERVICE_CODE" });
});
