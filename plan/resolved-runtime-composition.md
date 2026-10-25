# Resolved runtime composition

## Goal

Refactor the **runtime composition and lifecycle architecture** so the running MCP server consumes the same resolved configuration and catalog as the CLI, while preserving documented behavior and applying the repository's clean-code guidelines.

### Scope and evidence

1. **Configuration is resolved twice with different inputs.**  
   `runCli` correctly merges defaults, file, environment, and CLI settings in `src/cli.ts:164`, but then calls `startMcpServer` without those settings in `src/cli.ts:185`. Server startup loads configuration again with an empty CLI layer in `src/mcp/start-server.ts:52`.

   Consequently, server execution can ignore `--config`, tool selection and disable flags, timeout and response limits, log level, and safety overrides such as `--no-allow-real-money`. Inspection commands can therefore report a different effective configuration from the running server.

2. **Composition responsibilities are split across two modules.**  
   The CLI and server startup both discover configuration and resolve policy. This duplicates file/environment processing and allows future drift between inspection and execution.

3. **Shutdown state lacks a single owner.**  
   `src/mcp/start-server.ts:83` tracks closure through separate boolean and promise state. Concurrent `close()` calls do not await the same in-flight closure, and installed signal listeners are not reliably removed on every terminal path.

4. **The transport port belongs to its concrete adapter.**  
   `EtoroTransport` is declared in `src/transport/fetch-transport.ts`, although the MCP adapter depends on that interface rather than on Fetch specifically. This is a small dependency-direction and discoverability problem, not a request to decompose the transport.

### Design decision

The approved design is **explicitly resolved runtime inputs**:

- Make the CLI the sole configuration and credential discovery boundary.
- Server startup receives explicit settings, catalog, and credentials, then hides registry resolution, transport construction, MCP registration, stdio connection, and shutdown behind its existing interface.
- This removes the duplicate configuration path rather than synchronizing it.

The smaller alternative—adding optional resolved settings while retaining environment/file fallback—was rejected because it leaves two composition modes and permits future divergence. Decomposing cohesive transport, generator, and scripting modules was rejected because it adds indirection without addressing the observed defect.

### Target responsibilities and interfaces

- **`src/cli.ts`**
  - Remains the composition root for CLI parsing, environment/file configuration, credential discovery, inspection commands, and server launch.
  - Loads one configuration snapshot per invocation.
  - Passes the same `RuntimeSettings` and `ToolCatalog` to server startup that inspection would use.
  - Gains a narrow optional server-start substitution in `CliDependencies` so CLI-to-server composition can be tested without a real process or network. No dependency-injection framework or generic service locator.

- **`src/mcp/start-server.ts`**
  - Requires explicit `settings`, `catalog`, and `credentials` in `StartServerOptions`.
  - Loses its environment, configuration-file, and generated-catalog discovery responsibilities.
  - Continues to own registry resolution, diagnostics, transport assembly, MCP creation, stdio connection, and shutdown.
  - Retains the existing transport-factory, stream, and signal-handler substitutions.
  - Keeps `ServerHandle.server`, `ServerHandle.closed`, and `ServerHandle.close()` unchanged.
  - Uses one memoized close promise and one terminal cleanup path so repeated/concurrent closure awaits the same operation and signal listeners are removed after explicit or stdio-driven closure.

- **`src/transport/types.ts`**
  - Owns the existing `EtoroTransport` interface, moved unchanged from the Fetch implementation.
  - `fetch-transport.ts`, `create-server.ts`, and tests update imports without changing transport behavior.

### Contracts to preserve

