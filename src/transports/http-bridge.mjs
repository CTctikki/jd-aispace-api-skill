export class HttpBridgeTransport {
  constructor({ bridgeUrl, token = "", fetchImpl = globalThis.fetch }) {
    if (!bridgeUrl) throw new Error("bridgeUrl is required");
    this.bridgeUrl = bridgeUrl.replace(/\/$/, "");
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async send(request) {
    const headers = { "content-type": "application/json" };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const response = await this.fetchImpl(`${this.bridgeUrl}/v1/browser-fetch`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Browser bridge request failed");
    return data;
  }
}
