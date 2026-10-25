---

name: Bug report
about: Report unexpected behavior without credentials or account data
title: '[bug] '
labels: ['bug', 'triage']
assignees: []
---

## Description

Clearly describe what happened and what you expected.

## Environment

- Package version:
- Node version:
- Operating system:
- MCP client and version:
- Toolset configuration (redacted):

## Tool involved

If applicable, provide the tool name from `tools list --all` and its REST request identity.

## Steps to reproduce

1.
2.
3.

## Observed result

Include sanitized stderr JSON diagnostics and the tool result envelope. Remove request IDs only if they are sensitive to you; they contain no credentials.

## Expected result

## Safety impact

Does this involve real money, credentials, local files, or unexpected tool exposure?
- [ ] No
- [ ] Yes — describe the impact without including secrets

## Checklist

- [ ] I did not include API keys, user keys, bearer tokens, passwords, or personal/account data.
