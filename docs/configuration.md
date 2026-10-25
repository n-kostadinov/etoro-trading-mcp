# Configuration

The local server is configured from three non-secret layers. Credentials are never stored in a configuration file.

```text
built-in defaults < JSON configuration file < environment variables < CLI flags
```

The layers merge per property. A higher layer that defines an array replaces the same lower-layer array; arrays are not concatenated. Restart the MCP client after changing configuration because the effective tool list is fixed when the server process starts.

## Defaults

- Enabled toolsets: `market-data` and `trading-demo`.
- Legacy tools are excluded.
- Real-money mutations are excluded.
- Result: **28 current tools** (11 market-data tools and 17 current demo-trading tools).

## Settings

| JSON property       | Environment variable       | CLI flag                                           | Default          | Meaning                                                    |
| ------------------- | -------------------------- | -------------------------------------------------- | ---------------- | ---------------------------------------------------------- |
| _none_              | `ETORO_CONFIG`             | `--config <path>`                                  | no implicit file | Explicit JSON configuration file                           |
| `enabledToolsets`   | `ETORO_ENABLED_TOOLSETS`   | repeated `--enable-toolset <id>`                   | `[]`             | Add toolsets to the defaults                               |
| `disabledToolsets`  | `ETORO_DISABLED_TOOLSETS`  | repeated `--disable-toolset <id>`                  | `[]`             | Remove toolsets, including defaults                        |
| `enabledTools`      | `ETORO_ENABLED_TOOLS`      | repeated `--enable-tool <operationId>`             | `[]`             | Enable individual tools even if its toolset is disabled    |
| `disabledTools`     | `ETORO_DISABLED_TOOLS`     | repeated `--disable-tool <operationId>`            | `[]`             | Disable individual tools; this wins over every enable rule |
| `includeDeprecated` | `ETORO_INCLUDE_DEPRECATED` | `--include-deprecated` / `--no-include-deprecated` | `false`          | Permit legacy operations                                   |
| `allowRealMoney`    | `ETORO_ALLOW_REAL_MONEY`   | `--allow-real-money` / `--no-allow-real-money`     | `false`          | Permit selected real-money mutations                       |
| `requestTimeoutMs`  | `ETORO_TIMEOUT_MS`         | `--timeout-ms <ms>`                                | `30000`          | Per-request timeout, 1000–600000                           |
| `maxResponseBytes`  | `ETORO_MAX_RESPONSE_BYTES` | `--max-response-bytes <n>`                         | `26214400`       | Response size bound, 1024–268435456                        |
| `logLevel`          | `ETORO_LOG_LEVEL`          | `--log-level <error                                | warn             | info                                                       | debug>` | `info` | stderr diagnostics level |

Environment lists are comma-separated and trimmed. An empty environment list clears that lower-layer list. Booleans accept only `true` or `false` without regard to case. Unknown JSON properties, unknown tool/toolset names, malformed values, and non-object JSON files fail with actionable errors.

## Selection and safety order

1. Start with `market-data` and `trading-demo`.
2. Add `enabledToolsets`.
3. Remove `disabledToolsets`.
4. Select every operation in the resulting toolsets.
5. Add `enabledTools`, even when the toolset was disabled.
6. Remove `disabledTools`; explicit disable wins.
7. Apply safety gates:
   - A legacy operation also requires `includeDeprecated: true`.
   - A real-money mutation also requires `allowRealMoney: true`.
8. A read-only real-account operation is not itself a real-money mutation.

Zero enabled tools is allowed so inspection remains possible, but the server logs a warning and exposes an empty tool list.

## JSON example

Create a file at an explicit path, for example `etoro-mcp.config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/n-kostadinov/etoro-trading-mcp/main/schemas/config.schema.json",
  "enabledToolsets": ["watchlists", "identity"],
  "disabledToolsets": ["trading-demo"],
  "enabledTools": ["getRates"],
  "disabledTools": ["createTradingExecutionDemoOrdersV3"],
  "includeDeprecated": false,
  "allowRealMoney": false,
  "requestTimeoutMs": 30000,
  "maxResponseBytes": 26214400,
  "logLevel": "info"
}
```

Run it explicitly:

```bash
ETORO_API_KEY="$ETORO_API_KEY" \
ETORO_USER_KEY="$ETORO_USER_KEY" \
ETORO_CONFIG="/absolute/path/to/etoro-mcp.config.json" \
npx -y etoro-trading-mcp@1.0.0
```

There is deliberately no automatic search of the current directory or home directory. This prevents an untrusted project from changing your tool exposure merely because you run npx there.

## Environment examples

Add one toolset while retaining the defaults:

```bash
ETORO_ENABLED_TOOLSETS=watchlists npx -y etoro-trading-mcp@1.0.0
```

Disable a default toolset:

```bash
ETORO_DISABLED_TOOLSETS=trading-demo npx -y etoro-trading-mcp@1.0.0
```

Enable one current tool without its whole toolset:

```bash
ETORO_ENABLED_TOOLS=getMe npx -y etoro-trading-mcp@1.0.0
```

Disable one default tool:

```bash
ETORO_DISABLED_TOOLS=createTradingExecutionDemoOrdersV3 npx -y etoro-trading-mcp@1.0.0
```

A legacy tool needs both its selection and the legacy gate, for example:

```bash
ETORO_ENABLED_TOOLS=postFeedsPost \
ETORO_INCLUDE_DEPRECATED=true \
npx -y etoro-trading-mcp@1.0.0
```

A real-money mutation needs both its selection and the real-money gate. Do not set the second gate unless you intended to permit live funds movement.

## Inspection commands

These commands never contact eToro and work without credentials.

```bash
npx -y etoro-trading-mcp@1.0.0 tools list
npx -y etoro-trading-mcp@1.0.0 tools list --all
npx -y etoro-trading-mcp@1.0.0 tools list --json
npx -y etoro-trading-mcp@1.0.0 config validate
npx -y etoro-trading-mcp@1.0.0 config validate --json
```

`tools list --all` shows every catalog operation with its toolset, request identity, and one of these states:
- `enabled`
- `toolset is not selected and the tool is not individually enabled`
- `blocked: legacy tools require includeDeprecated`
- `blocked: real-money mutations require allowRealMoney`
- `disabled by disabledTools`
