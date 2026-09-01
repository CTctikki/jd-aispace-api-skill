import assert from "node:assert/strict";
import test from "node:test";
import {
  MarketplaceDetailAdapter,
  normalizeMarketplaceDetail,
} from "../src/adapters/marketplace-detail.mjs";

test("marketplace detail returns public capabilities without vendor identities", async () => {
  let received;
  const adapter = new MarketplaceDetailAdapter({
    client: { async call(request) {
      received = request;
      return {
        data: {
          serviceCode: "FW_GOODS-1977404",
          serviceName: "<b>SicoAI生图侠</b>",
          introduce: "<p>AI 图片处理</p>",
          serviceType: 1,
          isSupportPC: true,
          isSupportMobile: false,
          chareMode: 3,
          appkey: "must-not-leak",
          fwsPin: "must-not-leak",
          fwsVenderId: 123,
          fwExtVoList: [
            { extCode: "market.jm_ai_space_tool_paradigm", extValue: "INDEPENDENCE" },
            { extCode: "market.jm_ai_space_provider_short_name", extValue: "private-provider" },
          ],
          serviceVersionFunctionBasicConfigs: [{
            functionCode: "fw_tag_58415",
            functionName: "主图水印",
            functionIntroduction: "<p>一键添加水印</p>",
            functionStatus: 1,
            creator: "private-creator",
            modifier: "private-modifier",
            id: "private-id",
            serviceVersionFunctionList: [{
              itemCode: "fw_item_1",
              itemName: "批量处理",
              functionVersionIntroduction: "一次处理多张图片",
              supported: 1,
              creator: "private-creator",
            }],
          }],
        },
      };
    } },
  });

  const result = await adapter.inspect("FW_GOODS-1977404");
  assert.equal(received.api, "dsm.jmmarket.remoting.dsm.service.GoodsDetailDsmProvider.getGoodsBaseInfo");
  assert.deepEqual(received.payload, { request: { serviceCode: "FW_GOODS-1977404" } });
  assert.deepEqual(result, {
    serviceCode: "FW_GOODS-1977404",
    name: "SicoAI生图侠",
    description: "AI 图片处理",
    serviceType: 1,
    paradigm: "INDEPENDENCE",
    platforms: { pc: true, mobile: false },
    chargeMode: 3,
    capabilities: [{
      code: "fw_tag_58415",
      name: "主图水印",
      description: "一键添加水印",
      active: true,
      items: [{
        code: "fw_item_1",
        name: "批量处理",
        description: "一次处理多张图片",
        supported: true,
      }],
    }],
    detailUrl: "https://fw.jd.com/market/new/detail/FW_GOODS-1977404",
  });
  const serialized = JSON.stringify(result);
  for (const value of ["must-not-leak", "private-provider", "private-creator", "private-modifier", "private-id"]) {
    assert.equal(serialized.includes(value), false);
  }
});

test("marketplace detail normalizes missing and inactive capabilities", () => {
  assert.deepEqual(normalizeMarketplaceDetail({
    serviceCode: "FW_GOODS-1964401",
    serviceName: "Title tool",
    serviceVersionFunctionBasicConfigs: [
      { functionCode: "bad", functionName: "Removed", functionStatus: 0 },
      null,
    ],
  }, "FW_GOODS-1964401").capabilities, [{
    code: null,
    name: "Removed",
    description: "",
    active: false,
    items: [],
  }]);
});

test("marketplace detail rejects arbitrary service codes", async () => {
  const adapter = new MarketplaceDetailAdapter({ client: { call: async () => ({ data: {} }) } });
  await assert.rejects(() => adapter.inspect("https://example.com"), {
    code: "INVALID_SERVICE_CODE",
  });
});
