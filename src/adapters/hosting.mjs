import { GatewayError } from "../errors.mjs";
import { OPERATIONS } from "../operations.mjs";

const HOSTING_TYPES = Object.freeze({ material: 1, "comment-reply": 3 });

function operationRequest(name, payload) {
  const operation = OPERATIONS[name];
  return { appId: operation.appId, api: operation.api, payload };
}

function safeMaterialType(item = {}) {
  return {
    materialType: item.materialType ?? null,
    name: item.name || "",
    tip: item.tip ?? null,
    type: item.type ?? null,
  };
}

function safeRule(item = {}) {
  return { code: item.code || "", name: item.name || "" };
}

function safeCommentTemplate(item = {}) {
  return {
    key: item.key || "",
    name: item.name || "",
    multiple: item.multiple === true,
    typeResults: Array.isArray(item.typeResults) ? item.typeResults.map(safeMaterialType) : [],
  };
}

export class HostingAdapter {
  constructor({ client }) {
    if (!client) throw new Error("client is required");
    this.client = client;
  }

  async inspect(type) {
    const manageType = HOSTING_TYPES[type];
    if (manageType == null) {
      throw new GatewayError("hosting type must be material or comment-reply", {
        code: "INVALID_HOSTING_TYPE",
        status: 400,
      });
    }
    const operation = OPERATIONS["hosting.manage-page"];
    const result = await this.client.call(operationRequest("hosting.manage-page", { param: { manageType } }));
    const data = result.data || {};
    const template = data.manageTemplateResult || {};
    const current = data.manageJobResult;
    return {
      type,
      manageType,
      canOpenManage: Number(data.canOpenManage ?? template.canOpenManage ?? 0),
      status: current?.jobId ? "hosting" : "not_hosting",
      job: current?.jobId ? {
        jobId: String(current.jobId),
        status: current.status ?? null,
        rules: current.rules || {},
        manageMaterialTypes: Array.isArray(current.manageMaterialTypes) ? current.manageMaterialTypes : [],
      } : null,
      options: {
        materialTypes: Array.isArray(template.manageMaterialTypeResults)
          ? template.manageMaterialTypeResults.map(safeMaterialType)
          : [],
        scopeRules: Array.isArray(template.manageTemplateRuleResults)
          ? template.manageTemplateRuleResults.map(safeRule)
          : [],
        commentTemplates: Array.isArray(data.manageCommentTemplateResults)
          ? data.manageCommentTemplateResults.map(safeCommentTemplate)
          : [],
      },
      traceId: result.traceId || null,
    };
  }
}
