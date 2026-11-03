# Replace the sync PR automation with a daily drift check

## Goal

**Intended outcome.** Simplify the daily job to a pure drift detector: **succeed
when eToro's published API documents are unchanged; fail, naming what changed,
when they moved.** Remove the pull-request automation entirely — the
branch/commit/push/`gh pr create` machinery never completed without manual
pre-work (the pinned baselines gate the verify inside it), so it was unreliable
complexity. The pins stay exactly as they are (per maintainer decision — they
proved their value); upstream updates become an explicit local playbook
(`acquire` → `generate` → bump pins → `verify` → commit directly to `main`).

**Observable success criteria.**

1. The scheduled/dispatched workflow run succeeds with an `unchanged: true`
   verdict while the live documents match `openapi/source-manifest.json`
   (v1.408.0 as of today).
2. A run against changed documents fails (exit 1) with a message naming each
   changed source (old → new version/hash) — verifiable by unit tests on the
   verdict logic.
3. The PR automation is gone: no `sync:swagger` script, no branch creation, no
   `gh` calls, no PR-write permissions in the workflow; `workflow:check`
   (actionlint) passes on the new yml.
4. `npm run verify` green on `main` after the change; no release, version bump,
   or changelog entry (nothing shipped in the npm tarball changes — precedent:
   `6aeda50` CI-only change).

## Scope

