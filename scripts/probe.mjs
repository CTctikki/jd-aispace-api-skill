import { AiSpaceGateway } from "../src/gateway.mjs";
import { SffClient } from "../src/sff-client.mjs";
import { DirectHttpTransport } from "../src/transports/direct-http.mjs";
import { ChromeProfileTransport } from "../src/transports/chrome-profile.mjs";

const transport = process.env.AISPACE_CHROME_USER_DATA_DIR
  ? new ChromeProfileTransport({
      userDataDir: process.env.AISPACE_CHROME_USER_DATA_DIR,
      profileName: process.env.AISPACE_CHROME_PROFILE_NAME || "Default",
      python: process.env.AISPACE_PYTHON || "python",
    })
  : new DirectHttpTransport({
      cookie: process.env.AISPACE_COOKIE || "",
      dsmEid: process.env.AISPACE_DSM_EID || "",
    });

const gateway = new AiSpaceGateway({
  client: new SffClient({ transport }),
});

try {
  const result = await gateway.resolveService("FW_GOODS-1970202");
  const service = result.data || {};
  console.log(JSON.stringify({
    ok: true,
    service: {
      serviceCode: service.serviceCode,
      serviceName: service.serviceName,
      paradigm: service.aiSpaceToolParadigm,
      publishSource: service.publishSource,
      hasJmAiTerminal: service.hasJmAiTerminal,
      openInAiSpace: service.openInAiSpace,
    },
    traceId: result.traceId,
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    error: { code: error.code, message: error.message, details: error.details },
  }, null, 2));
  process.exitCode = error.code === "AUTH_REQUIRED" ? 2 : 1;
}
