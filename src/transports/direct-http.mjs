export class DirectHttpTransport {
  constructor({ fetchImpl = globalThis.fetch, cookie = "", dsmEid = "" } = {}) {
    this.fetchImpl = fetchImpl;
    this.cookie = cookie;
    this.dsmEid = dsmEid;
  }

  async send(request) {
    const response = await this.sendStream(request);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { code: response.status, msg: text || response.statusText };
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data,
    };
  }

  async sendStream(request) {
    const headers = new Headers(request.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    if (this.dsmEid) headers.set("dsm-eid", this.dsmEid);
    return this.fetchImpl(request.url, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
      signal: request.signal,
    });
  }
}
