---
name: jd-aispace-api-skill
description: Use when a JD/Jingmai merchant wants to discover, inspect, execute, or maintain AI经营中心/AISpace tools through a local API gateway without foreground browser automation, including 商品信息巡检、主图巡检、主图下载、AI商机情报 and workflow result retrieval. Do not use for consumer-side JD shopping or generic browser clicking.
---

# JD AISpace API

Use the bundled local gateway instead of clicking through the merchant UI. Keep the browser available to the user and reuse only a merchant profile the user is authorized to access.

## Choose The Operation

- List current tools with `GET /v1/services?refresh=true`.
- Search public 京麦服务市场 metadata with `GET /v1/marketplace/search?query=<name>&classify=tools`; prefer exact-name matches.
- Check whether the current account can use or request a service with `GET /v1/services/access?serviceCode=<code>`; the response omits account-specific tips.
- Inspect an allowlisted workflow with `POST /v1/workflows/inspect`.
- Run 商详信息 AI 全巡检 with `POST /v1/workflows/product-detail-inspection`.
- Run 商详主图 AI 巡检 with `POST /v1/workflows/main-image-inspection`.
- Run 商品主图批量下载 with `POST /v1/workflows/image-download`.
- Ask AI 商机情报 with `POST /v1/business-opportunity/ask`.
- Inspect 商品信息/评价回复托管 with `GET /v1/hosting/material` or `GET /v1/hosting/comment-reply`.
- Inspect 批量报名预约活动 input requirements with `GET /v1/activity-signup/schema`.
- Validate a completed activity workbook locally with `POST /v1/activity-signup/validate` before requesting authorization to upload it.
- Read an existing run with `POST /v1/workflows/result`.
- Find prior tasks and reusable workflow references with `GET /v1/tasks`.
- Use generic `POST /v1/workflows/run` only when its protocol is verified.
- Read `references/api.md` for payloads and response fields.

## Setup

1. Confirm Node.js 24+, Python 3, `pywin32`, and `cryptography` are available.
2. Prefer a stopped, dedicated Jingmai Chrome profile. A running profile can lock its Cookie database; never close the user's browser automatically.
3. Set `AISPACE_CHROME_USER_DATA_DIR`, optionally `AISPACE_CHROME_PROFILE_NAME`, and a strong `AISPACE_GATEWAY_TOKEN`.
4. Run `npm test`, then start with `npm start`.
5. Keep the gateway bound to `127.0.0.1` unless the user explicitly configures a protected network boundary.

## Execute Safely

- Require an explicit user request before task creation, authorization, ordering, or other mutations; send `confirm=true` only then.
- Treat catalog, metadata, and result replay as read-only.
- Never print, persist, commit, or return Cookies, auth codes, access contexts, tokens, account identifiers, or decrypted credentials.
- Never invoke `zeroOrFreePurchaseOrder` automatically.
- Treat public service codes as discovery metadata, not execution proof. Third-party Flow and independent applications still require an observed, authorized launch/input protocol.
- If the profile is locked, ask for a stopped or dedicated profile instead of taking over the visible browser.
- If a tool lacks a verified adapter, report metadata only. Do not guess hidden fields or claim it is executable.
- Do not execute 主推商品 AI 打标、托管启停或活动报名 until the user explicitly authorizes the specific write and its live protocol has been validated.

## Handle Long Runs

If execution returns `timedOut=true`, retain `threadId` and `runId`, then call `/v1/workflows/result`. Do not create a duplicate task merely because the first HTTP request timed out.

## Maintain For AISpace Changes

Run `npm run marketplace:check` and `npm run catalog:check` after AISpace changes. Read `references/maintenance.md` before changing adapters. Update only after behavior is observed with an authorized account, the protocol change is confirmed, and regression tests pass.
