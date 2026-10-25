# eToro Trading MCP

Local [Model Context Protocol](https://modelcontextprotocol.io) server for eToro's public Swagger UI API, focused by default on stock/instrument market data and virtual demo trading.

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
- **27 configurable toolsets**: market data, demo and real trading, watchlists, social feeds, rankings, balances, transfers, and more.
- **28 safe defaults**: 11 market-data tools and 17 current demo-trading tools.
- Real-money mutations stay hidden unless you enable their tools **and** set `ETORO_ALLOW_REAL_MONEY=true`.
- Legacy operations remain available only through an explicit `includeDeprecated` opt-in.
- TypeScript, Node.js 22+, stdio transport, and one npx command—no global install.
- Automatic request IDs, shared rate-limit tracking, conservative retries, structured HTTP responses, and credential redaction.

## Quick look

```bash
npx -y etoro-trading-mcp@1.0.0 --version
npx -y etoro-trading-mcp@1.0.0 tools list
npx -y etoro-trading-mcp@1.0.0 config validate
```

A typical MCP client entry looks like this:

```json
{
  "mcpServers": {
    "etoro": {
      "command": "npx",
      "args": ["-y", "etoro-trading-mcp@1.0.0"],
      "env": {
        "ETORO_API_KEY": "<user-supplied-application-key>",
        "ETORO_USER_KEY": "<user-supplied-user-key>",
        "ETORO_ALLOW_REAL_MONEY": "false"
      }
    }
  }
}
```

Credentials are environment-only. An API key pair and user key, or an OAuth bearer token, can be used—never both and never a portal password.

## Documentation

- [INSTALL](INSTALL.md) — complete agent and manual setup guide
- [Configuration](docs/configuration.md) — file/environment/CLI precedence and every setting
- [Toolsets](docs/toolsets.md) — all 27 toolsets, counts, and defaults
- [Tool reference](docs/tools.md) — every generated tool, request, scope alternative, and replacement
- [Trading](docs/trading.md) — demo versus real money, scopes, asynchronous orders, and safety
- [Security](docs/security.md) — credentials, local files, diagnostics, and untrusted content
- [Troubleshooting](docs/troubleshooting.md) — startup, authentication, limits, and configuration issues

## Safety and project status

This is an independent, unofficial project. It is not affiliated with, endorsed by, or sponsored by eToro. eToro names and trademarks belong to eToro. Nothing in this repository is investment advice. Demo trading uses virtual funds; real trading can lose real money and requires two explicit opt-ins.

Current release: **1.0.0**, generated from eToro Swagger UI **v1.400.0**. Daily automation opens a review pull request when eToro's published API changes; it never automatically merges, tags, or publishes.

## Contribute

MIT licensed. See [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md), and [SECURITY.md](SECURITY.md) for development, release history, and reporting guidance.
