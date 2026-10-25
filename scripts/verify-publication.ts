import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeReleaseTag } from "./lib/release-notes.js";
import {
  registryViewArguments,
  verifyPublishedVersion,
  type CommandOutput,
} from "./lib/npm-registry.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const requestedTag = process.argv.slice(2)[0];
if (requestedTag === undefined) {
  throw new Error("Usage: npm run publication:verify -- vX.Y.Z");
}
const version = normalizeReleaseTag(requestedTag);
const parsedPackage = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
) as { name: string; version: string };
if (parsedPackage.version !== version) {
  throw new Error(`Tag v${version} does not match package version ${parsedPackage.version}`);
}

// The registry can take a few seconds to serve metadata for a fresh publish,
// so poll briefly before declaring the publication unverified.
const attemptCount = 6;
const retryDelayMs = 5000;
let latest: CommandOutput = { status: null, stdout: "", stderr: "" };
for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
  const view = spawnSync("npm", registryViewArguments(parsedPackage.name, version), {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  latest = {
    status: view.status,
    stdout: String(view.stdout ?? ""),
    stderr: String(view.stderr ?? ""),
  };
  if (latest.status === 0) {
    break;
  }
  if (attempt < attemptCount) {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}
const published = verifyPublishedVersion(parsedPackage.name, version, latest);
console.log(
  JSON.stringify(
    {
      published: true,
      name: parsedPackage.name,
      version: published.version,
      tarballUrl: published.tarballUrl,
      provenanceAttestation: published.provenanceAttestation,
    },
    null,
    2,
  ),
);
