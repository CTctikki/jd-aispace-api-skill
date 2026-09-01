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
