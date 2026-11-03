import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadSource } from "./acquire-openapi.js";
import { determineSwaggerDrift, type PreviousSourceManifest } from "./lib/swagger-drift.js";
import { OPENAPI_SOURCES } from "./lib/openapi.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

const previousManifest = await readFile(
  path.join(repositoryRoot, "openapi", "source-manifest.json"),
  "utf8",
)
  .then((content) => JSON.parse(content) as PreviousSourceManifest)
  .catch(() => null);

const acquired = await Promise.all(OPENAPI_SOURCES.map((source) => downloadSource(source)));
const drift = determineSwaggerDrift({ previousManifest, acquired });

console.log(JSON.stringify({ unchanged: !drift.changed, ...drift }, null, 2));

if (drift.changed) {
  for (const change of drift.changes) {
    console.error(
      `${change.id} changed: ${change.fromVersion ?? "unknown"} (${change.fromCanonicalSha256 ?? "unknown"}) -> ${change.toVersion} (${change.toCanonicalSha256})`,
    );
  }
  process.exit(1);
}
