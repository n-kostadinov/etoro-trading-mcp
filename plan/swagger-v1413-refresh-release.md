# Sync to eToro Swagger v1.413.0 and release v1.4.1

## Goal

**Intended outcome.** Land the manual Swagger update that the failed daily
`Swagger drift` run (`42014157078`, 2026-11-05) demands and ship it as
**v1.4.1**: re-baseline the package from eToro Swagger **v1.408.0** to
**v1.413.0** (live as of 2026-11-06) via the current manual playbook in
`MAINTAINERS.md` (direct commit to `main`, no sync PR — the sync automation was
removed in `42a6b55`), then cut the release through the existing tag-driven
Release workflow.

**Research findings the plan relies on** (verified 2026-11-06, live fetches of
all three documents + deep-diff with example values stripped):

- The real upstream change is confined to the SSO applications API: new **409
  collision response** on `POST /api/v1/sso/applications`; reworded 400
  descriptions on create/update; `GET /api/v1/sso/scopes` now documents
  **partner-reserved scopes**. **Zero operations added or removed**; publication
  surfaces consistent. The report's 159 "changed parameters" are `x-request-id`
  example-UUID churn, stable within a version.
- Portal announcements checked per `AGENTS.md`: changelog stalled at v1.393.0
  (2026-10-12); nothing covers v1.409–v1.413, and nothing resembles a withdrawal
  — coherent additive docs, not Clubs-style churn.
- Because no endpoints moved, every pinned baseline should stay valid (159 ops /
  26 toolsets / 15 deprecated / 3 sourceDeprecated / max-ID 87 / market-data 11 /
  trading-demo 23+17 / warnings `[]`). The playbook's "update the pins" step is
  expected to be a **verified no-op**, not an assumed one.

**Observable success criteria.**

1. `npm run verify` passes on `main` after the update commit and after the
   release commit.
2. A `workflow_dispatch` run of the **Swagger drift** workflow on `main`
   completes green with `unchanged: true`, superseding failure `42014157078`.
3. `npm run release:validate -- v1.4.1` prints `"valid": true` on the release
   commit; CI green on `main`.
4. Tag `v1.4.1`: Release workflow succeeds; `gh release view v1.4.1` non-draft
   with generated notes; `npm view etoro-trading-mcp@1.4.1` returns metadata
   with provenance.

**Scope.**

1. **Update commit on `main`**: force-add the approved plan; `npm run acquire`
   (v1.413.0) + `npm run generate` (regenerates `openapi/*`, `src/generated/*`,
   `docs/data/*`, `docs/tools.md`, `docs/toolsets.md`); confirm pinned baselines
   are genuinely unchanged; commit directly.
2. **Release commit on `main`**: `CHANGELOG.md` `[1.4.1] - 2026-11-06` (Changed:
   catalog refreshed v1.408.0 → v1.413.0, 159 tools / 26 toolsets unchanged;
   SSO docs enrichment noted); `package.json` + both lockfile fields → 1.4.1;
   hand-maintained version refs swept — `README.md:42,113,114,131`,
   `INSTALL.md:33,34,37,68,101,102,113`, `server.json:11,16` (count refs 159/26
   stay).
3. **Release**: push, `release:validate`, tag `v1.4.1`, push tag, monitor
   workflow, verify npm/GitHub artifacts, then the drift-workflow dispatch from
   criterion 2.

**Non-goals.** No test-pin redesign, no runtime/`src` changes beyond generated
files, no teaching the drift checker to ignore example values (a possible future
quality improvement, out of scope), no changes to the workflow files.

**Constraints, assumptions, decisions.**

- **Version 1.4.1 (patch):** upstream change is documentation-only for this
  package — no tool, toolset, or count changes. Minors were reserved for catalog
  add/remove; patch is the precedent-consistent choice.
- Same release machinery as all prior releases: tag-driven only, no local
  `npm publish`.
- Assumption: live stays v1.413.0 at execution. eToro moved v1.412→v1.413 within
  one day; `acquire` re-confirms, and if the live version moved again the diff is
  re-checked before committing — a materially different delta returns to this
  goal gate.
