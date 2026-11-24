# Sync to eToro Swagger v1.421.0 and release v1.6.0

## Goal

**Intended outcome.** Re-baseline the package from eToro Swagger v1.417.0 to
v1.421.0 via the manual playbook in `MAINTAINERS.md` (direct commit to `main`,
no sync PR). Release it as **1.6.0** through the tag-driven Release workflow,
and restore the daily job signal with a green dispatched drift run.

**Research findings the plan relies on** (verified 2026-11-24):

- The daily **Swagger drift** job did not malfunction: it fails by design when
  eToro's published API documents change. Runs `45016691884` (2026-11-22) and
  `45175215676` (2026-11-23) found all three sources at v1.419.0 instead of the
  v1.417.0 baseline shipped in 1.5.0. Upstream has moved again since: all three
  live documents are now v1.421.0, with different hashes from the failed runs.
- Of 159 operations, 151 differ from v1.417.0 only by regenerated example
  values. None were added or removed, and all three publication surfaces agree.
  The real change is one feature, identical across real and demo endpoints:
  copy-trading tools can now name the investor by username.
  - `registerCopyTrading` / `registerCopyTradingDemo`: new optional
    `parentUsername`, as an alternative to `parentCID`.
  - `checkCopyTradingEligibility` / `checkCopyTradingEligibilityDemo`:
    `parentCID` no longer required; new optional `parentUsername`.
  - `closeCopyTrading` / `closeCopyTradingDemo`: `mirrorID` no longer
    required; new optional `parentCID` and `parentUsername`.
  - `closeCopyTradingViaPost` / `closeCopyTradingViaPostDemo`: same as the
    previous entry, for the JSON-body binding.
  - All eight also document a new `404` response and carry reworded `400` text
    and descriptions.
- Simulated regeneration: the catalog compiler was run against the live
  documents without touching the checkout. The catalog stays at 159 tools,
  26 toolsets, 15 legacy, 17 real-money mutations, `warnings: []`, and no
  tool's classification moves.
- Announcements (required by `AGENTS.md`): the Core changelog still ends Oct 12
  (v1.393.0) and the Partners changelog ends Nov 11 (v1.415.0, Partners-only
  silent login). Neither announces nor contradicts this change.
- Corroboration: the portal's own reference pages for register, close and
  eligibility already document `parentUsername`. The v1.417.0 error schema
  already described "400, 404 and 500 statuses".
- Caveat: eToro is publishing every day or two (v1.419.0 by Nov 22, v1.421.0 by
  Nov 24). The v1.419.0 documents are gone, so this change cannot be shown
  surviving a second publish.
- `verify` does not catch stale version references in `README.md`,
  `INSTALL.md` or `server.json`, so the sweep takes a grep.

**Observable success criteria.**

1. After the sync commit, `docs/data/tool-catalog.json` reports
   `sourceVersion: v1.421.0` with the canonical SHA below, 159 operations,
   26 toolsets, `warnings: []`. `npm run verify` passes with no test edits and
   `git status` is clean.
2. A dispatched **Swagger drift** run on `main` is green with
   `unchanged: true`, superseding `45016691884` and `45175215676`.
3. On the release commit, `CHANGELOG.md` has a dated `[1.6.0]` section.
   `package.json` and both lockfile fields read `1.6.0`. No `1.5.0` or
   `v1.417.0` remains in `README.md`, `INSTALL.md` or `server.json`; `verify`
   does not catch these, so it takes a grep. `npm run verify` passes.
4. `npm run release:validate -- v1.6.0` prints `"valid": true`, and the CI run
   on the release commit shows all 6 jobs successful.
5. Tag `v1.6.0`: the Release workflow succeeds, the GitHub release is
   non-draft, and `npm view etoro-trading-mcp@1.6.0` returns metadata with
   provenance.

**Scope.**

1. Sync commit: force-add the plan file, pre-flight the live documents,
   `npm run acquire`, `npm run generate`, verify, commit, push, and dispatch
   the drift workflow.
2. Release commit: changelog section, `npm version --no-git-tag-version 1.6.0`,
   sweep version refs (`README.md` lines 42, 113, 114, 131; `INSTALL.md` lines
   33, 34, 37, 68, 101, 102, 113; `server.json` lines 11, 16), verify, push.
3. Validate and release: `release:validate`, wait for CI, tag, push only the
   tag, check the npm and GitHub artifacts.
4. Close out: record execution notes in the plan file and commit, then delete
   the temp research folder.

**Non-goals.**

- No runtime or `src` changes beyond generated files.
- No drift-checker change; it still cannot ignore example-value noise.
- No hand-written schema constraint for upstream's "send exactly one of" rule.
- No test edits; if `verify` needs one, stop and come back to the maintainer.
- The stale "27 toolsets and 197 tools" sentence at
  `docs/configuration.md` line 13 stays (not requested).

**Constraints, assumptions, decisions.**

- **Version 1.6.0 (minor)**, matching the 1.5.0 precedent: new optional
  capabilities, nothing removed, and every previously valid request stays
  valid.
- **Proceed now rather than wait.** The change is additive and consistent on
  three surfaces, and the Clubs failure mode came from reacting to a
  disappearance. The worst case here is one follow-up release.
