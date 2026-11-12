# Sync to eToro Swagger v1.415.0 and release v1.4.2

## Goal

**Intended outcome.** Land the manual Swagger update that the failed daily
`Swagger drift` run (`43205564337`, 2026-11-12) demands and ship it as
**v1.4.2**: re-baseline the package from eToro Swagger **v1.413.0** to
**v1.415.0** via the manual playbook in `MAINTAINERS.md` (direct commit to
`main`, no sync PR), cut the release through the existing tag-driven Release
workflow, and unblock the daily job signal with a green `workflow_dispatch`
drift run.

**Research findings the plan relies on** (verified 2026-11-12, live fetches of
all three documents + deep-diff with example values stripped):

- The entire upstream delta v1.413.0 → v1.415.0 is `info.version` + regenerated
  `x-request-id` example UUIDs repeated across every operation. **Zero
  operations added or removed; zero component schema changes**; with `example`
  fields stripped and keys sorted, all three documents are identical except
  `info.version`. Publication surfaces consistent (Swagger UI, core portal,
  deprecated portal).
- Portal announcements checked per `AGENTS.md`: the Core API changelog stops at
  v1.393.0 (2026-10-12); nothing covers v1.414/v1.415 and nothing resembles a
  withdrawal — safe to proceed as a reviewed manual update (same reasoning
  recorded for the v1.413.0 sync in `plan/swagger-v1413-refresh-release.md`).
- Because no endpoints moved, every pinned baseline should stay valid (159 ops /
  26 toolsets / 15 deprecated / `warnings: []` pinned in
  `tests/unit/generated-catalog.test.ts`, `tests/unit/compile-tool-catalog.test.ts`,
  `tests/unit/cli-inspection.test.ts`, `tests/integration/stdio-contract.test.ts`).
  The playbook's "update the pins" step is expected to be a **verified no-op**,
  not an assumed one.
- Hand-maintained version refs to sweep on release: `README.md:42,113,114,131`
  (line 131 also names Swagger `v1.413.0` → `v1.415.0`),
  `INSTALL.md:33,34,37,68,101,102,113`, `server.json:11,16`.
- Risk noted: local `npm run acquire` uses plain `fetch`
  (`scripts/acquire-openapi.ts:51-53`); the api-portal 403'd curl's default UA
  earlier today. If local acquire is blocked, a throwaway script outside the
  repo reusing `downloadSource` with a browser-UA fetch writes the same
  canonical outputs — no repo changes.

**Observable success criteria.**

1. `npm run verify` passes on `main` after the update commit and after the
   release commit.
2. A `workflow_dispatch` run of the **Swagger drift** workflow on `main`
   completes green with `unchanged: true`, superseding failure `43205564337`.
3. `npm run release:validate -- v1.4.2` prints `"valid": true` on the release
   commit; CI green on `main`.
4. Tag `v1.4.2`: Release workflow succeeds; `gh release view v1.4.2` non-draft
   with generated notes; `npm view etoro-trading-mcp@1.4.2` returns metadata
   with provenance.

**Scope.**

1. **Update commit on `main`**: write/force-add the approved plan; pre-flight
   the three live documents (expect v1.415.0); `npm run acquire` +
   `npm run generate` (regenerates `openapi/*`, `src/generated/*`,
   `docs/data/*`, `docs/tools.md`, `docs/toolsets.md`); confirm pinned baselines
   are genuinely unchanged; commit directly.
2. **Release commit on `main`**: dated `CHANGELOG.md` `[1.4.2] - 2026-11-12`
   section (Changed: catalog refreshed v1.413.0 → v1.415.0, 159 tools / 26
   toolsets unchanged; upstream delta is version bump + example-value
   regeneration only); `npm version --no-git-tag-version 1.4.2` (package.json +
   both lockfile fields); sweep hand-maintained version refs.
3. **Release**: wait for CI green, `release:validate`, tag `v1.4.2`, push only
   the tag, monitor workflow, verify npm/GitHub artifacts.
