---
name: jd-aispace-api-skill
description: Use when a JD/Jingmai merchant wants to discover, inspect, execute, or maintain AI经营中心/AISpace tools through a local API gateway without foreground browser automation, including 商详信息AI全巡检 and workflow result retrieval. Do not use for consumer-side JD shopping or generic browser clicking.
---

# JD AISpace API

Use the bundled local gateway instead of clicking through the merchant UI. Keep the browser available to the user and reuse only a merchant profile the user is authorized to access.

## Choose The Operation

- List current tools with `GET /v1/services?refresh=true`.
- Inspect an allowlisted workflow with `POST /v1/workflows/inspect`.
- Run 商详信息 AI 全巡检 with `POST /v1/workflows/product-detail-inspection`.
- Read an existing run with `POST /v1/workflows/result`.
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
- If the profile is locked, ask for a stopped or dedicated profile instead of taking over the visible browser.
- If a tool lacks a verified adapter, report metadata only. Do not guess hidden fields or claim it is executable.

## Handle Long Runs

If execution returns `timedOut=true`, retain `threadId` and `runId`, then call `/v1/workflows/result`. Do not create a duplicate task merely because the first HTTP request timed out.

## Maintain For AISpace Changes

Run `npm run catalog:check` after AISpace changes. Read `references/maintenance.md` before changing adapters. Update only after behavior is observed with an authorized account, the protocol change is confirmed, and regression tests pass.
