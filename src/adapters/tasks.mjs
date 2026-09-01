import { GatewayError } from "../errors.mjs";
import { OPERATIONS } from "../operations.mjs";

const WORKFLOW_RESULT_HOSTS = new Set(["ware-agent-pro.pf.jd.com"]);

function operationRequest(name, payload) {
  const operation = OPERATIONS[name];
  return { appId: operation.appId, api: operation.api, payload };
}

function positiveInteger(value, fallback, maximum) {
  if (value == null || value === "") return fallback;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > maximum) {
    throw new GatewayError(`Expected an integer from 1 to ${maximum}`, {
      code: "INVALID_TASK_QUERY",
      status: 400,
    });
  }
  return result;
}

function workflowReference(detailUrl) {
  try {
    const url = new URL(detailUrl);
    if (url.protocol !== "https:" || !WORKFLOW_RESULT_HOSTS.has(url.hostname)) return null;
    const threadId = url.searchParams.get("threadId");
    const runId = url.searchParams.get("runId");
    return threadId && runId ? { threadId, runId } : null;
  } catch {
    return null;
  }
}

function safeTask(task = {}) {
  return {
    taskId: task.jmAiTaskId == null ? null : String(task.jmAiTaskId),
    externalTaskId: task.taskId == null ? null : String(task.taskId),
    name: task.name || "",
    serviceCode: task.bizCode || "",
    serviceName: task.bizName || "",
    source: task.source || "",
    scheduled: Number(task.scheduled || 0) === 1,
    state: task.state ?? null,
    stateName: task.stateName || "",
    createdAt: task.created ?? null,
    modifiedAt: task.modified ?? null,
    workflow: workflowReference(task.detailUrl),
  };
}

export class TaskHistoryAdapter {
  constructor({ client }) {
    if (!client) throw new Error("client is required");
    this.client = client;
  }

  async list(input = {}) {
    const currentPage = positiveInteger(input.currentPage, 1, 10_000);
    const pageSize = positiveInteger(input.pageSize, 20, 100);
    const query = { currentPage, pageSize };
    if (typeof input.name === "string" && input.name.trim()) query.name = input.name.trim().slice(0, 100);
    if (input.state != null && input.state !== "") query.state = Number(input.state);
    if (input.scheduled === true || input.scheduled === 1 || input.scheduled === "1") query.scheduled = 1;
    const result = await this.client.call(operationRequest("tasks.list", { query }));
    const data = result.data || {};
    const tasks = Array.isArray(data.datas) ? data.datas.map(safeTask) : [];
    return {
      currentPage: Number(data.currentPage ?? currentPage),
      pageSize: Number(data.pageSize ?? pageSize),
      total: Number(data.total ?? tasks.length),
      totalPages: Number(data.totalPage ?? 1),
      tasks,
      traceId: result.traceId || null,
    };
  }
}
