# Authorized Write Trace Evidence

Use this format only after the merchant explicitly approves one minimal live write validation. Convert the observation to field names and fixed protocol markers before saving it. Do not save raw headers, bodies, URLs, cookies, account values, product IDs, file paths, task IDs, thread IDs, run IDs, signatures, or authorization values.

Run:

```powershell
npm run trace:verify -- C:\path\to\sanitized-trace.json
```

## Main Recommendation Label

```json
{
  "schemaVersion": 1,
  "protocol": "main-recommendation-label",
  "sanitized": true,
  "request": {
    "serviceCode": "FW_GOODS-1970807",
    "bizCode": "CODE501",
    "inputCardId": "404",
    "feedbackRoot": "feedback",
    "feedbackFields": ["description", "inputValue", "collcetSkuType"]
  },
  "result": {
    "terminal": true,
    "status": "completed",
    "terminalEvent": "RUN_FINISHED",
    "resultFields": ["status", "output"]
  }
}
```

Use the observed terminal event and result field names. The example values are structural placeholders, not proof that the live protocol uses those exact result names.

## Hosting

Set `protocol` to `hosting-material` or `hosting-comment-reply`, and `action` to `start`, `update`, or `stop`. The verifier requires the action-specific allowlisted DSM operation. Record only request and response field paths, the field used to determine success, and that field's JSON type.

```json
{
  "schemaVersion": 1,
  "protocol": "hosting-material",
  "sanitized": true,
  "action": "start",
  "request": {
    "operation": "dsm.ware.manage.job.openManageJob",
    "requestFields": ["request.scopeRule", "request.materialTypes"]
  },
  "result": {
    "success": true,
    "successField": "code",
    "successValueType": "number",
    "responseFields": ["code", "data.jobId"]
  }
}
```

## Activity Signup

Record the four stages in this exact order: `upload`, `register_file`, `check_duplicate`, `create_task`. Use `HTTP_POST_UPLOAD` for the first operation so no upload URL is retained. For every stage, record only request/response field paths and the success field.

Passing this verifier proves only that the evidence is complete and sanitized. It does not enable execution by itself. Add a failing regression test, implement the fixed allowlisted adapter, require `confirm=true`, and complete a minimal authorized live validation before changing a tool to executable.
