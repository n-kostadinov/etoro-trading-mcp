# Withdraw `clubs` toolset, sync to Swagger v1.404.0, release v1.2.0

## Goal

**Intended outcome.** Update the package to eToro's current Swagger **v1.404.0** —
dropping the withdrawn `clubs` toolset (its single operation `getClubs`) and picking
up the new `getStockbackPayments` operation — and publish it as **v1.2.0** through
the existing tag-driven Release workflow (npm with provenance + GitHub release
**with release notes**, which the workflow already generates from the CHANGELOG
section via `release.yml:43-44,102`).

**Observable success criteria.**

1. `openapi/policy-overrides.json` contains no `Clubs` mapping; all seven generated
   artifacts reflect v1.404.0 (**156 operations, 25 toolsets** — `getClubs` removed,
   `getStockbackPayments` added under the existing `data` toolset); `npm run verify`
   passes.
2. The next scheduled Swagger-sync run on `main` reports `action: none` (guard
   satisfied — the daily job failure from 2026-11-02 is resolved).
3. `npm run release:validate -- v1.2.0` prints `"valid": true` on the release
   commit; CI is green on `main`.
4. Release workflow succeeds for tag `v1.2.0`: GitHub release `v1.2.0` published
   non-draft **with the generated release-notes body** (changelog section + API
   baseline: version, SHA-256, 156 ops / 25 toolsets) and tarball;
   `npm view etoro-trading-mcp@1.2.0` returns metadata with provenance.

**Scope.**

1. **Preparation commit on `main`:** the approved plan file plus the one-line policy
   edit (remove `"Clubs": "clubs"` at `openapi/policy-overrides.json:8` — no other
   override list references clubs). Committed first because `sync:swagger` refuses a
   dirty tree (`scripts/synchronize-swagger.ts:70-72`).
2. **The update:** run `npm run sync:swagger` → downloads v1.404.0, regenerates,
   runs `npm run verify` internally, pushes branch `swagger/v1.404.0/<hash>`, opens
   the sync PR with the diff report. Review the report (operation
   additions/removals, scope/rate-limit changes), then merge the PR manually.
3. **The release commit on `main`:** dated `CHANGELOG.md` `[1.2.0]` section
   (Removed: `clubs` toolset with `getClubs` + upstream withdrawal reference + note
   that configs referencing `clubs` now fail validation with the offending name;
   Changed: catalog refreshed v1.402.0 → v1.404.0 incl. `getStockbackPayments`,
   toolsets 26 → 25); bump `package.json` to 1.2.0 and **both**
   `package-lock.json` version fields (validator-enforced,
   `scripts/validate-release.ts:44-49`); hand-maintained docs generation does not
   touch: `README.md` (26→25 toolsets in four places, drop the `clubs` table row;
   the "156 tools" count stays), `INSTALL.md` (`--version` prints 1.2.0; 28/156
   example counts unchanged), `server.json` (both `1.1.0` version fields).
4. **Cut the release:** `npm run release:validate -- v1.2.0` (requires the release
   commit already on `origin/main` — ancestry check at
   `scripts/validate-release.ts:64-80`), tag `v1.2.0` on `main` HEAD, push only the
   tag, monitor the Release workflow to completion and verify the published release
   notes body.

**Non-goals.** No runtime/`src` code changes beyond generated files; no change to
the sync guard itself; no rewrite of historical docs
(`docs/internal/etoro-mcp-v1.0.0-spec.md` stays as history); no re-release or
remediation of 1.1.0; no announcement/marketing; no new release-notes mechanism —
the existing CHANGELOG-driven pipeline is used as-is.

**Constraints, assumptions, decisions.**

- Release exclusively via the tag-driven workflow; local `npm publish` forbidden
  (repo rule). `gh` is authenticated with admin; `NPM_TOKEN` exists in the
  `production` environment (proven by v1.1.0).
- Version **1.2.0** chosen, following the v1.1.0 precedent: upstream-withdrawn
  tooling is a minor bump with the config-breaking effect documented in the
  changelog rather than a package-side redesign.
- Research-verified facts the plan relies on: live document is v1.404.0 with the
  `Clubs` tag gone (checked 2026-11-02); exact operation delta vs the repo is
  `getClubs` removed, `getStockbackPayments` added under tag `Data` → existing
  `data` toolset mapping, net operation count stays 156; the demo-safe example
  (28 tools) is unaffected; `check-docs.ts` does not enforce the README's
  hardcoded toolset count, so main stays green between the sync merge and the
  release commit; cspell excludes generated `docs/tools.md`, so the new
  "stockback" prose is not spell-checked (if any checked file trips on it, adding
  a cspell word is an in-scope contingency during sync).
- Assumption: eToro does not publish another Swagger version mid-process; if it
  does, the sync branch/hash changes and the process re-runs from scope step 2.

**Test level.** No new tests: no hand-written runtime code changes — all code
changes are generated artifacts, and the existing unit + integration suites run
inside `npm run verify` at tasks 2, 3, and 4. That verify pass is the regression
proof throughout.

## Tasks