1. **New detector:** `scripts/lib/swagger-drift.ts` — a small pure function
   (repo's lib/script split pattern, replacing `scripts/lib/synchronization.ts`):
   given the previous `source-manifest.json` hashes and freshly acquired
   sources, return `{ changed, changes[] }` **comparing all three sources**
   (swagger, core, deprecated — stricter and more honest than the old
   swagger-only comparison: portal-document changes alter the generated
   catalog's warnings, so "the API changed" must include them); plus
   `scripts/check-swagger.ts`, a thin wrapper that downloads via the existing
   exported `downloadSource`, reads the manifest, prints the verdict JSON, and
   exits 0/1. npm script `check:swagger` replaces `sync:swagger`.
2. **Deletions:** `scripts/synchronize-swagger.ts`,
   `scripts/lib/synchronization.ts`,
   `tests/unit/swagger-synchronization.test.ts`, the `sync:swagger` npm script.
   Kept: `npm run acquire`, `npm run generate`, `npm run swagger:diff` (all
   serve the manual update playbook).
3. **Workflow:** replace `.github/workflows/swagger-sync.yml` with
   `swagger-drift.yml` — `name: Swagger drift`, same 03:17 UTC schedule,
   `workflow_dispatch` (no inputs), `timeout-minutes: 15`,
   `permissions: contents: read`, shallow checkout, Node 22 + npm cache,
   `npm ci`, `npm run check:swagger`. No git identity, no `GH_TOKEN`, no
   dry-run/artifact steps.
4. **Unit tests:** `tests/unit/swagger-drift.test.ts` covering: all-unchanged →
   pass verdict; one source changed → changed verdict naming that source with
   old/new values; missing manifest → treated as changed. Unit level, existing
   vitest infra; the wrapper script stays thin (download + print + exit).
5. **Docs:** `README.md:5` and `:131` (daily-job description → detect-and-fail
   wording); `MAINTAINERS.md` "Daily Swagger synchronization" section →
   drift-check description plus the manual update playbook; `AGENTS.md` trigger
   paragraph reworded (the job now fails with "sources changed", not a mapping
   mismatch — the announcement-check guidance itself stays).

**Non-goals.** No change to the pinned-baseline tests or the verify chain; no
change to `acquire`/`generate`/`swagger:diff` behavior; no release workflow,
tag, or npm publication; no new failure notifications (mailing/Slack etc.) —
the red `Actions` run remains the signal; no changes to historical `plan/*.md`
files (their references to "Swagger sync" are history).

**Constraints, assumptions, decisions.**

- **Detector strictness decision:** compare all three canonical hashes, not
  just Swagger. Consequence worth noting: yesterday's portal catch-up (Swagger
  unchanged, core portal re-added `getClubs`) would have failed the daily job
  under the new design — deliberately, because it changed the generated
  catalog's warnings.
- **Workflow naming decision:** rename to "Swagger drift" (new file
  `swagger-drift.yml`); the old name describes machinery that no longer exists.
  Run history under the old name remains intact.
- **No-release decision:** scripts, workflows, and the edited docs are not part
  of the npm package (`files`: dist, schemas, docs/*.md, INSTALL.md,
  THIRD_PARTY_NOTICES.md) — except README/MAINTAINERS/AGENTS which aren't
  shipped. Changelog untouched per the `6aeda50` precedent.
- `check-workflows.ts` runs plain actionlint over all yml files — no custom
  rules constrain the redesign.
- Research-verified: `downloadSource` is exported from
  `scripts/acquire-openapi.ts:39` with retry/size-limit handling — reused
  as-is; the PR flow is referenced only in the four doc/config locations listed
  in scope; nothing else imports `scripts/lib/synchronization.ts` besides the
  sync script and its test.

**Test level.** Unit: the new `tests/unit/swagger-drift.test.ts` protects the
verdict logic (the only new behavior); the wrapper stays thin
download/print/exit and is exercised end-to-end by the dispatched workflow in
task 5. Existing suites re-run via `npm run verify` at task 5.

## Tasks

| ID | Task | Completion criterion | Dependencies | Status |
|---:|---|---|---|---|
| 1 | Add the detector: `scripts/lib/swagger-drift.ts` (pure verdict function over previous manifest hashes vs acquired sources, all three sources), `scripts/check-swagger.ts` (thin wrapper: `downloadSource` ×3 → read manifest → print verdict JSON → exit 0/1), npm script `check:swagger`, and `tests/unit/swagger-drift.test.ts` covering all-unchanged / one-source-changed (named, old→new) / missing-manifest scenarios | `npx vitest run tests/unit/swagger-drift.test.ts` passes with all three scenarios collected; local `npm run check:swagger` against the unchanged live documents prints an `unchanged` verdict and exits 0 | None | Completed |
| 2 | Replace `.github/workflows/swagger-sync.yml` with `.github/workflows/swagger-drift.yml`: `name: Swagger drift`, same 03:17 UTC cron, `workflow_dispatch` without inputs, `timeout-minutes: 15`, `permissions: contents: read`, shallow checkout, Node 22 + npm cache, `npm ci`, `npm run check:swagger` — no git identity, `GH_TOKEN`, dry-run, or artifact steps | `npm run workflow:check` (actionlint) passes; the yml contains no `pull-requests` permission and no `gh`/branch logic | 1 | Completed |
| 3 | Delete the PR machinery: `scripts/synchronize-swagger.ts`, `scripts/lib/synchronization.ts`, `tests/unit/swagger-synchronization.test.ts`, and the `sync:swagger` entry in `package.json` | `grep -rn "synchronize-swagger\|synchronization" scripts tests package.json .github` returns no live references; `npm run typecheck` and `npm test` green | 1 | Completed |
| 4 | Update documentation to the new behavior: `README.md:5` and `:131` (daily job detects changes and fails; updates applied by the maintainer), `MAINTAINERS.md` "Daily Swagger synchronization" section → "Swagger drift check" plus the manual update playbook (acquire → generate → bump pins → verify → swagger:diff review → commit to main), `AGENTS.md` trigger paragraph reworded for the "sources changed" failure mode (announcement-check guidance unchanged) | Greps show no stale "opens a pull request"/"sync PR" claims outside historical `plan/*.md`; `npm run docs:check` passes | 2, 3 | Completed |
| 5 | Land on `main`: run full `npm run verify`, commit the work per repo convention (e.g. `feat:`, `ci:`, `docs:`), push, then dispatch the **Swagger drift** workflow | `npm run verify` green before push; pushed commits on `origin/main`; dispatched run completes successfully printing the `unchanged` verdict; `gh run list` shows the green run under the new workflow name | 1, 2, 3, 4 | Completed |

## Execution notes

- **Task 3 refinement (non-material):** the plan said to delete
  `tests/unit/swagger-synchronization.test.ts`, but that file also protected
  kept behavior — its "Swagger semantic diff report" and "OpenAPI download
  failure handling" describes test `swagger-diff` and `downloadSource`, and its
  workflow describe asserted the old yml. Those tests were migrated into
  `tests/unit/swagger-drift.test.ts` (verbatim, minus the old-sync assertions),
  and a new "Swagger drift workflow" describe asserts the new yml's properties
  (cron, `contents: read`, no `pull-requests`, no `NPM_TOKEN`/publish/artifacts,
  `check:swagger`). A fourth drift scenario was added beyond the planned three:
  canonical hashing ignores upstream formatting churn (carried over from the old
  suite).
- **Task 5 commit shape:** the code change (new detector + deletions + test
  migration + workflow swap) lands as one atomic commit because the old test
  file's workflow assertions depend on the old yml — splitting would leave
  intermediate commits red. Docs land as a separate `docs:` commit, the plan as
  `docs(plan):`.
