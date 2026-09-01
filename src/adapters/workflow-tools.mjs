import { GatewayError } from "../errors.mjs";
import { OPERATIONS } from "../operations.mjs";
import {
  buildProductDetailInspectionFeedback,
  normalizeWorkflowEvents,
  PRODUCT_DETAIL_INSPECTION_SERVICE,
} from "./product-detail-inspection.mjs";
import {
  buildImageDownloadFeedback,
  buildMainImageInspectionFeedback,
  buildMainRecommendationLabelFeedback,
  IMAGE_DOWNLOAD_SERVICE,
  MAIN_IMAGE_INSPECTION_SERVICE,
  MAIN_RECOMMENDATION_LABEL_SERVICE,
} from "./product-workflows.mjs";
import {
  fetchImageDownloadReport,
  fetchInspectionReport,
  fetchMainImageInspectionReport,
} from "./xlsx-report.mjs";

export const WORKFLOW_TOOLS = Object.freeze({
  [MAIN_IMAGE_INSPECTION_SERVICE]: Object.freeze({ route: "main-image-inspection", bizCode: "CODE402", inputCardId: "402" }),
  [IMAGE_DOWNLOAD_SERVICE]: Object.freeze({ route: "image-download", bizCode: "CODE403", inputCardId: "403" }),
  [PRODUCT_DETAIL_INSPECTION_SERVICE]: Object.freeze({ route: "product-detail-inspection", bizCode: "CODE404", inputCardId: "405" }),
  [MAIN_RECOMMENDATION_LABEL_SERVICE]: Object.freeze({ route: "main-recommendation-label", bizCode: "CODE501", inputCardId: "404" }),
});

const REPORT_HANDLERS = Object.freeze({
  [PRODUCT_DETAIL_INSPECTION_SERVICE]: Object.freeze({ rowsKey: "inspectionRows", fetch: fetchInspectionReport }),
  [MAIN_IMAGE_INSPECTION_SERVICE]: Object.freeze({ rowsKey: "mainImageRows", fetch: fetchMainImageInspectionReport }),
  [IMAGE_DOWNLOAD_SERVICE]: Object.freeze({ rowsKey: "downloadRows", fetch: fetchImageDownloadReport }),
});

function operationRequest(name, payload) {
  const operation = OPERATIONS[name];
  return { appId: operation.appId, api: operation.api, payload };
}

const STREAM_URL = ["https:", "", "workflow-platform.jd.com", "v1", "agui", "stream"].join("/");

function parseSse(text) {
  return text.replace(/\r\n/g, "\n").split("\n\n").map((block) => {
    const event = { event: "message", data: "" };
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event.event = line.slice(6).trim();
      if (line.startsWith("id:")) event.id = line.slice(3).trim();
      if (line.startsWith("data:")) event.data += line.slice(5).trim();
    }
    if (event.data.length === 0) return null;
    try {
      event.data = JSON.parse(event.data);
    } catch {}
    return event;
  }).filter(Boolean);
}

function parseSseBlock(block) {
  return parseSse(`${block}\n\n`)[0] || null;
}

