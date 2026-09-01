import http from "node:http";
import { GatewayError } from "./errors.mjs";

const MAX_BODY_BYTES = 1024 * 1024;

function sendJson(response, status, body) {
  const encoded = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": encoded.length,
    "cache-control": "no-store",
  });
  response.end(encoded);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new GatewayError("请求体过大", { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new GatewayError("请求体不是有效 JSON", { status: 400 });
  }
}

function authorized(request, token) {
  if (!token) return true;
  return request.headers.authorization === `Bearer ${token}`;
}

export function createServer({ gateway, token = "" }) {
  return http.createServer(async (request, response) => {
    try {
      if (!authorized(request, token)) {
        return sendJson(response, 401, { error: { code: "UNAUTHORIZED" } });
      }
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, { ok: true, service: "aispace-api-gateway" });
      }
      if (request.method === "GET" && url.pathname === "/v1/tools") {
        return sendJson(response, 200, gateway.getRegistry());
      }
      if (request.method === "POST" && url.pathname === "/v1/operations/call") {
        const body = await readJson(request);
        const result = await gateway.callOperation(
          body.operation,
          body.payload || {},
          { confirm: body.confirm === true },
        );
        return sendJson(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/v1/services/resolve") {
        const body = await readJson(request);
        const result = await gateway.resolveService(body.serviceCode);
        return sendJson(response, 200, result);
      }
      if (request.method === "GET" && url.pathname === "/v1/services") {
        const result = await gateway.discoverServices({
          refresh: url.searchParams.get("refresh") === "true",
        });
        return sendJson(response, 200, result);
      }
      if (request.method === "GET" && url.pathname === "/v1/tasks") {
        const result = await gateway.listTasks({
          currentPage: url.searchParams.get("currentPage"),
          pageSize: url.searchParams.get("pageSize"),
          name: url.searchParams.get("name"),
          state: url.searchParams.get("state"),
          scheduled: url.searchParams.get("scheduled"),
        });
        return sendJson(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/v1/workflows/inspect") {
        const body = await readJson(request);
        const result = await gateway.inspectWorkflow(body.serviceCode);
        return sendJson(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/v1/workflows/run") {
        const body = await readJson(request);
        const result = await gateway.runWorkflow(
          body.serviceCode,
          body.input || {},
          { confirm: body.confirm === true },
        );
        return sendJson(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/v1/workflows/product-detail-inspection") {
        const body = await readJson(request);
        const result = await gateway.runProductDetailInspection(
          body.input || {},
          { confirm: body.confirm === true },
        );
        return sendJson(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/v1/workflows/main-image-inspection") {
        const body = await readJson(request);
        const result = await gateway.runMainImageInspection(
          body.input || {},
          { confirm: body.confirm === true },
        );
        return sendJson(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/v1/workflows/image-download") {
        const body = await readJson(request);
        const result = await gateway.runImageDownload(
          body.input || {},
          { confirm: body.confirm === true },
        );
        return sendJson(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/v1/workflows/result") {
        const body = await readJson(request);
        const result = await gateway.readWorkflowRun(body.serviceCode, body.input || {});
        return sendJson(response, 200, result);
      }
      if (request.method === "GET" && url.pathname === "/v1/business-opportunity/questions") {
        const result = await gateway.listBusinessOpportunityQuestions();
        return sendJson(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/v1/business-opportunity/ask") {
        const body = await readJson(request);
        const result = await gateway.askBusinessOpportunity(
          body.input || {},
          { confirm: body.confirm === true },
        );
        return sendJson(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/v1/business-opportunity/result") {
        const body = await readJson(request);
        const result = await gateway.readBusinessOpportunityTrace(body.input || {});
        return sendJson(response, 200, result);
      }
      if (request.method === "GET" && url.pathname === "/v1/hosting/material") {
        return sendJson(response, 200, await gateway.inspectHosting("material"));
      }
      if (request.method === "GET" && url.pathname === "/v1/hosting/comment-reply") {
        return sendJson(response, 200, await gateway.inspectHosting("comment-reply"));
      }
      if (request.method === "GET" && url.pathname === "/v1/activity-signup/schema") {
        return sendJson(response, 200, await gateway.inspectActivitySignup());
      }
      if (request.method === "POST" && url.pathname === "/v1/activity-signup/validate") {
        const body = await readJson(request);
        return sendJson(response, 200, await gateway.validateActivitySignupFile(body.input || {}));
      }
      return sendJson(response, 404, { error: { code: "NOT_FOUND" } });
    } catch (error) {
      const status = error instanceof GatewayError ? error.status : 500;
      sendJson(response, status, {
        error: {
          code: error.code || "INTERNAL_ERROR",
          message: error.message,
          details: error.details,
        },
      });
    }
  });
}
