import assert from "node:assert/strict";
import test from "node:test";
import {
  parseImageDownloadRows,
  parseMainImageInspectionRows,
  parseWorksheetXml,
} from "../src/adapters/xlsx-report.mjs";

test("worksheet parser resolves shared strings and sparse columns", () => {
  const sharedStrings = `<?xml version="1.0"?><sst><si><t>商品编号</t></si><si><t>端</t></si><si><t>巡检位置</t></si><si><t>元素有无</t></si><si><t>123</t></si><si><t>APP</t></si><si><t>标题</t></si><si><t>否</t></si></sst>`;
  const worksheet = `<?xml version="1.0"?><worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2" t="s"><v>7</v></c></row></sheetData></worksheet>`;
  assert.deepEqual(parseWorksheetXml(sharedStrings, worksheet), [
    ["商品编号", "端", "巡检位置", "元素有无"],
    ["123", "APP", "标题", "否"],
  ]);
});

test("main image report keeps only safe workflow fields", () => {
  const rows = parseMainImageInspectionRows(
    ["商品编号", "商品名称", "端", "主图url", "主图第几张", "主图含京喜自营", "店铺ID", "销售员erp"],
    [["123", "商品", "APP", "https://img.example/a.jpg", "第1张", "否", "private-shop", "private-user"]],
  );
  assert.deepEqual(rows, [{
    skuId: "123",
    terminal: "APP",
    imageUrl: "https://img.example/a.jpg",
    imageIndex: 1,
    checks: { 京喜自营: false },
  }]);
  assert.equal(JSON.stringify(rows).includes("private"), false);
});

test("image download report returns selected image URLs without merchant fields", () => {
  const rows = parseImageDownloadRows(
    ["SKUID", "图片比例", "第1帧", "第2帧", "下载结果", "品牌id", "销售员erp"],
    [["123", "方图", "https://img.example/1.jpg", "https://img.example/2.jpg", "成功", "private-brand", "private-user"]],
  );
  assert.deepEqual(rows, [{
    skuId: "123",
    imageType: "方图",
    images: [
      { index: 1, url: "https://img.example/1.jpg" },
      { index: 2, url: "https://img.example/2.jpg" },
    ],
    success: true,
    result: "成功",
  }]);
  assert.equal(JSON.stringify(rows).includes("private"), false);
});
