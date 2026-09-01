import { GatewayError } from "../errors.mjs";
import { OPERATIONS } from "../operations.mjs";
import { validateServiceCode } from "./service-access.mjs";

function operationRequest(payload) {
  const operation = OPERATIONS["service.use"];
  return { appId: operation.appId, api: operation.api, payload };
}

function summarizeEndpoint(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return {
      origin: url.origin,
      queryKeys: [...new Set(url.searchParams.keys())].sort(),
    };
  } catch {
    return null;
  }
}

export class ServiceLaunchAdapter {
  constructor({ client, accessAdapter }) {
    if (!client) throw new Error("client is required");
    if (!accessAdapter) throw new Error("accessAdapter is required");
    this.client = client;
    this.accessAdapter = accessAdapter;
  }

  async prepare(serviceCode) {
    const normalized = validateServiceCode(serviceCode);
    const access = await this.accessAdapter.inspect(normalized);
    if (!access.active) {
      throw new GatewayError("Service is not active for the current account", {
        code: "SERVICE_NOT_ACTIVE",
        status: 409,
        details: {
          serviceCode: normalized,
          actionCodes: access.actions.map((action) => action.code).filter(Number.isFinite),
        },
      });
    }

    const result = await this.client.call(operationRequest({ request: { serviceCode: normalized } }));
    const envelope = result.data || {};
    const businessCode = String(envelope.code ?? "");
    if (businessCode !== "200") {
      throw new GatewayError("Service launch preparation failed", {
        code: businessCode === "2004" ? "SERVICE_USE_NOT_ALLOWED" : "SERVICE_LAUNCH_FAILED",
        status: businessCode === "2004" ? 409 : 502,
        details: { businessCode },
      });
    }

    const launch = envelope.data || {};
    const authorized = launch.authFlag === true;
    return {
      serviceCode: normalized,
      status: authorized ? "launch_ready" : "authorization_required",
      authorized,
      launch: {
        service: summarizeEndpoint(launch.url),
        callback: summarizeEndpoint(launch.callbackUrl),
      },
    };
  }
}
