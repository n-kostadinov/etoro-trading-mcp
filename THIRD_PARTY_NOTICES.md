# Third-Party Notices

## eToro API documents and names

This project is an unofficial, independent MCP adapter. It is not affiliated with, endorsed by, or sponsored by eToro. eToro names, trademarks, API documentation, OpenAPI documents, schemas, descriptions, and examples remain the property of their respective owners.

The files under `openapi/` are attributed snapshots downloaded from these official public sources:
- Swagger UI OpenAPI: <https://public-api.etoro.com/swagger/swagger.json>
- Core OpenAPI: <https://api-portal.etoro.com/api-reference/openapi.json>
- Deprecated OpenAPI: <https://api-portal.etoro.com/api-reference/deprecated-openapi.json>

Their source URLs, versions, retrieval date, and SHA-256 hashes are recorded in `openapi/source-manifest.json`. Swagger UI is the canonical operation source; the Core and Deprecated documents provide consistency and legacy-operation metadata.

The project's MIT license applies to the project's original code. It does not assert ownership of, or independently relicense, eToro's API documents, descriptions, names, or trademarks.

## Runtime and development dependencies

Third-party npm dependencies retain their own licenses. The committed npm lockfile records the exact dependency graph used for reproducible installation and verification.
