import { ConfirmationRequiredError, InvalidOperationError } from "./errors.mjs";
import { OPERATIONS } from "./operations.mjs";
import { TOOL_REGISTRY, summarizeTools } from "./tool-registry.mjs";

export class AiSpaceGateway {
  constructor({
    client,
    catalog = null,
    workflowAdapter = null,
    businessOpportunityAdapter = null,
    hostingAdapter = null,
    activitySignupAdapter = null,
    taskHistoryAdapter = null,
    marketplaceSearchAdapter = null,
    marketplaceDetailAdapter = null,
    serviceAccessAdapter = null,
    serviceLaunchAdapter = null,
  }) {
    this.client = client;
    this.catalog = catalog;
    this.workflowAdapter = workflowAdapter;
    this.businessOpportunityAdapter = businessOpportunityAdapter;
    this.hostingAdapter = hostingAdapter;
    this.activitySignupAdapter = activitySignupAdapter;
    this.taskHistoryAdapter = taskHistoryAdapter;
    this.marketplaceSearchAdapter = marketplaceSearchAdapter;
    this.marketplaceDetailAdapter = marketplaceDetailAdapter;
    this.serviceAccessAdapter = serviceAccessAdapter;
    this.serviceLaunchAdapter = serviceLaunchAdapter;
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

  searchMarketplace(input) {
    if (this.marketplaceSearchAdapter === null) throw new Error("marketplace search adapter is not configured");
    return this.marketplaceSearchAdapter.search(input);
  }

  inspectMarketplaceService(serviceCode) {
    if (this.marketplaceDetailAdapter === null) throw new Error("marketplace detail adapter is not configured");
    return this.marketplaceDetailAdapter.inspect(serviceCode);
  }

  inspectServiceAccess(serviceCode) {
    if (this.serviceAccessAdapter === null) throw new Error("service access adapter is not configured");
    return this.serviceAccessAdapter.inspect(serviceCode);
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

  async runMainImageInspection(input, { confirm = false } = {}) {
    if (!confirm) throw new ConfirmationRequiredError("workflow.main-image-inspection");
    if (this.workflowAdapter === null) throw new Error("workflow adapter is not configured");
    return this.workflowAdapter.runMainImageInspection(input);
  }

  async runImageDownload(input, { confirm = false } = {}) {
    if (!confirm) throw new ConfirmationRequiredError("workflow.image-download");
    if (this.workflowAdapter === null) throw new Error("workflow adapter is not configured");
    return this.workflowAdapter.runImageDownload(input);
  }

  readWorkflowRun(serviceCode, input) {
    if (this.workflowAdapter === null) throw new Error("workflow adapter is not configured");
    return this.workflowAdapter.readRun(serviceCode, input);
  }

  listBusinessOpportunityQuestions() {
    if (this.businessOpportunityAdapter === null) throw new Error("business opportunity adapter is not configured");
    return this.businessOpportunityAdapter.listQuestions();
  }

  async askBusinessOpportunity(input, { confirm = false } = {}) {
    if (!confirm) throw new ConfirmationRequiredError("business-opportunity.ask");
    if (this.businessOpportunityAdapter === null) throw new Error("business opportunity adapter is not configured");
    return this.businessOpportunityAdapter.ask(input);
  }

  readBusinessOpportunityTrace(input) {
    if (this.businessOpportunityAdapter === null) throw new Error("business opportunity adapter is not configured");
    return this.businessOpportunityAdapter.readTrace(input);
  }

  inspectHosting(type) {
    if (this.hostingAdapter === null) throw new Error("hosting adapter is not configured");
    return this.hostingAdapter.inspect(type);
  }

  inspectActivitySignup() {
    if (this.activitySignupAdapter === null) throw new Error("activity signup adapter is not configured");
    return this.activitySignupAdapter.inspect();
  }

  validateActivitySignupFile(input) {
    if (this.activitySignupAdapter === null) throw new Error("activity signup adapter is not configured");
    return this.activitySignupAdapter.validateFile(input);
  }

  listTasks(input) {
    if (this.taskHistoryAdapter === null) throw new Error("task history adapter is not configured");
    return this.taskHistoryAdapter.list(input);
  }

  async prepareServiceLaunch(serviceCode, { confirm = false } = {}) {
    if (!confirm) throw new ConfirmationRequiredError("service.launch");
    if (this.serviceLaunchAdapter === null) throw new Error("service launch adapter is not configured");
    return this.serviceLaunchAdapter.prepare(serviceCode);
  }
}
