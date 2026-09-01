import { GatewayError } from "../errors.mjs";
import { OPERATIONS } from "../operations.mjs";

const HOSTING_TYPES = Object.freeze({ material: 1, "comment-reply": 3 });
const COMMENT_TASK_STATUSES = Object.freeze({
  0: "not_hosting",
  1: "creating",
  2: "failed",
  3: "hosting",
  4: "stopped",
});
const HOSTING_ACTIONS = Object.freeze(["start", "update", "stop"]);

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

function safeStyle(item = {}) {
  return {
    id: item.id == null ? null : Number(item.id),
    name: item.name || "",
    default: String(item.isDefaultShow ?? "0") === "1",
  };
}

function invalidPlan(message, details) {
  throw new GatewayError(message, {
    code: "INVALID_HOSTING_PLAN",
    status: 400,
    details,
  });
}

function normalizeAction(value) {
  const action = String(value || "").trim();
  if (!HOSTING_ACTIONS.includes(action)) {
    invalidPlan("action must be start, update, or stop", { allowed: HOSTING_ACTIONS });
  }
  return action;
}

function normalizeMaterialPlan(input, inspection) {
  const scopeRule = String(input.scopeRule || "").trim();
  const allowedRules = inspection.options.scopeRules.map((item) => item.code).filter(Boolean);
  if (!scopeRule || !allowedRules.includes(scopeRule)) {
    invalidPlan("scopeRule must match a live hosting option", { allowed: allowedRules });
  }
  if (!Array.isArray(input.materialTypes) || input.materialTypes.length === 0) {
    invalidPlan("materialTypes must contain at least one live hosting type");
  }
  const materialTypes = [...new Set(input.materialTypes.map(Number))];
  const allowedTypes = inspection.options.materialTypes
    .map((item) => Number(item.type))
    .filter(Number.isFinite);
  const invalid = materialTypes.filter((item) => !Number.isFinite(item) || !allowedTypes.includes(item));
  if (invalid.length) invalidPlan("materialTypes contains unsupported values", { invalid, allowed: allowedTypes });
  return { scopeRule, materialTypes };
}

function normalizeCommentPlan(input, inspection, action) {
  const selectionMode = String(input.selectionMode || "").trim();
  if (!["all", "selected"].includes(selectionMode)) {
    invalidPlan("selectionMode must be all or selected");
  }
  if (selectionMode === "selected" && (!Number.isInteger(input.selectedCount) || input.selectedCount < 1)) {
    invalidPlan("selectedCount must be a positive integer for selected mode");
  }
  const replyTuneId = Number(input.replyTuneId);
  const textLengthId = Number(input.textLengthId);
  const allowedTunes = inspection.comment.replyTunes.map((item) => item.id);
  const allowedLengths = inspection.comment.textLengths.map((item) => item.id);
  if (!allowedTunes.includes(replyTuneId)) {
    invalidPlan("replyTuneId must match a live reply style", { allowed: allowedTunes });
  }
  if (!allowedLengths.includes(textLengthId)) {
    invalidPlan("textLengthId must match a live text length", { allowed: allowedLengths });
  }
  if (action === "start" && input.acceptAgreement !== true) {
    invalidPlan("acceptAgreement=true is required when planning comment hosting");
  }
  return {
    selectionMode,
    ...(selectionMode === "selected" ? { selectedCount: input.selectedCount } : {}),
    replyTuneId,
    textLengthId,
    ...(action === "start" ? { acceptAgreement: true } : {}),
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
    const result = await this.client.call(operationRequest("hosting.manage-page", { param: { manageType } }));
    const data = result.data || {};
    const template = data.manageTemplateResult || {};
    const current = data.manageJobResult;
    const response = {
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
    if (type !== "comment-reply") return response;

    const [statusResult, enabledResult, protocolResult, stylesResult] = await Promise.all([
      this.client.call(operationRequest("hosting.comment.status", {
        hostStatusRequest: { hostScene: 1 },
      })),
      this.client.call(operationRequest("hosting.comment.protocol-enabled", {
        protocolRequest: {},
      })),
      this.client.call(operationRequest("hosting.comment.protocol", {
        protocolRequest: {},
      })),
      this.client.call(operationRequest("hosting.comment.reply-styles", {})),
    ]);
    const commentStatus = statusResult.data || {};
    const styles = stylesResult.data || {};
    return {
      ...response,
      status: COMMENT_TASK_STATUSES[Number(commentStatus.taskStatus)] || "unknown",
      comment: {
        taskStatus: commentStatus.taskStatus == null ? null : Number(commentStatus.taskStatus),
        fullHostingStatus: commentStatus.fullHostingStatus ?? null,
        pullProductStatus: commentStatus.pullProductStatus ?? null,
        agreement: {
          enabled: Number(enabledResult.data) === 1,
          id: protocolResult.data?.id == null ? null : String(protocolResult.data.id),
          url: protocolResult.data?.url || "",
        },
        replyTunes: Array.isArray(styles.replyTuneList) ? styles.replyTuneList.map(safeStyle) : [],
        textLengths: Array.isArray(styles.textLengthList) ? styles.textLengthList.map(safeStyle) : [],
      },
    };
  }

  async plan(type, input = {}) {
    const action = normalizeAction(input.action);
    const inspection = await this.inspect(type);
    const normalizedInput = action === "stop"
      ? {}
      : type === "material"
        ? normalizeMaterialPlan(input, inspection)
        : normalizeCommentPlan(input, inspection, action);
    const operation = type === "material"
      ? { start: "openManageJob", update: "updateManageJob", stop: "clsoeManageJob" }[action]
      : { start: "openCommentHosting", update: "updateReplyStyleData", stop: "operateHost" }[action];
    return {
      type,
      action,
      status: "live_write_validation_required",
      executionEnabled: false,
      currentStatus: inspection.status,
      input: normalizedInput,
      protocol: {
        operation,
        source: "official_frontend_static_analysis",
      },
    };
  }
}
