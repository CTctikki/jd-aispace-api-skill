# AISpace Adapter Maintenance

Use this process when AI 经营中心 adds a tool or changes an existing one.

## Detect Changes

1. Run `npm run marketplace:check` without a login to verify exact public service-code matches. The script is deliberately rate-limited.
2. Run `npm run marketplace:details:check` without a login to detect public description, platform, paradigm, and capability-list changes for all third-party baseline tools.
3. Start the local gateway with an authorized, stopped merchant profile.
4. Run `npm run catalog:check`. Discovery checks official tools, official experts, purchased services, and published self-built Flow apps. Purchased `EXPERT` services are also mapped to their AI Space Agent metadata.
5. For a missing or renamed third-party tool, query `GET /v1/marketplace/search?query=<exact name>&classify=tools`. Accept only an exact normalized name match; similar names are not interchangeable.
6. Review added, removed, and changed entries. Catalog or public capability changes alone do not prove execution support.

The gateway resolves service metadata serially with a short delay by default because concurrent bulk resolution can return business code `201` / `20008` (rate limited) and create false `unresolved` entries. Override `AISPACE_SERVICE_RESOLVE_CONCURRENCY`, `AISPACE_SERVICE_RESOLVE_DELAY_MS`, or `AISPACE_SERVICE_RESOLVE_RETRY_DELAY_MS` only when the environment has been verified to tolerate it.

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

The official AI Market container currently resolves metadata with `queryServiceByCode`, prepares an active service with `useServiceNow`, and obtains `getMicroAppAuthCode` only after explicit authorization. Keep these stages separate. The launch response can contain signed `url`, `callbackUrl`, `code`, `state`, `fwState`, and `sign` values; never return or persist their values. Expose only sanitized endpoint metadata until the vendor protocol is independently observed and allowlisted.

## Update The Baseline

After review and validation, run `npm run marketplace:details:update` or `npm run catalog:update` for the changed source. Inspect the diff before committing. Baselines store only public or sanitized tool metadata and must never contain runtime responses, account data, task IDs, or credentials.

## Stop Conditions

- Stop if the profile is running and locked; do not close it automatically.
- Stop if a purchase, authorization, publication, product mutation, or task creation lacks explicit user authorization.
- Stop if request fields or effects are uncertain. Keep the tool metadata-only until verified.
- Never automate `zeroOrFreePurchaseOrder`.
- Never call `getMicroAppAuthCode` from launch preflight or expose a raw DSM-operation HTTP endpoint.