async function readSse(response) {
  if (response.body == null || typeof response.body.getReader !== "function") {
    return { events: parseSse(await response.text()), timedOut: false };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = "";
  let timedOut = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let separator = buffer.indexOf("\n\n");
      while (separator >= 0) {
        const event = parseSseBlock(buffer.slice(0, separator));
        if (event) events.push(event);
        buffer = buffer.slice(separator + 2);
        separator = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
  } catch (error) {
    if (error?.name !== "AbortError" && error?.name !== "TimeoutError") throw error;
    timedOut = true;
  }
  const finalEvent = parseSseBlock(buffer);
  if (finalEvent) events.push(finalEvent);
  return { events, timedOut };
}

function summarizeContext(context = {}) {
  return {
    authenticated: Boolean(context.userId || context.userUniqueName),
    accountType: context.accountType ?? null,
    loginStateType: context.loginStateType ?? null,
    locale: context.locale || null,
  };
}

function summarizeEvents(events) {
  const allowed = [
    "type",
    "threadId",
    "runId",
    "toolCallId",
    "toolCallName",
    "messageId",
    "activityType",
    "role",
    "message",
  ];
  return events.map((event) => ({
    event: event.event,
    ...(event.id ? { id: event.id } : {}),
    data: Object.fromEntries(allowed
      .filter((key) => event.data?.[key] != null)
      .map((key) => [key, event.data[key]])),
  }));
}

export class WorkflowToolAdapter {
  constructor({ client, transport = null, streamUrl = STREAM_URL, fetchImpl = globalThis.fetch }) {
    if (client == null) throw new Error("client is required");
    this.client = client;
    this.transport = transport;
    this.streamUrl = streamUrl;
    this.fetchImpl = fetchImpl;
  }

  getDefinition(serviceCode) {
    const definition = WORKFLOW_TOOLS[serviceCode];
    if (definition == null) {
      throw new GatewayError("No workflow adapter for " + serviceCode, {
        code: "WORKFLOW_NOT_SUPPORTED",
        status: 400,
      });
    }
    return definition;
  }

  async inspectRaw(serviceCode) {
    const definition = this.getDefinition(serviceCode);
    const [contextResult, specialistResult, versionResult] = await Promise.all([
      this.client.call(operationRequest("workflow.context", {})),
      this.client.call(operationRequest("workflow.specialist", {
        request: { data: { code: definition.bizCode } },
      })),
      this.client.call(operationRequest("workflow.version", {
        request: { data: { specialistCode: definition.bizCode, channelCode: "jm" } },
      })),
    ]);
    return {
      definition,
      context: contextResult.data || {},
      specialist: specialistResult.data || {},
      version: versionResult.data || {},
    };
  }

  async inspect(serviceCode) {
    const result = await this.inspectRaw(serviceCode);
    return {
      serviceCode,
      route: result.definition.route,
      bizCode: result.definition.bizCode,
      ready: Boolean(result.version.workflowId && result.version.workflowVersion),
      access: summarizeContext(result.context),
      specialist: {
        name: result.specialist.name || null,
        status: result.specialist.status ?? null,
        permission: result.specialist.currentUserPermission || null,
      },
      workflow: {
        id: result.version.workflowId || null,
        version: result.version.workflowVersion || null,
        deploymentId: result.version.deploymentId || null,
        deploymentType: result.version.deploymentType ?? null,
      },
    };
  }

  buildRunRequest(result, input) {
    const feedback = {
      ...(input.feedback || {}),
      platform: "pc",
      channel: "jm",
      accessContext: result.context,
    };
    const body = {
      feedback,
      bizCode: result.definition.bizCode,
      platform: "pc",
      channel: "jm",
      accessContext: result.context,
      threadId: input.threadId || "",
      runId: input.runId || "",
      workflowId: result.version.workflowId,
      version: result.version.workflowVersion,
      locator: 1,
    };
    if (input.resume === true) body.resume = true;
    if (input.extMap !== undefined) body.extMap = input.extMap;
    return body;
  }

  async run(serviceCode, input = {}) {
    if (typeof this.transport?.sendStream !== "function") {
      throw new GatewayError("Current transport does not support streaming", {
        code: "STREAM_TRANSPORT_UNAVAILABLE",
        status: 501,
      });
    }
    const result = await this.inspectRaw(serviceCode);
    if (result.version.workflowId == null || result.version.workflowVersion == null) {
      throw new GatewayError("Workflow deployment is unavailable", {
        code: "WORKFLOW_UNAVAILABLE",
        status: 502,
      });
    }
    const response = await this.transport.sendStream({
      method: "POST",
      url: this.streamUrl,
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
        origin: "https://ware-agent-pro.pf.jd.com",
      },
      body: JSON.stringify(this.buildRunRequest(result, input)),
      signal: input.timeoutMs ? AbortSignal.timeout(input.timeoutMs) : undefined,
    });
    if (response.ok === false) {
      throw new GatewayError("Workflow stream returned HTTP " + response.status, {
        code: "WORKFLOW_STREAM_ERROR",
        status: 502,
      });
    }
    const { events: rawEvents, timedOut } = await readSse(response);
    const started = rawEvents.map((event) => event.data).find((data) => data?.type === "RUN_STARTED");
    const normalized = normalizeWorkflowEvents(rawEvents);
    return {
      serviceCode,
      bizCode: result.definition.bizCode,
      threadId: started?.threadId || input.threadId || null,
      runId: started?.runId || input.runId || null,
      ...normalized,
      timedOut,
      events: summarizeEvents(rawEvents),
    };
  }

  async readRun(serviceCode, input = {}) {
    if (!input.threadId || !input.runId) {
      throw new GatewayError("threadId 和 runId 必填", {
        code: "INVALID_WORKFLOW_INPUT",
        status: 400,
      });
    }
    const result = await this.run(serviceCode, {
      threadId: input.threadId,
      runId: input.runId,
      timeoutMs: input.timeoutMs,
    });
    return this.addWorkflowReport(serviceCode, result);
  }

  async addWorkflowReport(serviceCode, result) {
    const handler = REPORT_HANDLERS[serviceCode];
    if (handler == null) return result;
    const reportUrl = result.files.find((url) => /\.xlsx(?:$|\?)/i.test(url));
    if (result.status !== "completed" || !reportUrl) {
      return { ...result, [handler.rowsKey]: [], report: null };
    }
    try {
      const report = await handler.fetch(reportUrl, this.fetchImpl);
      return { ...result, [handler.rowsKey]: report.rows, report: { url: report.url, rowCount: report.rows.length } };
    } catch (error) {
      return {
        ...result,
        [handler.rowsKey]: [],
        report: { url: reportUrl, rowCount: 0, error: error.message },
      };
    }
  }

  async runMaterialCardWorkflow(serviceCode, feedback, input, inputSummary) {
    const definition = this.getDefinition(serviceCode);
    const started = await this.run(serviceCode, {
      timeoutMs: input.startTimeoutMs || 30_000,
    });
    const materialCard = started.toolCalls.find((toolCall) => toolCall.name === "material_card");
    const actualCardId = materialCard?.arguments?.cardId;
    if (
      started.status !== "waiting_input"
      || materialCard == null
      || (actualCardId != null && String(actualCardId) !== definition.inputCardId)
    ) {
      throw new GatewayError("Workflow did not request the expected material card", {
        code: "WORKFLOW_PROTOCOL_ERROR",
        status: 502,
        details: { status: started.status, expectedCardId: definition.inputCardId },
      });
    }
    const resumed = await this.run(serviceCode, {
      threadId: started.threadId,
      runId: started.runId,
      resume: true,
      feedback,
      timeoutMs: input.timeoutMs,
    });
    const completed = await this.addWorkflowReport(serviceCode, resumed);
    const handler = REPORT_HANDLERS[serviceCode];
    return {
      serviceCode,
      threadId: completed.threadId,
      runId: completed.runId,
      status: completed.status,
      error: completed.error,
      timedOut: completed.timedOut,
      input: inputSummary,
      summaries: completed.summaries,
      ...(handler ? { [handler.rowsKey]: completed[handler.rowsKey] } : {}),
      report: completed.report,
      files: completed.files,
      resultCards: completed.resultCards,
      toolCalls: completed.toolCalls,
    };
  }

  runProductDetailInspection(input = {}) {
    const feedback = buildProductDetailInspectionFeedback(input);
    return this.runMaterialCardWorkflow(PRODUCT_DETAIL_INSPECTION_SERVICE, feedback, input, {
      terminalTypes: feedback.terminalType,
      inspectText: feedback.inspectElement,
      locations: feedback.inspectLocationDesc,
      skuIds: feedback.skuList.split("\n"),
    });
  }

  runMainImageInspection(input = {}) {
    const feedback = buildMainImageInspectionFeedback(input);
    return this.runMaterialCardWorkflow(MAIN_IMAGE_INSPECTION_SERVICE, feedback, input, {
      terminalTypes: feedback.terminalType,
      inspectElements: feedback.inspectElement,
      imageNumbers: feedback.imageNum,
      skuIds: feedback.skuList.split("\n"),
    });
  }

  runImageDownload(input = {}) {
    const feedback = buildImageDownloadFeedback(input);
    return this.runMaterialCardWorkflow(IMAGE_DOWNLOAD_SERVICE, feedback, input, {
      skuIds: feedback.inputValue.split("\n"),
      squareImageIndexes: feedback.imageIndex.squareIndexList,
      rectangleImageIndexes: feedback.imageIndex.rectangleIndexList,
    });
  }

  planMainRecommendationLabel(input = {}) {
    const feedback = buildMainRecommendationLabelFeedback(input);
    const definition = this.getDefinition(MAIN_RECOMMENDATION_LABEL_SERVICE);
    return {
      serviceCode: MAIN_RECOMMENDATION_LABEL_SERVICE,
      bizCode: definition.bizCode,
      inputCardId: definition.inputCardId,
      status: "live_write_validation_required",
      executionEnabled: false,
      input: { skuCount: feedback.inputValue.split("\n").length },
      protocol: {
        transport: "ag-ui-sse",
        feedbackFields: Object.keys(feedback),
      },
    };
  }

}
