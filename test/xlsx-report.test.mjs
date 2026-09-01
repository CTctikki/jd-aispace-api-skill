import assert from "node:assert/strict";
import test from "node:test";
import { parseWorksheetXml } from "../src/adapters/xlsx-report.mjs";

test("worksheet parser resolves shared strings and sparse columns", () => {
  const sharedStrings = `<?xml version="1.0"?><sst><si><t>商品编号</t></si><si><t>端</t></si><si><t>巡检位置</t></si><si><t>元素有无</t></si><si><t>123</t></si><si><t>APP</t></si><si><t>标题</t></si><si><t>否</t></si></sst>`;
  const worksheet = `<?xml version="1.0"?><worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2" t="s"><v>7</v></c></row></sheetData></worksheet>`;
  assert.deepEqual(parseWorksheetXml(sharedStrings, worksheet), [
    ["商品编号", "端", "巡检位置", "元素有无"],
    ["123", "APP", "标题", "否"],
  ]);
});
