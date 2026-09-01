import assert from "node:assert/strict";
import test from "node:test";
import { ServiceLaunchAdapter } from "../src/adapters/service-launch.mjs";

test("service launch stops before useServiceNow when the service is inactive", async () => {
  let calls = 0;
  const adapter = new ServiceLaunchAdapter({
    client: { async call() { calls += 1; } },
    accessAdapter: {
      async inspect(serviceCode) {
        return {
          serviceCode,
          active: false,
          actions: [{ code: 8, name: "request purchase permission", supported: true }],
        };
      },
    },
  });

  await assert.rejects(() => adapter.prepare("FW_GOODS-1961214"), {
    code: "SERVICE_NOT_ACTIVE",
  });
  assert.equal(calls, 0);
});

test("service launch returns only sanitized endpoint metadata", async () => {
  let request;
  const adapter = new ServiceLaunchAdapter({
    client: { async call(value) {
      request = value;
      return {
        data: {
          code: 200,
          msg: "private launch message",
          data: {
            authFlag: true,
            url: "https://vendor.example.com/tool?sign=secret&state=account-state&mode=use",
            callbackUrl: "https://ai-market.jd.com/callback?code=secret-code",
          },
        },
      };
    } },
    accessAdapter: {
      async inspect(serviceCode) {
        return { serviceCode, active: true, actions: [] };
      },
    },
  });

  const result = await adapter.prepare("FW_GOODS-1961214");
  assert.equal(request.api, "dsm.jmmarket.remoting.dsm.service.MicroAppServiceDsmProvider.useServiceNow");
  assert.deepEqual(request.payload, { request: { serviceCode: "FW_GOODS-1961214" } });
  assert.deepEqual(result, {
    serviceCode: "FW_GOODS-1961214",
    status: "launch_ready",
    authorized: true,
    launch: {
      service: {
        origin: "https://vendor.example.com",
        queryKeys: ["mode", "sign", "state"],
      },
      callback: {
        origin: "https://ai-market.jd.com",
        queryKeys: ["code"],
      },
    },
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("account-state"), false);
  assert.equal(serialized.includes("private launch message"), false);
});

test("service launch never requests an authorization code automatically", async () => {
  const calls = [];
  const adapter = new ServiceLaunchAdapter({
    client: { async call(request) {
      calls.push(request.api);
      return {
        data: {
          code: 200,
          data: {
            authFlag: false,
            url: "https://vendor.example.com/tool?sign=secret&state=private",
            callbackUrl: "https://ai-market.jd.com/callback",
          },
        },
      };
    } },
    accessAdapter: {
      async inspect(serviceCode) {
        return {
          serviceCode,
          active: true,
          actions: [{ code: 6, name: "request use permission", supported: true }],
        };
      },
    },
  });

  const result = await adapter.prepare("FW_GOODS-1961214");
  assert.equal(result.status, "authorization_required");
  assert.equal(result.authorized, false);
  assert.deepEqual(calls, [
    "dsm.jmmarket.remoting.dsm.service.MicroAppServiceDsmProvider.useServiceNow",
  ]);
});

test("service launch maps nested business failures without returning messages", async () => {
  const adapter = new ServiceLaunchAdapter({
    client: { async call() {
      return { data: { code: "2004", msg: "account-specific details" } };
    } },
    accessAdapter: {
      async inspect(serviceCode) {
        return { serviceCode, active: true, actions: [] };
      },
    },
  });

  await assert.rejects(
    () => adapter.prepare("FW_GOODS-1961214"),
    (error) => error.code === "SERVICE_USE_NOT_ALLOWED"
      && error.details.businessCode === "2004"
      && !JSON.stringify(error).includes("account-specific details"),
  );
});
