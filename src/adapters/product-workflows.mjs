import { GatewayError } from "../errors.mjs";
import { normalizeSkuIds } from "./product-detail-inspection.mjs";

export const MAIN_IMAGE_INSPECTION_SERVICE = "FW_GOODS-1969405";
export const IMAGE_DOWNLOAD_SERVICE = "FW_GOODS-1970202";
export const MAIN_RECOMMENDATION_LABEL_SERVICE = "FW_GOODS-1970807";

export const MAIN_IMAGE_TERMINALS = Object.freeze(["APP", "PC"]);
export const MAIN_IMAGE_ELEMENTS = Object.freeze(["次日达", "重磅新品", "京喜自营"]);
export const MAIN_IMAGE_NUMBERS = Object.freeze(["1", "2", "3", "4", "5", "-1"]);

function invalidInput(message, details) {
  throw new GatewayError(message, { code: "INVALID_WORKFLOW_INPUT", status: 400, details });
}

function normalizeSelection(value, defaults, allowed, fieldName) {
  const source = value == null ? defaults : value;
  if (!Array.isArray(source) || source.length === 0) invalidInput(`${fieldName} 至少选择一项`);
  const values = [...new Set(source.map((item) => String(item).trim()).filter(Boolean))];
  const invalid = values.filter((item) => !allowed.includes(item));
  if (invalid.length) invalidInput(`${fieldName} 包含不支持的值`, { invalid, allowed });
  return values;
}

function normalizeImageIndexes(value, fieldName) {
  if (value == null) return [];
  if (!Array.isArray(value)) invalidInput(`${fieldName} 必须是数组`);
  const values = [...new Set(value.map((item) => Number(item)))];
  const invalid = values.filter((item) => !Number.isInteger(item) || item < 1 || item > 10);
  if (invalid.length) invalidInput(`${fieldName} 只能包含 1 到 10`, { invalid });
  return values;
}

export function buildMainImageInspectionFeedback(input = {}) {
  const skuList = normalizeSkuIds(input, 5000).join("\n");
  const terminalType = normalizeSelection(
    input.terminalTypes ?? input.terminalType,
    ["APP"],
    MAIN_IMAGE_TERMINALS,
    "terminalTypes",
  );
  const inspectElement = normalizeSelection(
    input.inspectElements ?? input.inspectElement,
    null,
    MAIN_IMAGE_ELEMENTS,
    "inspectElements",
  );
  const imageNum = normalizeSelection(
    input.imageNumbers ?? input.imageNum,
    ["1"],
    MAIN_IMAGE_NUMBERS,
    "imageNumbers",
  );
  return {
    terminalType,
    inspectElement,
    imageNum,
    description: { text: skuList, file: [] },
    erpGoodsSource: "",
    skuList,
    inspectsScopeType: "3",
  };
}

export function buildImageDownloadFeedback(input = {}) {
  const inputValue = normalizeSkuIds(input, 500).join("\n");
  const squareIndexList = normalizeImageIndexes(
    input.squareImageIndexes ?? input.squareIndexList,
    "squareImageIndexes",
  );
  const rectangleIndexList = normalizeImageIndexes(
    input.rectangleImageIndexes ?? input.rectangleIndexList,
    "rectangleImageIndexes",
  );
  if (squareIndexList.length === 0 && rectangleIndexList.length === 0) {
    invalidInput("至少选择一张方图或长图");
  }
  return {
    collcetSkuType: "4",
    inputValue,
    imageIndex: { squareIndexList, rectangleIndexList },
  };
}

export function buildMainRecommendationLabelFeedback(input = {}) {
  const inputValue = normalizeSkuIds(input, 1000).join("\n");
  return {
    description: { text: inputValue, file: [] },
    inputValue,
    collcetSkuType: "4",
  };
}