- Configuration precedence remains **defaults < file < environment < CLI**, including array replacement and explicit CLI negation.
- Explicit tool disables win over enables; deprecated and real-money safety gates remain fail-closed.
- The intentional behavioral correction is that the **running server now honors the documented CLI-effective configuration**. Inspection output and command behavior remain compatible.
- Credentials remain environment-only and secret-free inspection commands continue to work without credentials.
- CLI help, version, JSON shapes, stdout/stderr usage, and `0`/`2` exit-code conventions remain stable.
- The package binary and MCP protocol remain unchanged. Internal `StartServerOptions` callers may be migrated because the package does not expose a public TypeScript library API.
- Default exposure remains **28 tools**; complete opt-in exposure remains **197 operations**.
- MCP input validation, disabled-tool rejection, structured results, error normalization, and stdout-only protocol behavior remain intact.
- Transport authentication, serialization, request IDs, retry policy, cancellation, timeouts, response bounds, redaction, and attachment limits remain unchanged.
- Registry warnings are emitted before startup; configuration and credential errors retain actionable messages and existing error-handling strategy.
- Startup performs less duplicate I/O; request-time performance and ordering are unaffected.
- Generated source and documentation artifacts should produce no diff.

### Non-goals

- No decomposition of Fetch transport, request serialization, OpenAPI compilers, or catalog policy.
- No generator, Swagger synchronization, release automation, or package-layout refactor.
- No live eToro calls, credentials, trading strategy features, releases, or npm publication.
- No behavior changes beyond restoring documented runtime configuration and making shutdown ownership reliable.

### Clean-code constraints

- Preserve consistent abstraction levels and clear state ownership.
- Make no size-driven helper extraction unless it exposes a meaningful concept.
- Add no generic filesystem abstraction, speculative port, layer, or runtime dependency.
- Keep transport request execution, retry logic, serialization, generators, and other cohesive modules intact.
- Follow Biome formatting and existing repository idioms.

### Acceptance and verification

- Unit-level composition tests prove that `--config`, CLI-over-environment negations, explicit disables, runtime limits, credentials, and custom catalogs reach server startup unchanged.
- MCP integration tests exercise the composed CLI-to-server path with a fake transport, while retaining the existing 28-tool default, disabled-tool, validation, and all-197-operation dispatch contracts.
- Lifecycle tests prove repeated/concurrent `close()` completion, stdio closure, and signal-listener cleanup.
- Existing transport, serialization, configuration, registry, generator, and release-tool tests remain in place unless equivalent protection is demonstrably retained.
- Regeneration produces no authored or generated diff.
- The full local **`npm run verify`** gate passes: formatting, lint, type checking, unit tests, integration tests, generated freshness, documentation, workflow checks, build, and packed-artifact smoke tests.
- Pipeline acceptance means the existing GitHub Actions **CI** run for the refactored commit is green on all six Ubuntu/Windows/macOS and Node 22/24 combinations. Release and Swagger-sync workflows are not acceptance targets for this refactor.

## Tasks

