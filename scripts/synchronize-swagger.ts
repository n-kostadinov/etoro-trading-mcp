import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { downloadSource, writeAcquiredSources, type AcquiredSource } from "./acquire-openapi.js";
import { generateArtifactsFromDisk, repositoryRoot } from "./lib/generation.js";
import { OPENAPI_SOURCES } from "./lib/openapi.js";
import { determineSynchronizationAction, swaggerSyncBranch } from "./lib/synchronization.js";
import { createSwaggerDiffReport } from "./lib/swagger-diff.js";
import { asOpenApiDocument, type OpenApiDocument } from "../src/openapi/model.js";

const dryRun = process.argv.includes("--dry-run");

function run(command: string, arguments_: string[]): string {
  const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  const result = spawnSync(executable, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(" ")} failed with status ${String(result.status)}:\n${String(result.stderr)}\n${String(result.stdout)}`,
    );
  }
  return `${String(result.stdout)}${String(result.stderr)}`;
}

async function readCurrentDocument(relativePath: string, name: string): Promise<OpenApiDocument> {
  return asOpenApiDocument(
    JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8")) as unknown,
    name,
  );
}

function sourceById(acquired: AcquiredSource[], id: string): AcquiredSource {
  const source = acquired.find((candidate) => candidate.id === id);
  if (source === undefined) {
    throw new Error(`Download did not include source ${id}`);
  }
  return source;
}

function remoteBranchManifest(branch: string): {
  sources?: Record<string, { canonicalSha256?: string }>;
} | null {
  const reference = `origin/${branch}`;
  const output = run("git", ["show", `${reference}:openapi/source-manifest.json`]).trim();
  if (output.length === 0) {
    return null;
  }
  return JSON.parse(output) as { sources?: Record<string, { canonicalSha256?: string }> };
}

function pullRequestBody(report: string, version: string, hash: string): string {
  return `${report}
## Review checklist

- Source version: \`${version}\`
- Swagger canonical SHA-256: \`${hash}\`
- Confirm operation additions, removals, renames, schema changes, deprecations, and scope/rate-limit changes.
- Confirm toolset mapping and safety policy overrides in \`openapi/policy-overrides.json\`.
- Select the npm package SemVer bump; upstream versioning does not automatically determine it.
- Merge this pull request manually. This automation never merges, tags, or publishes.
`;
}

const statusBefore = run("git", ["status", "--porcelain"]).trim();
if (statusBefore.length > 0) {
  throw new Error(`Refusing to synchronize a dirty working tree:\n${statusBefore}`);
}

const acquired = await Promise.all(OPENAPI_SOURCES.map((source) => downloadSource(source)));
const newSwaggerSource = sourceById(acquired, "swagger");
const targetHash = newSwaggerSource.canonicalSha256;
const targetVersion = newSwaggerSource.apiVersion;
const branch = swaggerSyncBranch(targetVersion, targetHash);
const currentManifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "openapi", "source-manifest.json"), "utf8"),
) as { sources?: Record<string, { canonicalSha256?: string }> };
const currentHash = currentManifest.sources?.swagger?.canonicalSha256 ?? null;
const branchExists = run("git", ["ls-remote", "--heads", "origin", branch]).trim().length > 0;
let existingBranchHash: string | null | undefined;
if (branchExists) {
  run("git", [
    "fetch",
    "--no-tags",
    "origin",
    `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
  ]);
  existingBranchHash = remoteBranchManifest(branch)?.sources?.swagger?.canonicalSha256 ?? null;
} else {
  existingBranchHash = undefined;
}
const action = determineSynchronizationAction({
  currentCanonicalSha256: currentHash,
  targetCanonicalSha256: targetHash,
  existingBranchCanonicalSha256: existingBranchHash,
});
if (action.type === "none" || action.type === "skip") {
  console.log(
    JSON.stringify({
      action: action.type,
      reason: action.reason,
      branch,
      targetVersion,
      targetHash,
    }),
  );
  process.exit(0);
}
if (action.type === "fail") {
  throw new Error(`${action.reason}; branch=${branch}`);
}

const oldDocuments = {
  oldSwagger: await readCurrentDocument("openapi/etoro.swagger.json", "old swagger"),
  oldCore: await readCurrentDocument("openapi/etoro.core.json", "old core"),
  oldDeprecated: await readCurrentDocument("openapi/etoro.deprecated.json", "old deprecated"),
};
const newDocuments = {
  newSwagger: newSwaggerSource.document as OpenApiDocument,
  newCore: sourceById(acquired, "core").document as OpenApiDocument,
  newDeprecated: sourceById(acquired, "deprecated").document as OpenApiDocument,
};
const report = createSwaggerDiffReport({ ...oldDocuments, ...newDocuments });
await mkdir(path.join(repositoryRoot, "artifacts"), { recursive: true });
await writeFile(path.join(repositoryRoot, "artifacts", "swagger-diff.md"), report, "utf8");

if (!dryRun) {
  run("git", ["checkout", "-b", branch]);
}
await writeAcquiredSources(acquired, false);
const artifacts = await generateArtifactsFromDisk();
for (const [relativePath, content] of artifacts) {
  await writeFile(path.join(repositoryRoot, relativePath), content, "utf8");
}
run("npm", ["run", "verify"]);

const changedFiles = run("git", ["status", "--porcelain"]).trim();
if (changedFiles.length === 0) {
  throw new Error("Canonical Swagger changed but generation produced no file changes");
}
console.log(report);

if (dryRun) {
  console.log(JSON.stringify({ action: "dry-run", branch, targetVersion, targetHash }));
  process.exit(0);
}

run("git", ["add", "openapi", "src/generated", "docs/data", "docs/tools.md", "docs/toolsets.md"]);
run("git", ["commit", "-m", `chore: sync eToro Swagger ${targetVersion}`]);
run("git", ["push", "origin", `HEAD:refs/heads/${branch}`]);
await writeFile(
  path.join(repositoryRoot, "artifacts", "swagger-sync-pr.md"),
  pullRequestBody(report, targetVersion, targetHash),
  "utf8",
);
run("gh", [
  "pr",
  "create",
  "--base",
  "main",
  "--head",
  branch,
  "--title",
  `chore: sync eToro Swagger ${targetVersion}`,
  "--body-file",
  path.join(repositoryRoot, "artifacts", "swagger-sync-pr.md"),
]);
console.log(JSON.stringify({ action: "branch-and-pr", branch, targetVersion, targetHash }));
