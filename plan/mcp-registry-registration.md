# Release v1.0.1 and register etoro-trading-mcp in the official MCP Registry

## Goal

**Intended outcome.** The npm package `etoro-trading-mcp@1.0.1` is published through the repo's protected Release workflow carrying the new `mcpName` field, and the server `io.github.n-kostadinov/etoro-trading-mcp` v1.0.1 is listed in `registry.modelcontextprotocol.io`, using the already-prepared `server.json`.

**Success criteria (all observable):**

1. Release commit on `origin/main` containing: `server.json`, `package.json` (`mcpName` + version 1.0.1), regenerated lockfile, a real CHANGELOG `[1.0.1] - 2026-10-26` section, README version pins updated from 1.0.0 to 1.0.1.
2. CI on `main` green; tag `v1.0.1` pushed; Release workflow completed; `npm view etoro-trading-mcp@1.0.1 mcpName` returns `io.github.n-kostadinov/etoro-trading-mcp`; GitHub release `v1.0.1` published (not draft).
3. `mcp-publisher publish` succeeds from WSL, and `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=etoro-trading-mcp"` returns the server entry.

**Scope.** The implementer executes the whole sequence: commit → push → CI wait → tag → workflow watch → WSL install → publish → verification. The GitHub device-flow login is the user's (relay the code/URL and wait). If the `production` environment has required reviewers configured, the publish job pauses for the user's approval in the Actions UI — tell the user when that happens.

**Non-goals:** aggregator listings (PulseMCP et al. pick up registry entries on their own schedule); GitHub-Actions registry-publishing automation; any code changes beyond the release metadata; social preview / Website-field tweaks.

**Constraints & assumptions:**

- Version is **1.0.1** (patch) — matches the `version` fields already in `server.json`.
- Release commit goes directly to `main` (repo precedent `ed5f2b5`; user is admin). If branch protection rejects the push, fall back to a fast PR — plan unchanged otherwise.
- `mcp-publisher` must run **after** npm 1.0.1 exists (it validates the published tarball's `mcpName`); the task order enforces that.
- CHANGELOG date = 2026-10-26; the generated-from Swagger version (v1.400.0) is unchanged by this release.
- Commit style follows the repo's convention (`Release v1.0.1: …` / conventional commits).

**Research findings relied on:** official quickstart process (`mcpName` in package.json → npm publish → `mcp-publisher login github` → `publish` → API verify); MAINTAINERS.md release flow (bump + lockfile + changelog on main → CI → tag → workflow); WSL Ubuntu 24.04 x86_64 with curl/tar present.

## Tasks

| ID | Task | Completion criterion | Dependencies | Status |
|---:|---|---|---|---|
| 1 | Land the v1.0.1 release commit on `main`: stage `server.json` + `package.json` (`mcpName`), bump `version` to 1.0.1, regenerate lockfile (`npm install --package-lock-only`), add CHANGELOG section `## [1.0.1] - 2026-10-26` (Added: `server.json` + `mcpName` for MCP Registry registration), update README's three `etoro-trading-mcp@1.0.0` pins and the "Current release" line to 1.0.1; commit (`Release v1.0.1: MCP Registry registration`) and push to `origin/main` | `git status` clean; `git log origin/main -1` shows the release commit | None | Completed |
| 2 | Wait for the CI workflow on `main` to finish | `gh run list --branch main` shows the run for the release commit with conclusion `success` | 1 | Completed |
| 3 | Tag the exact release commit `v1.0.1` (annotated) and push only the tag; watch the Release workflow through verify and publish (tell the user to approve the `production` environment if it pauses); confirm npm + GitHub release | Workflow run for tag `v1.0.1` concludes `success`; `npm view etoro-trading-mcp@1.0.1 mcpName` prints `io.github.n-kostadinov/etoro-trading-mcp`; `gh release view v1.0.1` shows published (not draft) | 2 | Completed |
| 4 | Install `mcp-publisher` in WSL: download the `mcp-publisher_linux_amd64` tarball from the registry repo's latest GitHub release, extract to `~/.local/bin` | `wsl.exe -e ~/.local/bin/mcp-publisher --help` prints the command list | None | Completed |
| 5 | Authenticate: run `mcp-publisher login github` in WSL, relay the device-code URL + code to the user, wait for user authorization | Login output reports `Successfully logged in` | 4 | Completed |
| 6 | Publish to the registry: run `mcp-publisher publish` in WSL from `/mnt/c/Nikolay/WORK/repo/etoro-trading-mcp` | Publish output reports `Successfully published` for `io.github.n-kostadinov/etoro-trading-mcp` version 1.0.1 | 3, 5 | Completed |
| 7 | Verify end-to-end: registry API search, npm view, GitHub release | `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=etoro-trading-mcp"` JSON contains `io.github.n-kostadinov/etoro-trading-mcp`; `npm view etoro-trading-mcp@1.0.1` succeeds; `gh release view v1.0.1` published | 6 | Completed |

## Execution notes

- **Task 1 (non-material deviation):** version pins were updated in `INSTALL.md` (7 occurrences including the `--version` expectation) and `docs/configuration.md` (12) and `docs/troubleshooting.md` (3) in addition to the README pins named in the task, because every pin in the repo tracks the released version (convention held at 1.0.0). Release commit: `32ce01f`.
- **Tasks 1–2 (fix commit):** the version bump broke two tests that hardcoded `1.0.0` — `tests/unit/cli-inspection.test.ts` (CLI `--version`) and `tests/integration/stdio-contract.test.ts` (MCP `initialize` `serverInfo`). Both now derive the expectation from `package.json` via `createRequire`, mirroring `src/cli.ts`. CI failed on `32ce01f` (5/6 jobs) and passed on the fix commit `0c23c3a` (run `40371044060`, all 6 jobs) — the criterion's green run is the fix commit's.
- **Task 3 (deviation from the literal criterion):** Release workflow run `40371785588` for tag `v1.0.1` concluded `failure` — but only its final "Verify the published npm metadata" step failed, racing npm propagation. The publish itself succeeded: `npm view etoro-trading-mcp@1.0.1 mcpName` returns `io.github.n-kostadinov/etoro-trading-mcp`. Recovered exactly per MAINTAINERS.md ("npm publish succeeded but a later step failed"): draft release flipped with `gh release edit v1.0.1 --draft=false`; npm not re-run. All observable deliverables of the criterion hold (npm live with `mcpName`, GitHub release published); only the workflow's own conclusion is `failure`, and re-running it is deliberately blocked by the registry pre-existence check.
- **Task 5:** first device code (`066E-73ED`) expired unused; a fresh login was started (code `EA1A-CE6B`).
- **Task 6:** the first `mcp-publisher publish` attempt failed with a registry-side `504 Gateway Time-out` (registry preview instability). A registry search confirmed nothing had been published, and a retry after ~30 seconds succeeded: `✓ Server io.github.n-kostadinov/etoro-trading-mcp version 1.0.1`.
- **Task 7:** verified — the registry API search returns the full server entry (`io.github.n-kostadinov/etoro-trading-mcp`, version 1.0.1, npm package, stdio transport, five environment variables), `npm view etoro-trading-mcp@1.0.1` shows `mcpName` and `dist-tags.latest = 1.0.1`, and GitHub release `v1.0.1` is published (not draft). All goal success criteria met.