- **Hash-pinned pre-flight.** Immediately before `acquire`,
  `npm run check:swagger` must report exactly these values. If upstream moved
  again, stop, re-diff, and return to this goal.

  ```
  swagger    v1.421.0  21c18894c1c27f5d81c2abc7bccca0b791c916d4b0584f61947bd2b071266ba1
  core       v1.421.0  ba84b04e3631490757d3abfd43527a64ee09a3fcfd395b2ef7f6fc998a0a829f
  deprecated v1.421.0  9c7f478ae194e991388567be1af42586996e1afe9b5c24898bcf6b2d4e1292b4
  ```

- Pushing `main` also publishes the pending local commit `efe054e` (plan
  notes for the v1.417.0 release, docs only).
- Pushing the release commit cancels the CI run on the sync commit through
  workflow concurrency. This is expected; the release commit's CI run is the
  gate.
- **Authorization.** Plan approval covers everything up to and including
  `release:validate`. The tag push publishes irreversibly to npm, so it waits
  for the maintainer's explicit go-ahead at that step.
- **Research housekeeping.** A scratch folder outside the repo,
  `C:/Users/nkkos/AppData/Local/Temp/etoro-drift-20261124`, holds the
  downloaded documents, portal pages and two throwaway analysis scripts. It is
  deleted in the close-out task.

**Test level.** No new tests. The existing unit and integration suites run
inside `npm run verify` (tasks 1 and 3), again inside `release:validate` and
CI (task 4), and in the Release workflow's verify job (task 5).

## Tasks

| ID | Task | Completion criterion | Dependencies | Status |
|---:|---|---|---|---|
| 1 | Sync commit on local `main`: force-add the plan file (`plan/` is gitignored); pre-flight with `npm run check:swagger`, which must name v1.421.0 and the three pinned canonical hashes (otherwise stop and return to the goal gate); `npm run acquire`; `npm run generate` (regenerates `openapi/*`, `src/generated/*`, `docs/data/*`, `docs/tools.md`, `docs/toolsets.md`); `npm run verify` with no test edit (stop if one is needed); commit `chore: sync eToro Swagger v1.421.0` | Commit on local `main`; `docs/data/tool-catalog.json` reports `sourceVersion: v1.421.0`, `sourceCanonicalSha256: 21c18894…`, 159 operations, 26 toolsets, 15 legacy, 17 real-money mutations, `warnings: []`; `npm run verify` passed before the commit; `git show --stat HEAD` lists only the 11 generated files plus the plan file; `git status` clean | None | Completed |
| 2 | Push the sync commit to `origin/main` (this also carries the pending plan-notes commit `efe054e`) and dispatch the drift workflow on `main` (`gh workflow run swagger-drift.yml --ref main`) | `git rev-list --left-right --count main...origin/main` prints `0 0`; the dispatched run ends with conclusion `success` and its log contains `"unchanged": true`; it supersedes failures `45016691884` and `45175215676` as the latest run of `gh run list --workflow swagger-drift.yml` | 1 | Pending |
| 3 | Release commit on local `main`: add a dated `## [1.6.0] - <release day>` section to `CHANGELOG.md` (Changed: catalog refreshed v1.417.0 to v1.421.0, 159 tools / 26 toolsets unchanged; the four copy-trading pairs' new optional fields and relaxed requirements; the new `404` responses); `npm version --no-git-tag-version 1.6.0`; sweep version refs in `README.md` (lines 42, 113, 114, and 131, which also names the Swagger version), `INSTALL.md` (lines 33, 34, 37, 68, 101, 102, 113), `server.json` (lines 11, 16); `npm run verify`; commit `Release v1.6.0: Swagger v1.421.0` | `npm run verify` green; a grep for `1.5.0` and for `v1.417.0` across `README.md`, `INSTALL.md`, `server.json` returns nothing; `package-lock.json` reads `1.6.0` in both its top-level `version` and `packages[""].version`; `git status` clean | 1 | Pending |
| 4 | Push the release commit to `origin/main`, run `npm run release:validate -- v1.6.0`, then wait for CI on the release commit | `release:validate` prints `"valid": true`; the CI run for the release commit shows all 6 `Verify` jobs with conclusion `success` when checked with `gh run view <id> --json jobs`, not just the `gh run watch` exit code | 3 | Pending |
| 5 | After the maintainer's explicit go-ahead to publish: create annotated tag `v1.6.0` on the release commit, push only the tag, monitor the Release workflow (verify, then publish), and check the artifacts | Release workflow run for `v1.6.0` succeeds; `gh release view v1.6.0 --json isDraft` returns `false`, and the release body carries the 1.6.0 changelog section and API baseline v1.421.0 with 159 operations / 26 toolsets; `npm view etoro-trading-mcp@1.6.0` returns the version with `dist.attestations.provenance` (retry up to about 5 minutes for registry propagation) | 4, maintainer go-ahead to publish | Pending |
| 6 | Close out: set the task statuses and add execution notes in the plan file, commit `docs(plan): record swagger v1.421.0 release completion`, push to `origin/main`; delete the temp folder `C:/Users/nkkos/AppData/Local/Temp/etoro-drift-20261124` | Commit on `origin/main` touching only `plan/swagger-v1421-sync-release.md`; the temp folder no longer exists | 5 | Pending |
