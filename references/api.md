# API Reference

All endpoints bind to `127.0.0.1` by default. When `AISPACE_GATEWAY_TOKEN` is set, send `Authorization: Bearer <token>`.

## Discovery

- `GET /health`: process health.
- `GET /v1/tools`: bundled 26-tool baseline.
- `GET /v1/services?refresh=true`: live catalog discovery and adapter status.
- `POST /v1/services/resolve`: body `{ "serviceCode": "..." }`.
- `POST /v1/workflows/inspect`: body `{ "serviceCode": "..." }`.

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
- `GET /v1/hosting/comment-reply` returns current 评价回复托管 status and allowed settings.
- `GET /v1/activity-signup/schema` returns the current 批量预约活动报名 version, accepted input fields, and official template URL.

These endpoints are read-only. Starting or changing continuous hosting, submitting activity registrations, and 主推商品 AI 打标 remain disabled until an authorized merchant explicitly approves a live write validation.

## Result Replay

`POST /v1/workflows/result` is read-only and does not require `confirm=true`.

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
