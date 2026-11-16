# Sync to eToro Swagger v1.417.0 and release

## Goal

**Intended outcome.** Land the manual Swagger update that the failing daily
`Swagger drift` runs (`43705924961`, 2026-11-15; `43855613892`, 2026-11-16)
demand: re-baseline the package from eToro Swagger **v1.415.0** to
**v1.417.0** via the manual playbook in `MAINTAINERS.md` (direct commit to
`main`, no sync PR), cut the release through the tag-driven Release workflow,
and restore the daily job signal with a green `workflow_dispatch` drift run.

Unlike the v1.413.0 and v1.415.0 syncs, this one carries a **real API change**
to one tool pair's input schema, so the version number is agreed with the
maintainer before the release commit.

**Research findings the plan relies on** (verified 2026-11-16, live fetches of
all three documents; deep diff with keys sorted, `example`/`examples`/
`description`/`summary` and the `x-request-id` parameter ignored):

- All three live documents agree at **v1.417.0** (Swagger UI 159 operations,
  core 144, deprecated 15). Zero operations added or removed.
- `npm run swagger:diff` (live vs vendored): 0 added, 0 removed, 159 changed,
  2 changed component schemas. 157 operations change only through the
  regenerated `x-request-id` example UUID; the only real operation changes are
  `POST /api/v2/trading/copy` and `POST /api/v2/trading/copy/demo`
  (description, request body, responses).
- `CopyTradingRegisterRequest`: new optional `mirrorID` (int32, minimum 1 —
  edit an existing copy by id) and `mirrorSLPercentage` (decimal, exclusive
  0–100 — optional copy stop-loss); `parentCID` no longer required
  (`required` is now `amount`, `referenceID`) and its description reworded;
  request-body `example` became named `examples`.
- `PortfolioResponse`: the two position `$ref`s now point to
  `TradingRealApi_Position` instead of the content-identical
  `TradingDemoApi_Position`. In the core document, which bundles only
  referenced schemas, this shows up as `TradingDemoApi_Position` leaving and
  `TradingRealApi_Position` arriving.
- The deprecated-portal document differs only by noise.
- Announcements checked per `AGENTS.md`: the Core API changelog
  (https://api-portal.etoro.com/core/changelog.md) still ends at v1.393.0
  (2026-10-12), re-checked on 2026-11-16 before the sync commit. Nothing
  announces this change or any withdrawal. The change is additive and coherent
  (new optional fields, relaxed requirement), not Clubs-style churn — safe to
  proceed as a reviewed manual update.

**Observable success criteria.**

1. `npm run verify` passes on `main` after the sync commit and after the
   release commit.
2. `docs/data/tool-catalog.json` reports `sourceVersion: v1.417.0`, 159
   operations, 26 toolsets, `warnings: []`.
3. `registerCopyTrading` keeps `realMoneyMutation: true`; no other real-money,
   read-only, toolset, or annotation classification moves.
4. A `workflow_dispatch` run of **Swagger drift** on `main` is green with
   `unchanged: true`, superseding `43705924961` / `43855613892`.
5. Release: `npm run release:validate -- vX.Y.Z` prints `"valid": true`; tag
   workflow succeeds; GitHub release non-draft; npm version published with
   provenance.

**Scope.**

1. **Sync commit on `main`**: this plan file (force-added); `npm run acquire`;
   `npm run generate` (regenerates `openapi/*`, `src/generated/*` including
   `etoro-api.d.ts` this time, `docs/data/*`, `docs/tools.md`,
   `docs/toolsets.md`); confirm pinned baselines genuinely unchanged; verify;
   commit.
2. **Release commit on `main`**: dated `CHANGELOG.md` section; `npm version
   --no-git-tag-version X.Y.Z`; sweep hand-maintained version refs
   (`README.md` version references only, `INSTALL.md`, `server.json`).
3. **Release**: CI green, `release:validate`, tag, push tag, verify artifacts.
4. **Drift signal**: `workflow_dispatch` the Swagger drift workflow after the
   sync commit is pushed.

**Non-goals.** No runtime/`src` changes beyond generated files; no test-pin
redesign; no drift-checker change to ignore request-ID example noise (a
separate, independent change that may be in progress in this checkout — its
files, `scripts/lib/swagger-drift.ts`, `scripts/check-swagger.ts`,
`tests/unit/swagger-drift.test.ts`, `MAINTAINERS.md`, `AGENTS.md`, and the two
daily-job sentences in `README.md`, are not touched here).

**Constraints, assumptions, decisions.**

- **Version: pending maintainer decision.** Earlier documentation-only syncs
  shipped as patches (v1.4.1, v1.4.2); this one changes the input schema of
  `registerCopyTrading` / `registerCopyTradingDemo` in a backward-compatible,
  additive way (new optional capabilities: edit by `mirrorID`, copy
  stop-loss). Recommendation: minor (**1.5.0**).
- No push, tag, or npm publication without the maintainer's explicit go-ahead.
- Same tag-driven release machinery as prior releases; no local `npm publish`.

**Test level.** No new tests. The sync exercises the existing pinned-baseline
suites (unit + integration) inside `npm run verify`.

## Tasks

| ID | Task | Completion criterion | Dependencies | Status |
|---:|---|---|---|---|
| 1 | Sync commit on `main`: announcements re-check; confirm all three live documents agree; `swagger:diff`; `acquire`; `generate`; confirm classification and pins; `npm run verify`; commit | Commit on `main`; catalog reports v1.417.0 / 159 / 26 / `warnings: []`; verify green; `git status` clean | None | Completed |
| 2 | Push the sync commit and dispatch the Swagger drift workflow | Dispatched run green with `unchanged: true` | 1, maintainer go-ahead to push | Pending |
| 3 | Release commit: `CHANGELOG.md` section, `npm version --no-git-tag-version X.Y.Z`, sweep `README.md` / `INSTALL.md` / `server.json` version refs; verify; commit | verify green; no stale version refs; both lockfile fields read X.Y.Z | 1, version agreed | Pending |
| 4 | `npm run release:validate -- vX.Y.Z`, CI green, tag, push tag, verify GitHub release and npm provenance | Release workflow succeeds; npm metadata with provenance | 3, maintainer go-ahead to publish | Pending |

## Execution notes

- **Task 1** — all three live documents at v1.417.0. `acquire` + `generate`
  changed 11 files (the 10 of the v1.415.0 sync plus
  `src/generated/etoro-api.d.ts`, which now regenerates with the schema
  change). Catalog check against the previous commit: `inputSchema` changed
  only for `registerCopyTrading` / `registerCopyTradingDemo`; `responses` for
  those two plus `getTradingInfoPortfolio` / `getTradingInfoDemoPortfolio`;
  descriptions only for the two registrations; `realMoneyMutation`,
  `readOnly`, `toolsetId`, and `annotations` unchanged everywhere
  (`registerCopyTrading` still `realMoneyMutation: true`, the demo variant
  still `false`); toolsets identical. `npm run verify` passed with every
  pinned baseline unchanged — no test edits needed.
