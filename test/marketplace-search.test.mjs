import assert from "node:assert/strict";
import test from "node:test";
import { MarketplaceSearchAdapter, normalizeMarketplaceItem } from "../src/adapters/marketplace-search.mjs";

test("marketplace search sends the official read-only request and sanitizes results", async () => {
  let received;
  const adapter = new MarketplaceSearchAdapter({
    client: {
      async call(request) {
        received = request;
        return {
          data: {
            page: 1,
            pageSize: 24,
            totalItemNum: 1,
            serSearchVoList: [{
              serviceCode: "FW_GOODS-1991201",
              serviceName: '<font class="skcolor_ljg">智能店长AI商品优化</font>',
              publishSource: 1,
              serviceType: 1,
              hasFreeTryUse: true,
              isSupportPC: 1,
              isSupportMobile: 0,
              devPin: "must-not-leak",
              fwsVenderId: 123,
            }],
          },
        };
      },
    },
  });
  const result = await adapter.search({ query: "智能店长AI商品优化" });
  assert.equal(received.appId, "ZX4CQB3H0F5HAQ5RCM0G");
  assert.equal(received.api, "dsm.fuwu.search.SearchUpgradeDsmProvider.queryServiceList");
  assert.deepEqual(received.payload, {
    request: { key: "智能店长AI商品优化", searchClassify: "1", page: 1, pageSize: 24 },
  });
  assert.deepEqual(result.exactMatches, [result.services[0]]);
  assert.equal(result.services[0].name, "智能店长AI商品优化");
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(result).includes("fwsVenderId"), false);
});

test("marketplace item rejects malformed service codes", () => {
  const item = normalizeMarketplaceItem({ serviceCode: "javascript:alert(1)", serviceName: "Test" }, "Test");
  assert.equal(item.serviceCode, null);
  assert.equal(item.detailUrl, null);
});

test("marketplace search validates query and pagination", async () => {
  const adapter = new MarketplaceSearchAdapter({ client: { call: async () => ({ data: {} }) } });
  await assert.rejects(() => adapter.search({ query: "" }), { code: "INVALID_MARKETPLACE_SEARCH" });
  await assert.rejects(() => adapter.search({ query: "test", pageSize: 25 }), { code: "INVALID_MARKETPLACE_SEARCH" });
  await assert.rejects(() => adapter.search({ query: "test", classify: "other" }), { code: "INVALID_MARKETPLACE_SEARCH" });
});
