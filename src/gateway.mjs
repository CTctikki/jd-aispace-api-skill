import { ConfirmationRequiredError, InvalidOperationError } from "./errors.mjs";
import { OPERATIONS } from "./operations.mjs";
import { TOOL_REGISTRY, summarizeTools } from "./tool-registry.mjs";

export class AiSpaceGateway {
  constructor({ client, catalog = null, workflowAdapter = null }) {
    this.client = client;
    this.catalog = catalog;
    this.workflowAdapter = workflowAdapter;
  }

  getRegistry() {
    return { summary: summarizeTools(), tools: TOOL_REGISTRY };
  }

  async callOperation(operationName, payload = {}, { confirm = false } = {}) {
    const operation = OPERATIONS[operationName];
    if (!operation) throw new InvalidOperationError(operationName);
    if (operation.effect !== "read" && !confirm) {
      throw new ConfirmationRequiredError(operationName);
    }
    return this.client.call({
      appId: operation.appId,
      api: operation.api,
      payload,
    });
  }

  resolveService(serviceCode) {
    return this.callOperation("service.resolve", { request: { serviceCode } });
  }

  discoverServices(options) {
    if (this.catalog === null) throw new Error("service catalog is not configured");
    return this.catalog.discover(options);
  }

  inspectWorkflow(serviceCode) {
    if (this.workflowAdapter === null) throw new Error("workflow adapter is not configured");
    return this.workflowAdapter.inspect(serviceCode);
  }

  async runWorkflow(serviceCode, input, { confirm = false } = {}) {
    if (!confirm) throw new ConfirmationRequiredError("workflow.run");
    if (this.workflowAdapter === null) throw new Error("workflow adapter is not configured");
    return this.workflowAdapter.run(serviceCode, input);
  }

  async runProductDetailInspection(input, { confirm = false } = {}) {
    if (!confirm) throw new ConfirmationRequiredError("workflow.product-detail-inspection");
    if (this.workflowAdapter === null) throw new Error("workflow adapter is not configured");
    return this.workflowAdapter.runProductDetailInspection(input);
  }

  readWorkflowRun(serviceCode, input) {
    if (this.workflowAdapter === null) throw new Error("workflow adapter is not configured");
    return this.workflowAdapter.readRun(serviceCode, input);
  }

  prepareServiceLaunch(serviceCode, { confirm = false } = {}) {
    return this.callOperation(
      "service.use",
      { request: { serviceCode } },
      { confirm },
    );
  }
}
