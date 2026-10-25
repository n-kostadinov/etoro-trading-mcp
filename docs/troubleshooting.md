# Troubleshooting

## Installation and startup

**`npx` cannot find Node or exits immediately**
- Require Node.js 22 or newer: `node --version`.
- Try `npx -y etoro-trading-mcp@1.0.0 --version`.
- Behind a proxy, configure npm and Node environment variables according to your organization's policy.

**The server appears to hang**

With no inspection subcommand, the executable is a stdio MCP server. It waits on stdin for MCP traffic. This is normal. Run `--help`, `tools list`, or `config validate` for terminal commands.

**No tools are listed**

Run:

```bash
npx -y etoro-trading-mcp@1.0.0 config validate
npx -y etoro-trading-mcp@1.0.0 tools list --all
```

Check whether all enabled toolsets were disabled or individual disables removed every tool. An empty list is allowed but produces a startup warning.

## Credentials

**401 Unauthorized**
- With an API key pair, confirm both `ETORO_API_KEY` and `ETORO_USER_KEY` are set.
- With OAuth, `ETORO_ACCESS_TOKEN` must be unexpired. The server does not refresh tokens.
- Do not combine the two methods.

**Mixed credential startup error**

`ETORO_ACCESS_TOKEN is mutually exclusive...` means more than one credential variable was supplied. Choose one authentication method.

**403 Forbidden**

The credential lacks a permitted scope/permission for that operation. Check the tool's OAuth alternatives in [tools.md](tools.md) and your eToro key's Demo/Real and Read/Write permissions.

## Tools and configuration

**Unknown toolset or tool name**

The error lists the invalid names and points to `tools list --all`. Tool names are case-sensitive upstream `operationId` values; toolset IDs are lowercase kebab-case IDs in [toolsets.md](toolsets.md).

**A legacy tool stays unavailable**

Enable the tool or its toolset and set `ETORO_INCLUDE_DEPRECATED=true`.

**A real-money tool stays unavailable**

Enable the tool or its toolset and set `ETORO_ALLOW_REAL_MONEY=true`. Do this only if you intend to permit real-funds actions.

**Configuration appears ignored**
- Confirm the file is explicitly selected with `--config` or `ETORO_CONFIG`; there is no implicit search.
- Remember property precedence: defaults < file < environment < CLI.
- Run `config validate --json` to inspect the effective settings and tool counts.
- Restart the MCP client after changes.

## eToro responses

**429 Too Many Requests**

The relevant shared pool is exhausted. Wait for the returned `retryAfterMs`/`Retry-After` period, reduce polling, and remember that many endpoints share one pool.

**404 Not Found**

Check the instrument ID, symbol, order ID, position ID, username, or path parameter. Search for the instrument first rather than guessing IDs.

**202 but no execution**

A 202 means accepted, not executed. Poll the operation's order lookup tool and inspect status/error fields.

**Timeout or ambiguous mutation**

Do not immediately resubmit. Check the result using the operation's lookup tool and the returned request ID. The server will not automatically retry a potentially dispatched mutation.

**Unexpected redirect or oversized response**

Redirects are rejected to protect credentials. If eToro unexpectedly redirects a documented endpoint, report it in a GitHub issue. Large responses can be bounded with `maxResponseBytes`; raise it only if the documented response legitimately requires it.

## Diagnostics

Set `ETORO_LOG_LEVEL=debug` and inspect stderr JSON lines for operation ID, request ID, status, and duration. stdout must remain valid MCP JSON; if a client shows non-JSON stdout, report the issue.
