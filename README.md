# eToro Trading MCP

Local [Model Context Protocol](https://modelcontextprotocol.io) server for eToro's public Swagger UI API. Its main purpose is **configuration for AI agents**: you register it once in an MCP client and enable exactly the toolsets your agent needs. The command line exists only for local inspection (`tools list`, `config validate`), not for day-to-day use.

**This MCP is scanning the eToro APIs for updates daily**: an automated daily job downloads eToro's current OpenAPI documents, detects upstream changes, and opens a pull request with fully regenerated and verified tools—nothing is merged or published automatically.

[![npm](https://img.shields.io/npm/v/etoro-trading-mcp)](https://www.npmjs.com/package/etoro-trading-mcp)
[![CI](https://github.com/n-kostadinov/etoro-trading-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/n-kostadinov/etoro-trading-mcp/actions/workflows/ci.yml)
[![Release](https://github.com/n-kostadinov/etoro-trading-mcp/actions/workflows/release.yml/badge.svg)](https://github.com/n-kostadinov/etoro-trading-mcp/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D22-green)

## Install with an AI agent

Give this one instruction to your coding or desktop agent:

```text
Install and configure this MCP server by following https://github.com/n-kostadinov/etoro-trading-mcp/blob/main/INSTALL.md
```

The agent-facing guide is also available as [raw Markdown](https://raw.githubusercontent.com/n-kostadinov/etoro-trading-mcp/main/INSTALL.md).

## What you get

- **197 fine-grained MCP tools** generated from eToro Swagger UI—one tool per REST operation.
- **27 toolsets, all disabled by default**: listing toolsets or tools in configuration is the only way to enable them. Enabling a toolset enables every tool in it.
- **Demo-safe example configuration**: `ETORO_ENABLED_TOOLSETS=market-data,trading-demo` enables 28 tools (11 market-data tools and 17 current demo-trading tools) without touching real money.
- Real-money mutations stay hidden unless you enable their tools **and** set `ETORO_ALLOW_REAL_MONEY=true`.
- Legacy operations remain available only through an explicit `includeDeprecated` opt-in.
- TypeScript, Node.js 22+, stdio transport, and one npx command—no global install.
- Automatic request IDs, shared rate-limit tracking, conservative retries, structured HTTP responses, and credential redaction.

## Quick look: configure your agent

All toolsets are disabled by default. A typical, demo-safe MCP client entry:

```json
{
  "mcpServers": {
    "etoro": {
      "command": "npx",
      "args": ["-y", "etoro-trading-mcp@1.0.1"],
      "env": {
        "ETORO_API_KEY": "<user-supplied-application-key>",
        "ETORO_USER_KEY": "<user-supplied-user-key>",
        "ETORO_ENABLED_TOOLSETS": "market-data,trading-demo",
        "ETORO_ALLOW_REAL_MONEY": "false"
      }
    }
  }
}
```

Credentials are environment-only. An API key pair and user key, or an OAuth bearer token, can be used—never both and never a portal password.

### Where to find `x-api-key` and `x-user-key`

The key pair comes from eToro's **API Key Management** page—open the [annotated screenshot](keys_explained.png) to see exactly which value is which:
- **`x-api-key`** — the **Public Key** shown at the top of the page. It identifies your application and is supplied to this server as `ETORO_API_KEY`.
- **`x-user-key`** — one of the keys you create with **Create Your API Key**; it appears in the **Generated Keys** list, identifies your eToro user, and is supplied as `ETORO_USER_KEY`.

Every authenticated request sends both headers together. Start with a **Demo** key with **Read & Write** permissions; see [INSTALL.md](INSTALL.md#2-obtain-etoro-credentials) for the full walkthrough.

### How to enable tools

| Purpose                                      | Environment variable                              | JSON file property                                   |
| -------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Enable toolsets (every tool in each toolset) | `ETORO_ENABLED_TOOLSETS=market-data,trading-demo` | `"enabledToolsets": ["market-data", "trading-demo"]` |
| Enable individual tools                      | `ETORO_ENABLED_TOOLS=getRates,getMe`              | `"enabledTools": ["getRates", "getMe"]`              |
| Permit legacy tools                          | `ETORO_INCLUDE_DEPRECATED=true`                   | `"includeDeprecated": true`                          |
| Permit real-money mutations                  | `ETORO_ALLOW_REAL_MONEY=true`                     | `"allowRealMoney": true`                             |

Environment lists are comma-separated; JSON properties take arrays. Precedence is built-in defaults < JSON file (`ETORO_CONFIG`) < environment < CLI flags, with higher layers replacing (not merging) lists. The same example as an explicit JSON file (`ETORO_CONFIG=/absolute/path/to/etoro-mcp.config.json`):

```json
{
  "$schema": "https://raw.githubusercontent.com/n-kostadinov/etoro-trading-mcp/main/schemas/config.schema.json",
  "enabledToolsets": ["market-data", "trading-demo"],
  "includeDeprecated": false,
  "allowRealMoney": false
}
```

See [Configuration](docs/configuration.md) for every setting.

Two safety gates stay separate from selection: legacy tools additionally require `includeDeprecated`, and real-money mutations additionally require `allowRealMoney`. Real-money mutations live in four toolsets—`trading-real`, `copy-trading`, `transfer`, and `sub-accounts-etoro-trading`—so enabling those toolsets exposes live-funds operations only when the second gate is also set.

### Available toolsets (27)

| Toolset             | Current | Legacy |     | Toolset                         | Current | Legacy |
| ------------------- | ------: | -----: | --- | ------------------------------- | ------: | -----: |
| `agent-portfolios`  |       7 |      3 |     | `rankings`                      |       7 |      0 |
| `app-data`          |       1 |      0 |     | `social-feeds`                  |      37 |      4 |
| `balances`          |       6 |      0 |     | `sso-applications`              |       5 |      0 |
| `cash-accounts`     |       1 |      0 |     | `sso-scopes`                    |       1 |      0 |
| `clubs`             |       1 |      0 |     | `sub-accounts`                  |       2 |      0 |
| `copy-trading` ⚠️   |       5 |      0 |     | `sub-accounts-etoro-trading` ⚠️ |       6 |      0 |
| `copy-trading-demo` |       5 |      0 |     | `top-assets`                    |       1 |      0 |
| `data`              |       4 |      0 |     | `trading-demo`                  |      17 |      6 |
| `identity`          |       1 |      0 |     | `trading-real` ⚠️               |      17 |      6 |
| `market-data`       |      11 |      0 |     | `transfer` ⚠️                   |       7 |      0 |
| `notifications`     |       2 |      0 |     | `user-stats`                    |       4 |      0 |
| `pi-data`           |       1 |      0 |     | `users-info`                    |       6 |      0 |
| `portfolio-search`  |       1 |      0 |     | `watchlists`                    |      18 |      0 |
| `price-alerts`      |       4 |      0 |     |                                 |         |        |

⚠️ marks toolsets containing real-money mutations (gated by `allowRealMoney` regardless of selection). "Current" tools are enabled with the toolset; "legacy" tools additionally need `includeDeprecated`. Every operation ID is listed in the [tool reference](docs/tools.md); the toolset breakdown is in [toolsets](docs/toolsets.md).

### Local inspection (secondary)

The CLI never contacts eToro for these commands and works without credentials:

```bash
npx -y etoro-trading-mcp@1.0.1 tools list --all    # every operation and its state
npx -y etoro-trading-mcp@1.0.1 config validate     # effective settings and warnings
```

## Documentation

- [INSTALL](INSTALL.md) — complete agent and manual setup guide
- [Configuration](docs/configuration.md) — file/environment/CLI precedence and every setting
- [Toolsets](docs/toolsets.md) — all 27 toolsets with counts
- [Tool reference](docs/tools.md) — every generated tool, request, scope alternative, and replacement
- [Trading](docs/trading.md) — demo versus real money, scopes, asynchronous orders, and safety
- [Security](docs/security.md) — credentials, local files, diagnostics, and untrusted content
- [Troubleshooting](docs/troubleshooting.md) — startup, authentication, limits, and configuration issues

## Safety and project status

This is an independent, unofficial project. It is not affiliated with, endorsed by, or sponsored by eToro. eToro names and trademarks belong to eToro. Nothing in this repository is investment advice. Demo trading uses virtual funds; real trading can lose real money and requires two explicit opt-ins.

Current release: **1.0.1**, generated from eToro Swagger UI **v1.400.0**. Daily automation opens a review pull request when eToro's published API changes; it never automatically merges, tags, or publishes.

## Contribute

MIT licensed. See [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md), and [SECURITY.md](SECURITY.md) for development, release history, and reporting guidance.
