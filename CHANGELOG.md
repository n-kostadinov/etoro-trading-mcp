# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
