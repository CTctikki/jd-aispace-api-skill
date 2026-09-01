import { GatewayError } from "../errors.mjs";
import { OPERATIONS } from "../operations.mjs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseWorkbookSheets } from "./xlsx-report.mjs";

export const ACTIVITY_SIGNUP_APP_ID = "45c6f476-56fe-4b87-88bd-21d071f66a31";
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const ACTIVITY_SHEETS = Object.freeze({
  "POP商家": Object.freeze([
    "预约开始时间（必填）",
    "预约结束时间（必填）",
    "抢购开始时间（必填）",
    "抢购结束时间（必填）",
    "预约类型（必填）",
    "预约开始前销售（必填）",
    "预约时校验手机号（必填）",
    "同SPU合并为组（必填）",
    "预约成功后自动加车（必填）",
    "预约SPU（必填）",
  ]),
  "自营供应商": Object.freeze([
    "预约开始时间（必填）",
    "预约结束时间（必填）",
    "抢购开始时间（必填）",
    "抢购结束时间（必填）",
    "预约类型（必填）",
    "预约开始前销售（必填）",
    "预约时校验手机号（必填）",
    "预约成功后自动加车（必填）",
    "预约SKU（必填）",
  ]),
});

function parseFields(value) {
  let fields;
  try { fields = JSON.parse(value || "[]"); } catch {
    throw new GatewayError("Activity signup schema is invalid", {
      code: "ACTIVITY_SIGNUP_PROTOCOL_ERROR",
      status: 502,
    });
  }
  if (!Array.isArray(fields)) return [];
  return fields.map((field) => ({
    name: field.name || "",
    type: field.type || "",
    label: field.label || "",
    required: field.required === true,
    isExecutedRequired: field.isExecutedRequired === true,
    defaultValue: field.defaultValue ?? "",
    tips: (() => {
      if (Array.isArray(field.tips)) return field.tips.map(String);
      try {
        const parsed = JSON.parse(field.tips || "[]");
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch { return field.tips ? [String(field.tips)] : []; }
    })(),
    editor: {
      kind: field.editor?.kind || "",
      placeholder: field.editor?.placeholder || "",
      accept: field.editor?.accept || "",
      templateUrl: field.editor?.templateUrl || "",
      options: Array.isArray(field.editor?.options) ? field.editor.options : [],
    },
  }));
}

function isBlankRow(row) {
  return !row.some((value) => String(value ?? "").trim() !== "");
}

export function validateActivitySignupSheets(sheets) {
  const errors = [];
  const results = [];
  let totalRows = 0;
  for (const sheet of sheets) {
    const requiredHeaders = ACTIVITY_SHEETS[sheet.name];
    if (!requiredHeaders) continue;
    const [headerRow = [], ...rows] = sheet.rows;
    const headers = headerRow.map((value) => String(value ?? "").trim());
    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
    for (const header of missingHeaders) {
      errors.push({ sheet: sheet.name, row: 1, column: header, code: "MISSING_COLUMN" });
    }
    let rowCount = 0;
    for (const [rowIndex, row] of rows.entries()) {
      if (isBlankRow(row)) continue;
      rowCount += 1;
      for (const header of requiredHeaders) {
        const columnIndex = headers.indexOf(header);
        if (columnIndex >= 0 && String(row[columnIndex] ?? "").trim() === "") {
          errors.push({ sheet: sheet.name, row: rowIndex + 2, column: header, code: "REQUIRED_VALUE_MISSING" });
        }
      }
      const idHeader = sheet.name === "POP商家" ? "预约SPU（必填）" : "预约SKU（必填）";
      const idIndex = headers.indexOf(idHeader);
      const id = idIndex < 0 ? "" : String(row[idIndex] ?? "").trim();
      if (id && (!/^\d{5,20}$/.test(id) || /^1+$/.test(id))) {
        errors.push({ sheet: sheet.name, row: rowIndex + 2, column: idHeader, code: "INVALID_PRODUCT_ID" });
      }
    }
    totalRows += rowCount;
    results.push({ name: sheet.name, rowCount, missingHeaders });
  }
  if (results.length === 0) errors.push({ code: "SUPPORTED_SHEET_MISSING" });
  if (totalRows === 0) errors.push({ code: "DATA_ROW_MISSING" });
  return { valid: errors.length === 0, totalRows, sheets: results, errors };
}

export class ActivitySignupAdapter {
  constructor({ client }) {
    if (!client) throw new Error("client is required");
    this.client = client;
  }

  async inspect() {
    const operation = OPERATIONS["activity-signup.schema"];
    const result = await this.client.call({
      appId: operation.appId,
      api: operation.api,
      payload: { request: { appId: ACTIVITY_SIGNUP_APP_ID } },
    });
    const data = result.data || {};
    if (data.appId && data.appId !== ACTIVITY_SIGNUP_APP_ID) {
      throw new GatewayError("Unexpected activity signup app", {
        code: "ACTIVITY_SIGNUP_PROTOCOL_ERROR",
        status: 502,
      });
    }
    return {
      appId: ACTIVITY_SIGNUP_APP_ID,
      appName: data.appName || "批量预约活动报名",
      version: data.version == null ? null : String(data.version),
      description: data.description || "",
      fields: parseFields(data.appParameter),
      traceId: result.traceId || null,
    };
  }

  async validateFile(input = {}) {
    const filePath = typeof input.filePath === "string" ? input.filePath.trim() : "";
    if (!filePath || path.extname(filePath).toLowerCase() !== ".xlsx") {
      throw new GatewayError("Activity signup file must be an .xlsx file", {
        code: "INVALID_ACTIVITY_FILE",
        status: 400,
      });
    }
    let fileStat;
    let buffer;
    try {
      [fileStat, buffer] = await Promise.all([stat(filePath), readFile(filePath)]);
    } catch {
      throw new GatewayError("Activity signup file cannot be read", {
        code: "INVALID_ACTIVITY_FILE",
        status: 400,
      });
    }
    if (!fileStat.isFile() || buffer.length > MAX_INPUT_BYTES) {
      throw new GatewayError("Activity signup file is invalid or too large", {
        code: "INVALID_ACTIVITY_FILE",
        status: 400,
      });
    }
    try {
      return {
        fileName: path.basename(filePath),
        sizeBytes: buffer.length,
        ...validateActivitySignupSheets(parseWorkbookSheets(buffer)),
      };
    } catch (error) {
      throw new GatewayError("Activity signup workbook cannot be parsed", {
        code: "INVALID_ACTIVITY_WORKBOOK",
        status: 400,
        details: { reason: error.message },
      });
    }
  }
}
