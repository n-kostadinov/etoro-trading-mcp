## Summary

Describe the user-visible change and the reason it belongs in this project.

## Scope and safety

- [ ] No generic arbitrary-request tool was added.
- [ ] Swagger UI coverage remains one tool per REST operation.
- [ ] Default exposure remains market data plus current demo trading unless intentionally changed.
- [ ] Real-money classification changes are explicit and reviewed.
- [ ] Legacy/replacement handling is correct.
- [ ] No credentials, tokens, account data, or local secrets are included.

## Implementation notes

Summarize important design decisions and alternatives considered.

## Generated artifacts

- [ ] `npm run generate:check` passes.
- [ ] Generated manifest, catalog, types, data, and documentation were regenerated rather than hand-edited.

## Verification

Run the relevant commands and record results:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run docs:check
npm run build
npm run pack:check
```

## User documentation

- [ ] README/INSTALL updates are included when user behavior changed.
- [ ] Configuration/tool/trading/security/troubleshooting docs are updated where applicable.
- [ ] CHANGELOG has a user-facing entry for release-worthy changes.
