# Dependency review — 12 November 2026

`npm audit --json` reports seven moderate findings, all in development dependencies. `npm audit --omit=dev --json` reports zero findings. The seven findings represent one underlying advisory and its dependency chain, not seven independent vulnerabilities:

- `typescript-eslint` (direct dev dependency).
- `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `@typescript-eslint/type-utils`, `@typescript-eslint/typescript-estree`, and `@typescript-eslint/utils` (transitive dev dependencies).
- `minimatch` 10.2.6 under `@typescript-eslint/typescript-estree` (transitive dev dependency).

The [minimatch advisory GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) describes excessive CPU/memory use from attacker-controlled glob patterns with optimization level 2 or higher. Patched release: 11.0.1. For this app, the affected chain runs in lint tooling, not in the browser production bundle. Avoid accepting untrusted lint glob configuration; the current configuration uses repository-defined patterns.

Registry inspection confirmed the latest `typescript-eslint` is 8.72.2 and its ESTree package still requires `minimatch ^10.2.2`. No clearly compatible fix is available in that range. `npm audit fix --dry-run` left the seven findings unresolved. Audit suggested an out-of-range move to typescript-eslint 8.36.0; this was not applied. A minimatch 11 override crosses a major version and requires a separate compatibility decision. No force upgrade, override, or dependency change was made. Recheck when upstream adopts a patched minimatch release.

Validation of the visual shell: typecheck, lint, and production build passed. Browser checks must be reported separately from these static checks.
