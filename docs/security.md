# Security and privacy

## Threat boundary

The MCP server runs locally and calls `https://public-api.etoro.com` only. It does not host an HTTP listener, accept arbitrary request URLs, follow redirects, or execute downloaded JavaScript. OpenAPI documents are parsed as data.

## Credentials

- Supported environment credentials:
  - `ETORO_API_KEY` plus `ETORO_USER_KEY`; or
  - `ETORO_ACCESS_TOKEN`.
- The two methods are mutually exclusive.
- Portal usernames and passwords are never accepted.
- Credentials are not valid JSON configuration properties.
- Credentials are redacted from diagnostics and local error messages.
- Request/response bodies and uploaded file content are never logged.

Treat MCP client configuration files as potentially plaintext. If your client supports secret references or inherited process environment, prefer those over literal values.

## Real-money protection

No toolsets are enabled by default; tools are exposed only when their toolset or operation is listed in configuration. Real-money mutations additionally require `ETORO_ALLOW_REAL_MONEY=true`. See [trading.md](trading.md).

Annotations are advisory. Configure your MCP client to require human confirmation for state-changing tools, especially any real-money operation.

## Local files

The only local-file tool input is the documented image attachment upload. The server:
- accepts an explicit `filePath` supplied by the caller;
- requires a regular file;
- enforces eToro's 8 MiB limit;
- detects PNG/JPEG content rather than trusting a filename;
- does not log file bytes.

Do not enable social-feed upload tools in an environment where an agent should not be able to send local images to eToro.

## Untrusted remote content

eToro social posts, profiles, news, descriptions, symbols, and error text are remote data. They can contain text that looks like instructions. This server treats them as data and does not follow instructions embedded in them. Agents and clients should do the same and should not change local configuration based on remote content without user approval.

## Diagnostics

- stdout is reserved exclusively for MCP protocol traffic.
- Diagnostics go to stderr as JSON lines.
- `debug` includes operation ID, method, path template, status, duration, and request ID—not credentials or bodies.
- Set `ETORO_LOG_LEVEL=error` or `warn` to reduce output.

## Reporting

Use the repository's published security policy for supported versions and private vulnerability reporting. Please do not open a public issue containing credentials, tokens, account numbers, or personal data.