- No announcement corroborates the change; per `AGENTS.md` this was reviewed
  (coherent additive docs, no withdrawal signals) and is safe to proceed as a
  reviewed manual update.

**Test level.** No new tests. Task 1 exercises the existing pinned-baseline
suites (unit + integration) inside `npm run verify`; tasks 2–4 re-run the full
suite via verify/CI.

## Tasks

| ID | Task | Completion criterion | Dependencies | Status |
|---:|---|---|---|---|
| 1 | Update commit on `main`: force-add the approved plan; pre-flight the live document (expect v1.413.0); `npm run acquire`; `npm run generate`; run `npm run verify` confirming every pinned baseline held unchanged (159/26/15/3/87/11/23/17/`[]`); commit everything directly to `main` and push | Commit on `origin/main`; `docs/data/tool-catalog.json` reports `sourceVersion: v1.413.0`, 159 operations, 26 toolsets, `warnings: []`; `npm run verify` green before the commit; `git status` clean after | None | Completed |
| 2 | Release commit on `main`: dated `CHANGELOG.md` `[1.4.1] - 2026-11-06` section; `npm version --no-git-tag-version 1.4.1` (package.json + both lockfile fields); sweep hand-maintained version refs — `README.md:42,113,114,131`, `INSTALL.md:33,34,37,68,101,102,113`, `server.json:11,16` (counts 159/26 untouched); `npm run verify`; commit and push | On the release commit: `npm run verify` green; `grep` confirms no `1.4.0` remains in README/INSTALL/server.json and both lockfile fields read 1.4.1; commit on `origin/main` | 1 | Completed |
| 3 | Validate the release state: `npm run release:validate -- v1.4.1` on the release commit | Command prints `"valid": true` (tag/lockfile/changelog/registry-unpublished/main-ancestry checks pass) | 2 | Completed |
| 4 | Cut the release: wait for CI green on `main`; tag `v1.4.1` on `main` HEAD, push only the tag; monitor the Release workflow (verify → publish); verify published artifacts | Workflow run for tag `v1.4.1` succeeds; `gh release view v1.4.1` non-draft with generated notes (baseline v1.413.0, 159 ops / 26 toolsets); `npm view etoro-trading-mcp@1.4.1` returns version + `dist.attestations.provenance` (retry up to ~5 min for registry propagation) | 3 | Completed |
| 5 | Unblock the daily job signal: trigger a `workflow_dispatch` run of the Swagger drift workflow on `main` | Run completes successfully with `unchanged: true` / exit 0; `gh run list --workflow swagger-drift.yml` shows the green run superseding failure `42014157078` | 1 | Completed |

## Execution notes

- **Task 1** — pre-flight confirmed all three live documents at v1.413.0;
  `npm run acquire` + `npm run generate` changed exactly the 10 expected files;
  `npm run verify` passed with every pinned baseline held unchanged (the
  predicted verified no-op — no test edits were needed at all, unlike the
  v1.4.0 run). Committed as `68e7607`, pushed directly (maintainer bypass of
  branch protection, as the playbook's direct-to-main flow implies).
- **Task 5** — dispatch run `42258465220` printed `"unchanged": true` and
  superseded both scheduled failures (`42014157078` on 2026-11-05 and
  `42205673784` on 2026-11-06; the daily had failed again this morning before
  the update landed, as expected).
- **Task 2** — CI run on the sync commit (`42258398632`) was cancelled by the
  release push (workflow concurrency); the release commit's CI (`42258952695`,
  green) covers the identical final tree, so "CI green on main" holds.
- **Task 4** — Release workflow run `42259548619` succeeded in 1m43s; npm
  registry propagated v1.4.1 after ~45s with SLSA v1 provenance
  (`dist.attestations.provenance`). GitHub release `v1.4.1` published
  non-draft at 2026-11-06T17:14:29Z with the generated baseline notes
  (v1.413.0, SHA `79ce7ce5…`, 159 ops / 26 toolsets, surfaces consistent).