| ID | Task | Completion criterion | Dependencies | Status |
|---:|---|---|---|---|
| 1 | Commit the approved plan file plus the policy edit — remove `"Clubs": "clubs"` from `openapi/policy-overrides.json` — to `main` (`docs(plan)` + `chore:` style, matching repo history) | `git log origin/main` shows the commit; `openapi/policy-overrides.json` parses with no `Clubs` key; `git status` clean (sync refuses a dirty tree) | None | Completed |
| 2 | Run `npm run sync:swagger`: download v1.404.0, regenerate artifacts, push branch `swagger/v1.404.0/<hash>`, open the sync PR; review `artifacts/swagger-diff.md` for unexpected scope/rate-limit/operation changes beyond `getClubs` removed / `getStockbackPayments` added | PR titled `chore: sync eToro Swagger v1.404.0` exists against `main`; diff report reviewed; PR CI green (if the scheduled daily run already opened the same-hash PR between tasks 1–2, reuse it) | 1 | Completed |
| 3 | Merge the sync PR manually and update local `main` | `main` HEAD contains the sync commit; `node` check on `docs/data/tool-catalog.json` reports `sourceVersion: v1.404.0`, 156 operations, 25 toolsets, no `clubs`; `npm run verify` passes on `main` | 2 | Completed |
| 4 | Release commit on `main`: dated `CHANGELOG.md` `[1.2.0]` section (Removed/Changed per approved goal); `package.json` → 1.2.0; both `package-lock.json` version fields → 1.2.0; `README.md` toolset count 26→25 (four places) and drop the `clubs` table row; `INSTALL.md` `--version` prints 1.2.0; `server.json` both version fields → 1.2.0 | On the release commit: `npm run verify` green; greps confirm no `clubs` row in `README.md`, no `1.1.0` in `server.json`, lockfile top-level and `packages[""].version` both 1.2.0 | 3 | Completed |
| 5 | Push the release commit to `origin/main`, then `npm run release:validate -- v1.2.0` | Command prints `"valid": true` (tag/lockfile/changelog/registry-unpublished/main-ancestry checks all pass) | 4 | Completed |
| 6 | Tag `v1.2.0` on `main` HEAD, push only the tag, monitor the Release workflow (verify → publish) to completion | Workflow run for tag `v1.2.0` succeeds; `gh release view v1.2.0` is non-draft, its body contains the 1.2.0 changelog section and the API baseline (v1.404.0, SHA-256, 156 ops / 25 toolsets); `npm view etoro-trading-mcp@1.2.0` returns metadata with provenance | 5 | Completed |
| 7 | Confirm the daily job is healthy again: trigger a `workflow_dispatch` Swagger-sync run on `main` (or await the next scheduled run) | The run completes successfully with `action: none` (guard satisfied — the failure diagnosed earlier is resolved); `gh run list` shows no new sync failures | 3 | Blocked |

## Execution notes

- **Task 1** (commit `e895b0c`): between the policy commit and the sync merge,
  `generate:check` on `main` failed with `missing=Clubs` (on-disk swagger still
  v1.402.0 carries the tag) — the same transient red window the v1.1.0 precedent
  accepted; cleared by the sync merge (`1614aee`).
- **Task 2**: the first sync attempt aborted at `npm run verify` inside the script
  because `tests/unit/generated-catalog.test.ts:37` pins the toolset baseline
  (26 → 25). Fixed on `main` with `1a730bd test: track the Clubs withdrawal in
  catalog baselines`, mirroring precedent commit `688102d`; the aborted branch
  `swagger-sync/v1.404.0-840f3bf942c1` was discarded and the sync re-run clean.
  Diff report reviewed: −`getClubs`, +`getStockbackPayments`, 155 parameter-only
  operation changes, 33 schema changes, publication sets consistent.
- **Task 4** (commit `3ef87d5`), non-material deviations within scope intent:
  `README.md` carried three more version references than the plan named (two
  `npx etoro-trading-mcp@1.1.0` commands plus the "Current release" line with
  `v1.402.0`) and the toolset table's `data` row needed 4 → 5
  (`getStockbackPayments` landed in `data`); the column-major table was
  rebalanced to 13/12 rows. `server.json`'s root `version` field initially
  escaped a 4-space-indent match (fixed); biome auto-fixed the new table's
  empty-cell padding.
- **Task 6**: `npm view` 404'd for ~2 minutes after publish — registry
  propagation; the workflow log shows `+ etoro-trading-mcp@1.2.0` with a signed
  provenance statement (sigstore log index 3639702520), and `npm view` later
  returned `dist.attestations.provenance` (SLSA v1).
- **Task 7 BLOCKED** — upstream reversed the withdrawal mid-process. eToro
  published **v1.405.0** between the sync (12:21 UTC) and the verification
  dispatch run (12:39 UTC): the `Clubs` tag and `getClubs` are **back**
  (157 operations, `getStockbackPayments` kept). The dispatch run
  (`41446390279`) fails with `Toolset mapping mismatch; missing=Clubs; stale=`
  — the mirror image of the original failure. The criterion `action: none` is
  unachievable within the approved scope because its premise (Clubs withdrawn)
  no longer holds. The scheduled daily job will keep failing until a revised
  plan lands. **Unblock:** revise via `$cc-plan` — re-add
  `"Clubs": "clubs"` to `openapi/policy-overrides.json`, re-add the baseline
  test expectation 25 → 26 toolsets / 156 → 157 operations, sync to v1.405.0,
  restore the README table row and counts, and release v1.2.1 (Clubs restored
  after upstream reinstated it). The published v1.2.0 remains a coherent
  release built from the consistent v1.404.0 snapshot.
