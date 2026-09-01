# API Reference

All endpoints bind to `127.0.0.1` by default. When `AISPACE_GATEWAY_TOKEN` is set, send `Authorization: Bearer <token>`.

## Discovery

- `GET /health`: process health.
- `GET /v1/tools`: bundled 26-tool baseline. Each adapted official tool includes exact `gatewayActions` entries with `id`, `method`, `path`, `mode`, and `confirmationRequired`.
- `GET /v1/services?refresh=true`: live catalog discovery and current adapter status. Cached discovery metadata is overlaid with the installed gateway's current statuses and actions.
- `GET /v1/marketplace/search?query=工具名&classify=tools`: public read-only marketplace search. `classify` accepts `tools` or `services`.
- `GET /v1/marketplace/services/FW_GOODS-...`: public read-only service description, platform support, paradigm, and capability list. Provider identities, app keys, internal IDs, and audit fields are omitted.
- `GET /v1/services/access?serviceCode=FW_GOODS-...`: authenticated, privacy-filtered service availability and permitted action metadata.
- `POST /v1/services/resolve`: body `{ "serviceCode": "..." }`.
- `POST /v1/workflows/inspect`: body `{ "serviceCode": "..." }`.

Both tool-list responses summarize `oneClickReady`, `writePlanReady`, and `metadataOnly`. `write_plan_ready` means the gateway can inspect and validate a proposed mutation but cannot execute it. It must not be interpreted as write support.

## Service Launch Preflight

`POST /v1/services/launch` prepares the official AI Market launch context only after the service-access check reports it active. It requires:

```json
{
  "serviceCode": "FW_GOODS-1961214",
  "confirm": true
}
```

The response reports `launch_ready` or `authorization_required` and includes only endpoint origins and query-key names. It never returns the signed launch URL, callback URL, auth code, state value, or account-specific message. It never calls ordering or authorization APIs. A successful launch preflight does not prove that the vendor's own input and result protocol is supported.

## Product Detail Inspection

`POST /v1/workflows/product-detail-inspection`

```json
{
  "confirm": true,
  "input": {
    "skuIds": ["12345678901234"],
    "inspectText": "7天无理由退货",
    "terminalTypes": ["APP"],
    "locations": ["BeltImage", "Title", "ActivityTag", "ServiceTag"],
    "timeoutMs": 600000
  }
}
```

`terminalTypes` accepts `APP` and `PC`. `locations` accepts `BeltImage`, `Title`, `ActivityTag`, `ServiceTag`, `SellingPoint`, and `ProductParam`. A PC-only run does not currently support the last two locations. At most 5000 numeric SKU IDs are accepted.

The response includes `status`, `threadId`, `runId`, `summaries`, `inspectionRows`, `report`, `files`, and `timedOut`. Inspection rows contain only `skuId`, `terminal`, `location`, `matched`, and `result`.

## Main Image Inspection

`POST /v1/workflows/main-image-inspection`

```json
{
  "confirm": true,
  "input": {
    "skuIds": ["12345678901234"],
    "terminalTypes": ["APP"],
    "inspectElements": ["京喜自营"],
    "imageNumbers": [1]
  }
}
```

`terminalTypes` accepts `APP` and `PC`. `inspectElements` accepts `次日达`, `重磅新品`, and `京喜自营`. `imageNumbers` accepts 1–5 and `-1`. The response includes privacy-filtered `mainImageRows`.

## Product Image Download

`POST /v1/workflows/image-download`

```json
{
  "confirm": true,
  "input": {
    "skuIds": ["12345678901234"],
    "squareImageIndexes": [1],
    "rectangleImageIndexes": []
  }
}
```

At most 500 SKU IDs are accepted. Image indexes are 1–10 and at least one square or rectangle image must be selected. The response includes `downloadRows`, each containing the selected image URLs and download result.

## Business Opportunity

- `GET /v1/business-opportunity/questions` returns recommended questions.
- `POST /v1/business-opportunity/ask` requires `confirm=true` and body `input.query` of at most 2000 characters.
- `POST /v1/business-opportunity/result` resumes a stream with `input.traceId` and `input.groupId`.

The ask response includes `answer`, `thinking`, `traceId`, `groupId`, `status`, and `timedOut`.

## Hosting And Activity Preflight

- `GET /v1/hosting/material` returns current 商品信息托管 status and allowed settings.
- `GET /v1/hosting/comment-reply` returns current 评价回复托管 status, agreement metadata, reply tone options, and text-length options.
- `POST /v1/hosting/material/plan` validates `input.action`, `input.scopeRule`, and `input.materialTypes` against live options and returns a non-executable mutation plan.
- `POST /v1/hosting/comment-reply/plan` validates the requested action and reply settings against live options and returns a non-executable mutation plan.
- `GET /v1/activity-signup/schema` returns the current 批量预约活动报名 version, accepted input fields, and official template URL.
- `POST /v1/activity-signup/validate` accepts `{"input":{"filePath":"C:\\\\path\\\\activity.xlsx"}}` and validates the official POP商家/自营供应商 worksheets locally. It returns only row counts and error locations, never SKU/SPU values.
- `POST /v1/activity-signup/plan` accepts the same local file input, validates it, resolves the current app schema, and returns the four confirmed phases: upload, register file, duplicate check, and task creation. It omits the local path and workbook contents.
- `POST /v1/workflows/main-recommendation-label/plan` validates up to 1000 SKU IDs and returns the confirmed workflow/card metadata plus SKU count without creating a workflow run.

All plan endpoints are read-only and return `executionEnabled=false` with `status=live_write_validation_required`. Starting or changing continuous hosting, submitting activity registrations, and 主推商品 AI 打标 remain disabled until an authorized merchant explicitly approves a live write validation.

## Result Replay

`POST /v1/workflows/result` is read-only and does not require `confirm=true`.

## Task History

`GET /v1/tasks` lists sanitized AI Space tasks. Optional query parameters are `currentPage`, `pageSize` (maximum 100), `name`, `state`, and `scheduled=1`. For supported workflow detail URLs, each row includes a `workflow` object containing the `threadId` and `runId` needed by the result replay endpoint. Creator and modifier identities are omitted.

```json
{
  "serviceCode": "FW_GOODS-1968206",
  "input": {
    "threadId": "returned-thread-id",
    "runId": "returned-run-id",
    "timeoutMs": 30000
  }
}
```

Use replay after a timeout. Do not submit the original task again unless the user explicitly requests a duplicate run.

## Generic Workflow

`POST /v1/workflows/run` exposes the allowlisted AG-UI transport and requires `confirm=true`. Use it only for a workflow whose form and resume protocol are already validated. Do not pass arbitrary workflow IDs or endpoints.
