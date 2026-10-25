---

name: Configuration issue
about: Get help with toolsets, safety gates, credentials setup, or MCP client registration
title: '[config] '
labels: ['configuration', 'triage']
assignees: []
---

## Goal

Describe the tools you want exposed, such as market data + demo trading, watchlists, or a single operation.

## Inspection output

Run each command and paste the redacted result:

```bash
npx -y etoro-trading-mcp@1.0.0 config validate --json
npx -y etoro-trading-mcp@1.0.0 tools list --all --json
```

## Configuration

Describe your file/environment/CLI settings. Replace credential values with `<redacted>`; do not paste real keys or tokens.

## MCP client

- Client name/version:
- Configuration location:
- Error or unexpected tool list:

## Safety gates

- [ ] I need legacy operations and understand `includeDeprecated`.
- [ ] I need real-money mutations and understand `allowRealMoney`.
- [ ] Neither gate above is required.

## Checklist

- [ ] I did not include credentials, tokens, passwords, or account data.
