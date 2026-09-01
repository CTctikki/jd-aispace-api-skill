import { loadConfig } from "./config.mjs";
import { AiSpaceGateway } from "./gateway.mjs";
import { createServer } from "./server.mjs";
import { SffClient } from "./sff-client.mjs";
import { ServiceCatalog } from "./service-catalog.mjs";
import { WorkflowToolAdapter } from "./adapters/workflow-tools.mjs";
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
const gateway = new AiSpaceGateway({
  client,
  catalog: new ServiceCatalog({
    client,
    cachePath: config.catalogPath,
    cacheTtlMs: config.catalogTtlMs,
  }),
  workflowAdapter: new WorkflowToolAdapter({ client, transport }),
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
