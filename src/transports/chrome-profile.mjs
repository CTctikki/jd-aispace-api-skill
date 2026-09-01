import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { DirectHttpTransport } from "./direct-http.mjs";
import { ChromeProfileLockedError } from "../errors.mjs";

const execFileAsync = promisify(execFile);
const helperPath = fileURLToPath(new URL("../../scripts/chrome_cookie_header.py", import.meta.url));

export class ChromeProfileTransport extends DirectHttpTransport {
  constructor({
    userDataDir,
    profileName = "Default",
    python = "python",
    cookieTtlMs = 60_000,
    fetchImpl = globalThis.fetch,
    cookieLoader,
  }) {
    super({ fetchImpl });
    if (!userDataDir) throw new Error("userDataDir is required");
    this.userDataDir = userDataDir;
    this.profileName = profileName;
    this.python = python;
    this.cookieTtlMs = cookieTtlMs;
    this.cookieCache = new Map();
    this.cookieLoader = cookieLoader || ((hostname) => this.loadCookieFromProfile(hostname));
  }

  async loadCookieFromProfile(hostname = "sff.jd.com") {
    try {
      const { stdout } = await execFileAsync(
        this.python,
        [helperPath, this.userDataDir, this.profileName, hostname],
        { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      );
      return stdout.trim();
    } catch (error) {
      if (String(error.stderr || error.message).includes("unable to open database file")) {
        throw new ChromeProfileLockedError();
      }
      throw error;
    }
  }

  async cookieFor(hostname) {
    const cached = this.cookieCache.get(hostname);
    if (cached && Date.now() < cached.expiresAt) return cached.value;
    const value = await this.cookieLoader(hostname);
    if (!value) throw new Error(`Chrome profile returned no cookies for ${hostname}`);
    this.cookieCache.set(hostname, { value, expiresAt: Date.now() + this.cookieTtlMs });
    return value;
  }

  async sendStream(request) {
    const headers = new Headers(request.headers);
    headers.set("cookie", await this.cookieFor(new URL(request.url).hostname));
    return this.fetchImpl(request.url, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
      signal: request.signal,
    });
  }
}
