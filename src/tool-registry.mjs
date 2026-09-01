const tools = [
  ["店铺运营", "智能店长AI商品优化", "third_party", "FW_GOODS-1991201"],
  ["店铺运营", "ChatExcel数据分析", "third_party", "FW_GOODS-1864005"],
  ["店铺运营", "妙手商品检测", "third_party", "FW_GOODS-1961214"],
  ["店铺运营", "商详主图AI巡检", "official", "FW_GOODS-1969405"],
  ["店铺运营", "商详信息AI全巡检", "official", "FW_GOODS-1968206"],
  ["商机选品", "京牛AI订单", "third_party", "FW_GOODS-1970007"],
  ["商机选品", "AI商机情报", "official", "FW_GOODS-1968001"],
  ["商品素材", "稿定AI生图", "third_party", "FW_GOODS-1964203"],
  ["商品素材", "SicoAI生图侠", "third_party", "FW_GOODS-1977404"],
  ["商品素材", "河图AI图片检测", "third_party", "FW_GOODS-1956604"],
  ["商品素材", "智能店长AI视频生成", "third_party", "FW_GOODS-1962202"],
  ["商品素材", "麦爆了AI标题优化_违规检测", "third_party", "FW_GOODS-1964401"],
  ["商品素材", "超级店长AI改图王", "third_party", "FW_GOODS-1969205"],
  ["商品素材", "主推商品AI打标", "official", "FW_GOODS-1970807"],
  ["商品素材", "AI商品信息托管", "official", "FW_GOODS-1968201"],
  ["商品素材", "商品主图批量下载", "official", "FW_GOODS-1970202"],
  ["商品素材", "AI评价回复托管", "official", "FW_GOODS-1967204"],
  ["营销推广", "AI会员诊断", "third_party", "FW_GOODS-1964802"],
  ["营销推广", "批量报名预约活动", "official", "FW_GOODS-1968204"],
  ["订单履约", "快递助手爆款打单", "third_party", "FW_GOODS-1968410"],
  ["订单履约", "快递助手_批量打单发货电子面单_拼购", "third_party", "FW_GOODS-33215"],
  ["订单履约", "宜算发票自动开票", "third_party", "FW_GOODS-1524405"],
  ["客户服务", "魔方AI质检", "third_party", "FW_GOODS-1959801"],
  ["客户服务", "一呼客服质检", "third_party", "FW_GOODS-1587201"],
  ["客户服务", "晓多VOC洞察", "third_party", "FW_GOODS-1871009"],
  ["客户服务", "晓多AI训练场", "third_party", "FW_GOODS-1850002"],
];

export const ADAPTER_STATUS_BY_SERVICE = Object.freeze({
  "FW_GOODS-1968206": "one_click_ready",
  "FW_GOODS-1969405": "one_click_ready",
  "FW_GOODS-1970202": "one_click_ready",
  "FW_GOODS-1970807": "write_plan_ready",
  "FW_GOODS-1968001": "one_click_ready",
  "FW_GOODS-1968201": "write_plan_ready",
  "FW_GOODS-1967204": "write_plan_ready",
  "FW_GOODS-1968204": "write_plan_ready",
});

function actions(items) {
  return Object.freeze(items.map((item) => Object.freeze(item)));
}

export const GATEWAY_ACTIONS_BY_SERVICE = Object.freeze({
  "FW_GOODS-1968206": actions([
    { id: "inspect", method: "POST", path: "/v1/workflows/inspect", mode: "read", confirmationRequired: false },
    { id: "execute", method: "POST", path: "/v1/workflows/product-detail-inspection", mode: "execute", confirmationRequired: true },
    { id: "result", method: "POST", path: "/v1/workflows/result", mode: "read", confirmationRequired: false },
  ]),
  "FW_GOODS-1969405": actions([
    { id: "inspect", method: "POST", path: "/v1/workflows/inspect", mode: "read", confirmationRequired: false },
    { id: "execute", method: "POST", path: "/v1/workflows/main-image-inspection", mode: "execute", confirmationRequired: true },
    { id: "result", method: "POST", path: "/v1/workflows/result", mode: "read", confirmationRequired: false },
  ]),
  "FW_GOODS-1970202": actions([
    { id: "inspect", method: "POST", path: "/v1/workflows/inspect", mode: "read", confirmationRequired: false },
    { id: "execute", method: "POST", path: "/v1/workflows/image-download", mode: "execute", confirmationRequired: true },
    { id: "result", method: "POST", path: "/v1/workflows/result", mode: "read", confirmationRequired: false },
  ]),
  "FW_GOODS-1970807": actions([
    { id: "plan", method: "POST", path: "/v1/workflows/main-recommendation-label/plan", mode: "plan", confirmationRequired: false },
  ]),
  "FW_GOODS-1968001": actions([
    { id: "questions", method: "GET", path: "/v1/business-opportunity/questions", mode: "read", confirmationRequired: false },
    { id: "execute", method: "POST", path: "/v1/business-opportunity/ask", mode: "execute", confirmationRequired: true },
    { id: "result", method: "POST", path: "/v1/business-opportunity/result", mode: "read", confirmationRequired: false },
  ]),
  "FW_GOODS-1968201": actions([
    { id: "inspect", method: "GET", path: "/v1/hosting/material", mode: "read", confirmationRequired: false },
    { id: "plan", method: "POST", path: "/v1/hosting/material/plan", mode: "plan", confirmationRequired: false },
  ]),
  "FW_GOODS-1967204": actions([
    { id: "inspect", method: "GET", path: "/v1/hosting/comment-reply", mode: "read", confirmationRequired: false },
    { id: "plan", method: "POST", path: "/v1/hosting/comment-reply/plan", mode: "plan", confirmationRequired: false },
  ]),
  "FW_GOODS-1968204": actions([
    { id: "schema", method: "GET", path: "/v1/activity-signup/schema", mode: "read", confirmationRequired: false },
    { id: "validate", method: "POST", path: "/v1/activity-signup/validate", mode: "read", confirmationRequired: false },
    { id: "plan", method: "POST", path: "/v1/activity-signup/plan", mode: "plan", confirmationRequired: false },
  ]),
});

export const TOOL_REGISTRY = Object.freeze(tools.map(([category, name, publisher, serviceCode = null], index) => Object.freeze({
  id: index + 1,
  category,
  name,
  publisher,
  serviceCode,
  adapterStatus: serviceCode
    ? ADAPTER_STATUS_BY_SERVICE[serviceCode] || "service_resolvable"
    : "discovery_required",
  gatewayActions: serviceCode ? GATEWAY_ACTIONS_BY_SERVICE[serviceCode] || Object.freeze([]) : Object.freeze([]),
})));

export function summarizeAdapterCapabilities(tools = TOOL_REGISTRY) {
  return {
    oneClickReady: tools.filter((tool) => tool.adapterStatus === "one_click_ready").length,
    writePlanReady: tools.filter((tool) => tool.adapterStatus === "write_plan_ready").length,
    metadataOnly: tools.filter((tool) => !Array.isArray(tool.gatewayActions) || tool.gatewayActions.length === 0).length,
  };
}

export function summarizeTools() {
  return {
    total: TOOL_REGISTRY.length,
    official: TOOL_REGISTRY.filter((tool) => tool.publisher === "official").length,
    thirdParty: TOOL_REGISTRY.filter((tool) => tool.publisher === "third_party").length,
    serviceCodesKnown: TOOL_REGISTRY.filter((tool) => tool.serviceCode).length,
    ...summarizeAdapterCapabilities(),
  };
}
