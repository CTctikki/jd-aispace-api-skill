# Repository Guidance

## Security

- Never commit Cookies, auth codes, access-context payloads, tokens, merchant identifiers, task IDs, real SKU data, downloaded reports, or local profile paths.
- Keep mutating operations behind `confirm=true` and keep workflow IDs, service mappings, DSM methods, and report hosts allowlisted.
- Do not add an executable adapter until its request and result protocol have been observed with an authorized account and covered by regression tests.

## Maintenance

- Run `npm test` and `npm run catalog:check` before updating the public tool baseline.
- On Windows with non-ASCII Skill content, set `PYTHONUTF8=1` before running `skill-creator` Python helpers; otherwise the default GBK decoder can fail on UTF-8 `SKILL.md`.
- Treat catalog changes as discovery signals, not proof that a tool is safely executable.
