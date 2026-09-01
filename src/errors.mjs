export class GatewayError extends Error {
  constructor(message, { code = "GATEWAY_ERROR", status = 500, details } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class AuthRequiredError extends GatewayError {
  constructor(message = "京麦登录态不可用", details) {
    super(message, { code: "AUTH_REQUIRED", status: 401, details });
  }
}

export class BusinessError extends GatewayError {
  constructor(message, { businessCode, details } = {}) {
    super(message || "京东服务返回业务错误", {
      code: "SFF_BUSINESS_ERROR",
      status: 502,
      details: { businessCode, ...details },
    });
  }
}

export class InvalidOperationError extends GatewayError {
  constructor(operation) {
    super(`不允许的操作：${operation}`, { code: "INVALID_OPERATION", status: 400 });
  }
}

export class ConfirmationRequiredError extends GatewayError {
  constructor(operation) {
    super(`操作 ${operation} 具有外部影响，需要 confirm=true`, {
      code: "CONFIRMATION_REQUIRED",
      status: 409,
    });
  }
}

export class ChromeProfileLockedError extends GatewayError {
  constructor() {
    super("Chrome profile is running; use a stopped or dedicated gateway profile", {
      code: "CHROME_PROFILE_LOCKED",
      status: 409,
    });
  }
}
