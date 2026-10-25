# Contributing to eToro Trading MCP

Thanks for improving this unofficial, MIT-licensed eToro MCP server.

## Project principles

1. **Coverage follows eToro's Swagger UI document.** Do not add hand-written endpoint wrappers or a generic arbitrary-request tool.
2. **Safety defaults matter.** Market data and current demo trading are enabled by default. Real-money mutations require a second explicit opt-in.
3. **Generated files are artifacts.** Change the compiler, policy data, or generator—not `src/generated`, `docs/tools.md`, or `docs/toolsets.md` directly.
4. **Never commit credentials.** Use placeholders in examples and never paste real API keys, user keys, or bearer tokens.
5. **This is not investment advice.** Do not add automated trading strategy features.

## Development setup

Requirements:
- Node.js 22 or newer
- npm with the committed lockfile

```bash
npm install
npm run verify
```

`npm run verify` runs formatting, lint, type checking, unit tests, integration tests, generated-artifact freshness, documentation checks, build, and package checks.

## Useful commands

```bash
npm run acquire              # download and validate official OpenAPI documents
npm run generate             # regenerate manifest, catalog, types, data, and docs
npm run generate:check       # ensure generated artifacts are current
npm run test                 # focused unit and regression tests
npm run test:integration     # MCP stdio contract tests with a fake eToro transport
npm run docs:check           # generated coverage, examples, links, spelling
npm run build
```

## OpenAPI and generated artifacts

The canonical upstream sources are recorded in `openapi/source-manifest.json`:
- Swagger UI: `https://public-api.etoro.com/swagger/swagger.json`
- Core: `https://api-portal.etoro.com/api-reference/openapi.json`
- Deprecated: `https://api-portal.etoro.com/api-reference/deprecated-openapi.json`

If upstream changes:
1. Run `npm run acquire`.
2. Run `npm run generate`.
3. Review policy overrides in `openapi/policy-overrides.json`, especially real-money classification and replacements.
4. Add or update tests for new behavior.
5. Submit the semantic source diff in your pull request.

A reviewer must see and discuss any operation removal, rename, schema incompatibility, or real-money classification change.

## Testing expectations

- Unit tests should cover changed logic without network access.
- Use the existing recording fake transport for MCP dispatch behavior; do not call live eToro in tests.
- Every generated operation must remain dispatchable through the integration contract test.
- Configuration and safety-policy changes need focused regression coverage.
- Documentation examples must validate against `schemas/config.schema.json`.

## Pull requests

Use the PR template and include:
- the user-visible problem or capability;
- implementation summary;
- verification commands and results;
- generated-artifact freshness confirmation;
- safety impact, especially for tool defaults, legacy operations, or real-money operations.

Maintainers may ask for design discussion before substantial architecture changes.

## Release involvement

Maintainers cut releases from reviewed `main` commits using `vX.Y.Z` tags. Do not publish npm versions from a feature branch. See [MAINTAINERS.md](MAINTAINERS.md) for the one-time setup and the exact procedure.

## License

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE). eToro names, API descriptions, and trademarks remain the property of their respective owners.
