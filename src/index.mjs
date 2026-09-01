import { loadConfig } from "./config.mjs";
import { AiSpaceGateway } from "./gateway.mjs";
import { createServer } from "./server.mjs";
import { SffClient } from "./sff-client.mjs";
import { ServiceCatalog } from "./service-catalog.mjs";
import { WorkflowToolAdapter } from "./adapters/workflow-tools.mjs";
import { BusinessOpportunityAdapter } from "./adapters/business-opportunity.mjs";
import { ActivitySignupAdapter } from "./adapters/activity-signup.mjs";
import { HostingAdapter } from "./adapters/hosting.mjs";
import { TaskHistoryAdapter } from "./adapters/tasks.mjs";
import { MarketplaceSearchAdapter } from "./adapters/marketplace-search.mjs";
import { ServiceAccessAdapter } from "./adapters/service-access.mjs";
import { ServiceLaunchAdapter } from "./adapters/service-launch.mjs";
import { DirectHttpTransport } from "./transports/direct-http.mjs";
import { HttpBridgeTransport } from "./transports/http-bridge.mjs";
import { ChromeProfileTransport } from "./transports/chrome-profile.mjs";

const config = loadConfig();
const transport = config.bridgeUrl
  ? new HttpBridgeTransport({ bridgeUrl: config.bridgeUrl, token: config.bridgeToken })
  : config.chromeUserDataDir
    ? new ChromeProfileTransport({
        userDataDir: config.chromeUserDataDir,
        profileName: config.chromeProfileName,
        python: config.python,
      })
    : new DirectHttpTransport({ cookie: config.cookie, dsmEid: config.dsmEid });
const client = new SffClient({ transport });
const publicMarketplaceClient = new SffClient({ transport: new DirectHttpTransport() });
const serviceAccessAdapter = new ServiceAccessAdapter({ client });
const gateway = new AiSpaceGateway({
  client,
  catalog: new ServiceCatalog({
    client,
    cachePath: config.catalogPath,
    cacheTtlMs: config.catalogTtlMs,
    resolveConcurrency: config.serviceResolveConcurrency,
    resolveDelayMs: config.serviceResolveDelayMs,
    resolveRetryDelayMs: config.serviceResolveRetryDelayMs,
  }),
  workflowAdapter: new WorkflowToolAdapter({ client, transport }),
  businessOpportunityAdapter: new BusinessOpportunityAdapter({ client, transport }),
  hostingAdapter: new HostingAdapter({ client }),
  activitySignupAdapter: new ActivitySignupAdapter({ client }),
  taskHistoryAdapter: new TaskHistoryAdapter({ client }),
  marketplaceSearchAdapter: new MarketplaceSearchAdapter({ client: publicMarketplaceClient }),
  serviceAccessAdapter,
  serviceLaunchAdapter: new ServiceLaunchAdapter({ client, accessAdapter: serviceAccessAdapter }),
});
const server = createServer({ gateway, token: config.token });

server.listen(config.port, config.host, () => {
  console.log(`AISpace API Gateway listening on http://${config.host}:${config.port}`);
  const transportName = config.bridgeUrl
    ? "browser-bridge"
    : config.chromeUserDataDir
      ? "chrome-profile"
      : "direct-http";
  console.log(`Transport: ${transportName}`);
});
