import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import catalogModule from "../src/generated/tool-catalog.js";
import { buildReleaseNotes, normalizeReleaseTag } from "./lib/release-notes.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const arguments_ = process.argv.slice(2);

function valueFor(flag: string): string {
  const index = arguments_.indexOf(flag);
  const value = index === -1 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

const version = normalizeReleaseTag(valueFor("--tag"));
const output = valueFor("--output");
const [changelog, sourceManifest, packageMetadata] = await Promise.all([
  readFile(path.join(repositoryRoot, "CHANGELOG.md"), "utf8"),
  readFile(path.join(repositoryRoot, "openapi/source-manifest.json"), "utf8"),
  readFile(path.join(repositoryRoot, "package.json"), "utf8"),
]);
const parsedPackage = JSON.parse(packageMetadata) as {
  version: string;
  repository: { url?: string };
};
if (parsedPackage.version !== version) {
  throw new Error(`Tag version ${version} does not match package version ${parsedPackage.version}`);
}
const repositoryUrl = (parsedPackage.repository.url ?? "")
  .replace(/^git\+/u, "")
  .replace(/\.git$/u, "");
const notes = buildReleaseNotes({
  version,
  changelog,
  sourceManifest: JSON.parse(sourceManifest) as Parameters<
    typeof buildReleaseNotes
  >[0]["sourceManifest"],
  catalog: catalogModule,
  repositoryUrl,
});
await mkdir(path.dirname(path.join(repositoryRoot, output)), { recursive: true });
await writeFile(path.join(repositoryRoot, output), notes, "utf8");
console.log(`Generated ${output} for v${version}.`);
