# Skip post-publish npm publication verification

## Goal

**Outcome.** Future releases can never fail on npmjs propagation delay: the
post-publish verification step is removed from the Release workflow completely,
together with all code that exists solely for it. The `publish` job becomes:
draft GitHub release with tarball → `npm publish` → publish GitHub release.

**Success criteria.**

- `.github/workflows/release.yml` has no "Verify the published npm metadata"
  step; publishing proceeds directly from `npm publish` to
  `gh release edit --draft=false`.
- `publication:verify` / `verify-publication.ts` / `verifyPublishedVersion` no
  longer appear anywhere in the repo (excluding `plan/` history and
  `node_modules`).
- Full `npm run verify` passes (format, lint, types, unit, integration,
  generated, docs, workflows, build, package).

**Scope.** `release.yml` (drop step), `package.json` (drop script), delete
`scripts/verify-publication.ts`, remove `verifyPublishedVersion` from
`scripts/lib/npm-registry.ts`, drop its test cases from
`tests/unit/npm-registry.test.ts` (keeping tests for the still-used functions).

**Non-goals.**

- Pre-publish `assertVersionUnpublished` check in `validate-release.ts` stays
  untouched.
- No remediation for v1.0.1 — already live on npm and GitHub.
- No changelog entry (CI-internal change; package contents unchanged).
- No retry-harder alternative (longer polling) — verification is skipped, not
  made more patient.

**Decisions.** `parsePublishedVersion` stays in the lib because
`assertVersionUnpublished` uses it. The actionlint-based `workflow:check`
remains the workflow gate; no test asserts the removed step's presence.

**Research findings.** In both failed releases (v1.0.0 and v1.0.1) the
`npm publish` step itself succeeded; the failure was the follow-up
"Verify the published npm metadata" step. `scripts/verify-publication.ts`
polled `npm view` for only ~30 seconds (6 attempts × 5s), which was shorter
than npmjs metadata propagation, so it threw "npm does not list
etoro-trading-mcp@1.0.1; publication did not succeed" and failed the job. The
npm registry now serves `etoro-trading-mcp@1.0.1`, and the GitHub release
v1.0.1 was published manually two minutes after the failed run, so v1.0.1
needs no re-release.

## Tasks

| ID | Task | Completion criterion | Dependencies | Status |
|---:|---|---|---|---|
| 1 | Remove the "Verify the published npm metadata" step from `.github/workflows/release.yml` so the `publish` job flows directly from `npm publish` to `gh release edit --draft=false` | `npm run workflow:check` passes and `grep -n "publication:verify" .github/workflows/release.yml` returns nothing | None | Completed |
| 2 | Remove the `publication:verify` entry from `package.json` scripts and delete `scripts/verify-publication.ts` | `scripts/verify-publication.ts` no longer exists and `npm run publication:verify` reports an unknown script | None | Completed |
| 3 | Remove the now-unused `verifyPublishedVersion` export from `scripts/lib/npm-registry.ts` and prune its test cases (keeping `registryViewArguments`, `isRegistryAbsent`, `assertVersionUnpublished`, and the `parsePublishedVersion` malformed-output assertions) from `tests/unit/npm-registry.test.ts` | `npx vitest run tests/unit/npm-registry.test.ts` passes and `grep -rn "verifyPublishedVersion" scripts/ tests/` returns nothing | None | Completed |
| 4 | Run the full repository gate and confirm no stale references remain anywhere outside `plan/` and `node_modules` | `npm run verify` passes end-to-end and `grep -rn "publication:verify\|verify-publication\|verifyPublishedVersion" .` (excluding `plan/`, `node_modules`) returns nothing | 1, 2, 3 | Completed |

## Execution notes

- Task 3: an intermediate edit briefly duplicated `verifyPublishedVersion` in
  `scripts/lib/npm-registry.ts` (inverted old/new strings); corrected within the
  task before verification. The final diff removes the function exactly once
  and matches the plan; no other deviation from the approved scope.
