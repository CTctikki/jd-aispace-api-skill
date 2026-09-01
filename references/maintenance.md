# AISpace Adapter Maintenance

Use this process when AI 经营中心 adds a tool or changes an existing one.

## Detect Changes

1. Start the local gateway with an authorized, stopped merchant profile.
2. Run `npm run catalog:check`.
3. Review added, removed, and changed entries. Catalog changes alone do not prove execution support.

## Add Or Update An Adapter

1. Resolve the service and identify its execution mode.
2. Prefer documented or directly observed backend requests over UI automation.
3. Inspect only requests made by the official frontend under the caller's authorized account.
4. Record service code, business code, workflow version lookup, input card schema, resume shape, terminal event, and result card shape.
5. Classify every operation as read, execute, authorize, order, or another external effect.
6. Allowlist fixed service mappings and hosts. Never accept arbitrary workflow IDs, DSM method names, or report hosts from callers.
7. Add typed validation and require `confirm=true` for every mutating operation.
8. Redact access context, account identifiers, cookies, auth codes, tokens, and employee/vendor identity fields.
9. Add a failing regression test for a reproduced protocol change, then make the smallest implementation change.
10. Validate with `npm test`, `quick_validate.py`, a secret scan, and one minimal real task when authorized.

## Update The Baseline

After review and validation, run `npm run catalog:update`. Inspect the diff before committing. The baseline stores only tool metadata and must never contain runtime responses, account data, task IDs, or credentials.

## Stop Conditions

- Stop if the profile is running and locked; do not close it automatically.
- Stop if a purchase, authorization, publication, product mutation, or task creation lacks explicit user authorization.
- Stop if request fields or effects are uncertain. Keep the tool metadata-only until verified.
- Never automate `zeroOrFreePurchaseOrder`.
