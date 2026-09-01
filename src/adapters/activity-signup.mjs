import { GatewayError } from "../errors.mjs";
import { OPERATIONS } from "../operations.mjs";

export const ACTIVITY_SIGNUP_APP_ID = "45c6f476-56fe-4b87-88bd-21d071f66a31";

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
}
