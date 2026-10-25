import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractChangelogSection, normalizeReleaseTag } from "./lib/release-notes.js";
import { assertVersionUnpublished, registryViewArguments } from "./lib/npm-registry.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const arguments_ = process.argv.slice(2);

function run(command: string, arguments_: string[]): string {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const output = `${String(result.stdout)}${String(result.stderr)}`;
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(" ")} failed:\n${result.error?.message ?? output}`,
    );
  }
  return output;
}

const requestedTag = arguments_[0];
if (requestedTag === undefined) {
  throw new Error("Usage: npm run release:validate -- vX.Y.Z");
}
const version = normalizeReleaseTag(requestedTag);
const [packageJson, lockfile, changelog] = await Promise.all([
  readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  readFile(path.join(repositoryRoot, "package-lock.json"), "utf8"),
  readFile(path.join(repositoryRoot, "CHANGELOG.md"), "utf8"),
]);
const parsedPackage = JSON.parse(packageJson) as { name: string; version: string };
const parsedLockfile = JSON.parse(lockfile) as {
  version: string;
  packages: Record<string, { version?: string }>;
};
if (parsedPackage.version !== version) {
  throw new Error(`Tag v${version} does not match package version ${parsedPackage.version}`);
}
const lockRoot = parsedLockfile.packages[""]?.version;
if (parsedLockfile.version !== version || lockRoot !== version) {
  throw new Error(
    `Tag v${version} does not match lockfile versions ${parsedLockfile.version}/${String(lockRoot)}`,
  );
}
const changelogSection = extractChangelogSection(changelog, version);

// The registry verdict arrives through exit code and stderr, not the run() helper.
const registryView = spawnSync("npm", registryViewArguments(parsedPackage.name, version), {
  cwd: repositoryRoot,
  encoding: "utf8",
  shell: process.platform === "win32",
});
assertVersionUnpublished(parsedPackage.name, version, {
  status: registryView.status,
  stdout: String(registryView.stdout ?? ""),
  stderr: String(registryView.stderr ?? ""),
});

run("git", ["fetch", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main"]);
const head = run("git", ["rev-parse", "HEAD"]).trim();
const mainHead = run("git", ["rev-parse", "refs/remotes/origin/main"]).trim();
// merge-base --is-ancestor reports its verdict through the exit code only.
const ancestryCheck = spawnSync(
  "git",
  ["merge-base", "--is-ancestor", head, "refs/remotes/origin/main"],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
  },
);
if (ancestryCheck.status !== 0) {
  throw new Error(
    `Release commit ${head} is not an ancestor of origin/main (${mainHead}); land the release commit on main before tagging`,
  );
}
run("npm", ["ci"]);
run("npm", ["run", "verify"]);

console.log(
  JSON.stringify(
    {
      valid: true,
      tag: `v${version}`,
      commit: head,
      mainHead,
      changelogDate: changelogSection.date,
      previousVersion: changelogSection.previousVersion,
      checks: [
        "registry",
        "format",
        "lint",
        "types",
        "unit",
        "integration",
        "generated",
        "docs",
        "workflows",
        "build",
        "package",
      ],
    },
    null,
    2,
  ),
);
