# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.1] - 2026-11-06

### Changed

- Catalog refreshed from eToro Swagger UI v1.408.0 to v1.413.0: 159 tools across 26 toolsets (unchanged). No operations were added or removed upstream. The SSO applications API documentation now covers partner-reserved scopes — `GET /api/v1/sso/scopes` does not list them, and create/update reject them with `400` — and documents a retryable `409` collision response on application creation.

## [1.4.0] - 2026-11-03

### Added

- Two `data` tools: `listStrategyPrompts` (`GET /api/v1/data/strategy-prompts`) and `getStrategyPrompt` (`GET /api/v1/data/strategy-prompts/{id}`) — eToro's strategy-prompt catalog, added in Swagger v1.408.0.

### Changed

- Catalog refreshed from eToro Swagger UI v1.405.0 to v1.408.0: 159 tools across 26 toolsets. The API-portal documents now include `getClubs`, so the v1.3.0 publication warning is resolved and publication surfaces are consistent again.

## [1.3.0] - 2026-11-02

### Added

- `clubs` toolset (1 tool): eToro reinstated the Clubs endpoint `GET /api/v1/clubs` (`getClubs`) in Swagger v1.405.0, one version after withdrawing it in v1.404.0. Configurations referencing `clubs` or `getClubs` work again.

### Changed

- Catalog refreshed from eToro Swagger UI v1.404.0 to v1.405.0: 157 tools across 26 toolsets. At publication time `getClubs` is present in the Swagger UI document but absent from both API-portal documents; the release notes carry this as a publication warning.

## [1.2.0] - 2026-11-02

### Removed

- `clubs` toolset (1 tool): eToro withdrew the Clubs endpoint `GET /api/v1/clubs` (`getClubs`) from the published API documents in Swagger v1.404.0. Configurations that reference `clubs` or `getClubs` now fail validation with the offending name.

### Changed

- Catalog refreshed from eToro Swagger UI v1.402.0 to v1.404.0: 156 tools across 25 toolsets. Adds `getStockbackPayments` (stockback payment history under the `data` toolset) and picks up upstream parameter and schema metadata updates across existing operations.

## [1.1.0] - 2026-10-31

### Removed

- `social-feeds` toolset (37 current and 4 legacy tools): eToro withdrew all social feed endpoints—feeds, posts, reactions, and attachments—from the published API documents in Swagger v1.402.0, following their deprecation notice of 2026-06-17 and withdrawal notice of 2026-08-18. Configurations that reference `social-feeds` or any of its tools now fail validation with the offending name.

### Changed

- Catalog refreshed from eToro Swagger UI v1.400.0 to v1.402.0: 156 tools across 26 toolsets.

## [1.0.1] - 2026-10-26

### Added

- Official MCP Registry registration: a schema-validated `server.json` describing the npm package, stdio transport, credential and tool-selection environment variables, plus the matching `mcpName` field in `package.json` (registry name `io.github.n-kostadinov/etoro-trading-mcp`).

## [1.0.0] - 2026-10-25

### Added

- Initial local stdio MCP server for eToro's Swagger UI API, generated from source version v1.400.0.
- 197 fine-grained tools across 27 configurable toolsets, including all 19 legacy operations behind an explicit opt-in.
- Allowlist-only tool exposure: every toolset is disabled by default and tools are exposed only by listing toolsets (`enabledToolsets` / `ETORO_ENABLED_TOOLSETS` / `--enable-toolset`) or individual tools (`enabledTools` / `ETORO_ENABLED_TOOLS` / `--enable-tool`); enabling a toolset enables all of its tools. The documented demo-safe example (`market-data`, `trading-demo`) enables 28 tools — 11 market-data tools and 17 demo-trading tools — without touching real money.
- JSON file, environment, and CLI configuration with deterministic precedence and per-toolset/per-tool allowlists; unknown configuration keys fail validation with the offending property named.
- Mutual-exclusive API-key-pair and bearer-token authentication, automatic request IDs, and credential redaction.
- OpenAPI 3.0/JSON Schema mixed-dialect compilation with local `$defs`, nullable schemas, and the PNG/JPEG multipart upload.
- Shared rate-limit tracking, conservative read-only retries, bounded timeouts and response sizes, redirect rejection, and structured HTTP results.
- Generated tool/toolset references plus configuration, trading, security, and troubleshooting guides.
- Agent-oriented `INSTALL.md` and human-oriented `README.md`.
- Unit and MCP stdio integration suites covering all catalog operations without live eToro calls.
- Daily Swagger synchronization workflow that opens reviewable update branches and pull requests.
- Tag-driven npm provenance publication through a protected GitHub Environment and GitHub release automation.

### Security

- Real-money mutations require both tool selection and `ETORO_ALLOW_REAL_MONEY=true`.
- eToro portal passwords are never accepted.
- Credentials and request/response bodies are excluded from diagnostics.