| ID | Task | Completion criterion | Dependencies | Status |
|---:|---|---|---|---|
| 1 | **Create an isolated branch and establish the baseline.** Create `refactor/runtime-composition` from the clean `main` worktree before source edits. Run the existing type and test suites to distinguish pre-existing failures from refactor regressions. | `git branch --show-current` returns `refactor/runtime-composition`; `npm run typecheck && npm test && npm run test:integration` pass before source edits. If the baseline fails, record the exact failure and mark the task Blocked rather than hiding unrelated repairs in the refactor. | None | Completed |
| 2 | **Unify CLI and server composition around resolved runtime inputs.** Change `src/cli.ts` so server launch passes the loaded `RuntimeSettings`, the same `ToolCatalog`, and environment-derived `CredentialConfiguration`. Add the narrow optional `startServer` substitution to `CliDependencies`. Change `src/mcp/start-server.ts` so `StartServerOptions` requires those resolved inputs and no longer accepts `env` or `readFile`, loads configuration, or imports the generated catalog directly. Add `tests/unit/cli-server-composition.test.ts` and migrate the existing helper in `tests/integration/stdio-contract.test.ts`. | New **unit tests** prove that `--config`, CLI-over-environment negation, explicit tool/toolset disables, timeout, response-size, log-level, credentials, and custom catalog identity reach startup unchanged. Configuration is loaded once per CLI invocation; inspection remains credential-free. `npm run typecheck && npm test && npm run test:integration` pass. | 1 | Completed |
| 3 | **Verify the composed path through the real MCP stdio boundary.** Extend `tests/integration/stdio-contract.test.ts` with a server launched through `runCli` and the real `startMcpServer`, using substituted stdio streams and a recording fake eToro transport. Retain the existing direct-start tests for the complete generated catalog. | A new **integration test** proves that the running server—not merely inspection—honors CLI selection and safety negation and that the transport factory receives CLI-effective request limits. Existing assertions still pass for the 28-tool default, disabled and invalid calls, and exact dispatch of all 197 operations. `npm run typecheck && npm test && npm run test:integration` pass without live eToro access. | 2 | Completed |
| 4 | **Give server shutdown one idempotent lifecycle.** Refactor `src/mcp/start-server.ts` to reuse one close promise, resolve `closed` on every existing terminal path, preserve the previous stdio `onclose` callback and close-error propagation, and unregister the same SIGINT/SIGTERM handler during terminal cleanup. Add `tests/integration/server-lifecycle.test.ts`; do not introduce a lifecycle-manager layer. | New **integration tests** prove that concurrent/repeated `close()` calls share and await the same closure, stdio closure still settles `closed`, and signal-listener counts return to their pre-start baseline after explicit and stdio-driven closure. `npm run typecheck && npm test && npm run test:integration` pass. | 2 | Completed |
| 5 | **Move the transport port to the neutral transport contract module.** Move the unchanged `EtoroTransport` interface from `src/transport/fetch-transport.ts` to `src/transport/types.ts`. Update imports in `src/transport/fetch-transport.ts`, `src/mcp/create-server.ts`, `src/mcp/start-server.ts`, and `tests/integration/stdio-contract.test.ts`. Do not alter the Fetch implementation or `execute` signature. | No concrete-adapter imports remain merely to obtain `EtoroTransport`; no runtime dependency cycle is introduced. `npm run typecheck && npm test && npm run test:integration && npm run build` pass, including declaration generation. | 1 | Completed |
| 6 | **Prove generated stability and run the complete local pipeline.** Review the final diff for the approved architecture and clean-code quality gates, including removal of stale imports/comments and absence of speculative abstractions. Regenerate artifacts, verify that none change, then run the same full verification command used by CI. | `npm ci` succeeds; `npm run generate` followed by `git diff --exit-code -- src/generated docs/tools.md docs/toolsets.md docs/data` proves generated stability; `npm run verify` passes formatting, lint, type checking, all unit and integration tests, generated freshness, documentation/spelling, workflow validation, build, and packed-artifact smoke tests. `git diff --check` passes, and the final diff contains only approved runtime, test, and plan files. | 2, 3, 4, 5 | Completed |
| 7 | **Deliver the refactored commit to GitHub Actions without merging.** Commit the reviewed changes on `refactor/runtime-composition` with a conventional refactor commit, push the branch, and open a draft pull request to `main`. Watch the CI run for that exact commit; investigate and correct any refactor-related failure and rerun verification. | The pushed commit and draft PR contain the reviewed plan and refactor. The GitHub Actions **CI** run finishes successfully with all six Ubuntu/Windows/macOS × Node 22/24 jobs green, confirmed with `gh pr checks`/`gh run view`. The PR remains unmerged; no Swagger synchronization, release, tag, or npm publication occurs. | 6 | Completed |

## Execution notes

- Task 5 also updated the `EtoroTransport` import in `tests/integration/server-lifecycle.test.ts`, which Task 4 added after this plan was approved. The change is required by Task 5's completion criterion that no caller import the concrete Fetch adapter merely to obtain the transport interface.
- Task 7 delivered refactor commit `e1eba019570da187d08326d357fb0c709e1089b0` as draft PR [#1](https://github.com/n-kostadinov/etoro-trading-mcp/pull/1). CI run [40193178708](https://github.com/n-kostadinov/etoro-trading-mcp/actions/runs/40193178708) completed successfully for that exact commit with all six matrix jobs passing.
