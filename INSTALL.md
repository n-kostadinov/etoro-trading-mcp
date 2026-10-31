# Install and configure eToro Trading MCP

This guide is written for an AI agent or a human following it step by step. It configures the demo-safe example setup: eToro market data plus current demo-trading tools, enabled explicitly through `ETORO_ENABLED_TOOLSETS`. No toolsets are enabled by default.

Canonical URLs:
- GitHub guide: <https://github.com/n-kostadinov/etoro-trading-mcp/blob/main/INSTALL.md>
- Raw guide: <https://raw.githubusercontent.com/n-kostadinov/etoro-trading-mcp/main/INSTALL.md>

## Agent rules

1. Treat this project as an **unofficial, community MCP server**. It is not affiliated with eToro.
2. Ask before editing an MCP client configuration. Back up the existing file first.
3. Never request, accept, store, print, or commit an eToro portal password. This server cannot use one.
4. Never print credential values. Use placeholders while editing and let the user supply real values through a secure prompt or their client's secret mechanism.
5. Keep `ETORO_ALLOW_REAL_MONEY` unset or `false`. Do not enable real-money toolsets unless the user explicitly asks for live trading.
6. Preserve unrelated MCP servers and configuration properties. Merge an `etoro` entry; do not replace the file.
7. Restart the MCP client after configuration changes. The effective tool list is fixed when the server process starts.

## 1. Check the runtime

Run:

```bash
node --version
npm --version
```

Require Node.js `>=22`. If Node is older, stop and ask the user how they want to upgrade it; do not change system-wide runtimes without consent.

Check the package without credentials:

```bash
npx -y etoro-trading-mcp@1.1.0 --version
npx -y etoro-trading-mcp@1.1.0 tools list
```

`--version` must print `1.1.0`. `tools list` must report **0 enabled tools**: nothing is enabled until you list toolsets. Neither command contacts eToro.

## 2. Obtain eToro credentials

The recommended default is an eToro API key pair:
1. Open eToro and go to **Settings → Trading → API Key Management → Create New Key** (follow eToro's current UI if labels differ).
2. Choose **Demo**, not Real.
3. Choose **Read & Write** permissions. Read-only credentials cannot place demo orders.
4. Copy the **Public API Key / application key** and **User Key** when eToro shows them.

Official authentication guidance:
- <https://api-portal.etoro.com/core/getting-started/authentication>
- <https://builders.etoro.com/learn/authentication-and-api-keys>

Map the copied values to:
- `ETORO_API_KEY` — application/public API key
- `ETORO_USER_KEY` — user key

An existing OAuth bearer token may be used instead with `ETORO_ACCESS_TOKEN`. For the example toolsets, the usual alternatives are `etoro-public:demo:read`, `etoro-public:demo:write`, `etoro-public:trade.demo:read`, and `etoro-public:trade.demo:write`; each tool lists its own accepted alternatives in [docs/tools.md](docs/tools.md). The server does not refresh expired tokens.

Use exactly one authentication method. Supplying both is a startup error.

## 3. Add the MCP server

A standard client entry is:

```json
{
  "mcpServers": {
    "etoro": {
      "command": "npx",
      "args": ["-y", "etoro-trading-mcp@1.1.0"],
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

Adapt the object to the client's existing shape. Common locations include:
- Claude Desktop: `claude_desktop_config.json`
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Cursor: `.cursor/mcp.json` in the workspace
- Other clients: use their `mcpServers` configuration or CLI command, with the same `command`, `args`, and `env`

If the client supports secret references or inherited process environment instead of literal values, prefer that mechanism. Otherwise ensure the configuration file has the most restrictive user-level access practical.

Before saving:
- replace both placeholders with the user's supplied values or configure their secure substitution;
- do not add `ETORO_ACCESS_TOKEN` when the key pair is present;
- keep `ETORO_ENABLED_TOOLSETS` at the demo-safe example unless the user asks for more;
- keep `ETORO_ALLOW_REAL_MONEY` false;
- keep a backup of the previous configuration.

## 4. Validate without calling eToro

Run with the same `ETORO_ENABLED_TOOLSETS` value:

```bash
ETORO_ENABLED_TOOLSETS=market-data,trading-demo npx -y etoro-trading-mcp@1.1.0 config validate --json
ETORO_ENABLED_TOOLSETS=market-data,trading-demo npx -y etoro-trading-mcp@1.1.0 tools list --json
```

Expected:
- `config validate`: `valid: true`, enabled toolsets `market-data` and `trading-demo`, 28 enabled tools.
- `tools list`: `enabledCount: 28`, `catalogOperationCount: 156`.
- Without `ETORO_ENABLED_TOOLSETS`, `enabledCount` is 0 because nothing is enabled by default.

To inspect all available operations and their blocked reasons:

```bash
npx -y etoro-trading-mcp@1.1.0 tools list --all
```

## 5. Restart and authorize a read-only smoke check

Restart the MCP client so it launches the new `etoro` server.

With the user's explicit approval, perform one read-only market-data workflow:
1. Use the instrument search tool to resolve a ticker the user chooses.
2. Use the rates tool with the returned instrument ID.
3. Report the bid/ask data. Do not place any order without a separate explicit request.

If the user does not authorize a network call, stop after local validation. Setup is already complete.

## 6. Optional configuration changes

Everything below is documented in detail in [docs/configuration.md](docs/configuration.md).

Add watchlists to the example set:

```json
"env": {
  "ETORO_ENABLED_TOOLSETS": "market-data,trading-demo,watchlists"
}
```

Use market data only:

```json
"env": {
  "ETORO_ENABLED_TOOLSETS": "market-data"
}
```

Enable one additional tool without its whole toolset:

```json
"env": {
  "ETORO_ENABLED_TOOLS": "getMe"
}
```

Use an explicit JSON file when settings grow:

```json
{
  "enabledToolsets": ["market-data", "trading-demo", "watchlists"],
  "enabledTools": ["getMe"],
  "includeDeprecated": false,
  "allowRealMoney": false,
  "requestTimeoutMs": 30000,
  "logLevel": "info"
}
```

Then add `ETORO_CONFIG=/absolute/path/to/etoro-mcp.config.json`. Do not put credentials in that file.

The full toolset catalog is in the README quick look and [docs/toolsets.md](docs/toolsets.md); every tool is listed in [docs/tools.md](docs/tools.md). Legacy tools need `ETORO_INCLUDE_DEPRECATED=true` in addition to selecting the tool or toolset. Real-money mutations need `ETORO_ALLOW_REAL_MONEY=true` in addition to selecting the tool or toolset; do not set this casually.

## 7. Troubleshoot

See [docs/troubleshooting.md](docs/troubleshooting.md) for:
- Node/npx startup problems;
- 401, 403, 404, and 429 responses;
- mixed or expired credentials;
- unknown tool/toolset names;
- legacy and real-money gates;
- asynchronous `202` order lookup;
- timeout and ambiguous mutation handling.

Security details are in [docs/security.md](docs/security.md).

## Agent completion checklist

Report back only the following, without credential values:
- Node version and package version;
- authentication method selected (key pair or bearer), not the secret;
- client configuration file updated and backed up;
- local validation counts (expected 28 of 156 with the example toolsets, 0 with none listed);
- whether a read-only market-data smoke check was authorized and its outcome;
- any remaining user action, normally just restarting the MCP client.
