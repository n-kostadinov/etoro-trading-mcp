# Security Policy

## Supported versions

Only the latest published `1.x` release receives security fixes. Verify the current version at [npm](https://www.npmjs.com/package/etoro-trading-mcp).

## Reporting a vulnerability

Please report security vulnerabilities privately using [GitHub security advisories](https://github.com/n-kostadinov/etoro-trading-mcp/security/advisories/new).

Include:
- affected version or commit;
- reproduction steps or proof of concept;
- impact, especially credential exposure, real-money exposure, or local file handling;
- any mitigations you identified.

Please do not open a public issue for a suspected vulnerability.

## Credential handling

The server accepts only:
- `ETORO_API_KEY` plus `ETORO_USER_KEY`; or
- `ETORO_ACCESS_TOKEN`.

It never accepts an eToro portal password. Keep credentials in your MCP client's secret mechanism or process environment. If credentials may have been exposed, revoke or regenerate them in eToro's API key management interface immediately.

## Safety boundaries

- Default tools are read-only market data plus virtual demo trading.
- Real-money mutations require both tool selection and `ETORO_ALLOW_REAL_MONEY=true`.
- Redirects are rejected so credentials are not forwarded to another origin.
- Response size and request duration are bounded.
- Credentials are redacted from stderr diagnostics and error messages.
- Remote eToro/social content is treated as untrusted data.

These boundaries reduce risk but do not replace user confirmation in the MCP client.