4. **Drift signal**: `workflow_dispatch` the Swagger drift workflow; delete the
   local `tmp-swagger-v1.415.0` download dir as housekeeping.

**Non-goals.** No runtime/`src` changes beyond generated files, no test-pin
redesign, no workflow-file changes, no teaching the drift checker to ignore
example values (a possible future quality improvement, out of scope).

**Constraints, assumptions, decisions.**

- **Version 1.4.2 (patch):** upstream change is documentation-only for this
  package — no tool, toolset, or count changes. Patch is the
  precedent-consistent choice (v1.4.1 shipped for an equally cosmetic sync).
- Same release machinery as all prior releases: tag-driven only, no local
  `npm publish`.
- Assumption: live stays v1.415.0 at execution. `acquire` re-confirms, and if
  the live version moved again the diff is re-checked before committing — a
  materially different delta returns to the goal gate.
- No announcement corroborates the change; per `AGENTS.md` this was reviewed
  (version bump + example regeneration, no withdrawal signals) and is safe to
  proceed as a reviewed manual update.

**Test level.** No new tests. Task 1 exercises the existing pinned-baseline
suites (unit + integration) inside `npm run verify`; tasks 2–4 re-run the full
suite via verify/CI.

## Tasks

| ID | Task | Completion criterion | Dependencies | Status |
|---:|---|---|---|---|
| 1 | Sync commit on `main`: write/force-add the approved plan file; pre-flight the three live documents (expect v1.415.0 — if the live version moved again, re-diff before proceeding); `npm run acquire`; `npm run generate` (regenerates `openapi/*`, `src/generated/*`, `docs/data/*`, `docs/tools.md`, `docs/toolsets.md`); `npm run verify` confirming every pinned baseline held unchanged (159 ops / 26 toolsets / 15 deprecated / `warnings: []`); commit directly to `main` and push | Commit on `origin/main`; `docs/data/tool-catalog.json` reports `sourceVersion: v1.415.0`, 159 operations, 26 toolsets, `warnings: []`; `npm run verify` green before the commit; `git status` clean after | None | Completed |
| 2 | Release commit on `main`: dated `CHANGELOG.md` `[1.4.2] - 2026-11-12` section (Changed: catalog refreshed v1.413.0 → v1.415.0, 159 tools / 26 toolsets unchanged; upstream delta is version bump + example-value regeneration only); `npm version --no-git-tag-version 1.4.2` (package.json + both lockfile fields); sweep hand-maintained refs — `README.md:42,113,114,131` (131 also v1.413.0 → v1.415.0), `INSTALL.md:33,34,37,68,101,102,113`, `server.json:11,16`; `npm run verify`; commit and push | On the release commit: `npm run verify` green; grep confirms no `1.4.1` remains in README/INSTALL/server.json, both lockfile fields read 1.4.2, and README references Swagger v1.415.0; commit on `origin/main` | 1 | Pending |
| 3 | Validate the release state: `npm run release:validate -- v1.4.2` on the release commit | Command prints `"valid": true` (tag/lockfile/changelog/registry-unpublished/main-ancestry checks pass) | 2 | Pending |
| 4 | Cut the release: wait for CI green on `main`; tag `v1.4.2` on `main` HEAD, push only the tag; monitor the Release workflow (verify → publish); verify published artifacts | Workflow run for tag `v1.4.2` succeeds; `gh release view v1.4.2` non-draft with generated notes (baseline v1.415.0, 159 ops / 26 toolsets); `npm view etoro-trading-mcp@1.4.2` returns version + `dist.attestations.provenance` (retry up to ~5 min for registry propagation) | 3 | Pending |
| 5 | Unblock the daily job signal: trigger a `workflow_dispatch` run of the Swagger drift workflow on `main`; housekeeping: delete the local `tmp-swagger-v1.415.0` download dir | Run completes successfully with `unchanged: true` / exit 0; `gh run list --workflow swagger-drift.yml` shows the green run superseding failure `43205564337`; temp dir gone | 1 | Pending |
