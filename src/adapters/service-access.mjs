import { GatewayError } from "../errors.mjs";
import { OPERATIONS } from "../operations.mjs";

function operationRequest(payload) {
  const operation = OPERATIONS["service.access"];
  return { appId: operation.appId, api: operation.api, payload };
}

function validateServiceCode(serviceCode) {
  const normalized = String(serviceCode || "").trim();
  if (!/^FW_GOODS-\d+$/.test(normalized)) {
    throw new GatewayError("serviceCode must use the FW_GOODS-<digits> format", {
      code: "INVALID_SERVICE_CODE",
      status: 400,
    });
  }
  return normalized;
}

export class ServiceAccessAdapter {
  constructor({ client }) {
    if (!client) throw new Error("client is required");
    this.client = client;
  }

  async inspect(serviceCode) {
    const normalized = validateServiceCode(serviceCode);
    const result = await this.client.call(operationRequest({ request: { serviceCode: normalized } }));
    const data = result.data || {};
    return {
      serviceCode: normalized,
      active: data.effectFlag === true,
      mainAccount: data.mainPinFlag === true,
      usesCurrentPurchaseFlow: data.newLogic === true,
      actions: Array.isArray(data.buttonList)
        ? data.buttonList.map((button) => ({
            code: Number.isFinite(Number(button?.code)) ? Number(button.code) : null,
            name: String(button?.name || ""),
            supported: button?.support === true,
          }))
        : [],
    };
  }
}
