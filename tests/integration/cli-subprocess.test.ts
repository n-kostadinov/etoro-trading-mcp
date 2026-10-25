import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import catalogModule from "../../src/generated/tool-catalog.js";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const cliEntry = path.join(repositoryRoot, "src", "cli.ts");
const packageMetadata = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
) as { version: string };
const expectedEnabledTools = catalogModule.operations.filter(
  (operation) => operation.defaultEnabled,
).length;

interface CliRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(entryPath: string, arguments_: string[]): CliRun {
  const result = spawnSync(process.execPath, ["--import", "tsx", entryPath, ...arguments_], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

function expectInspectionCommands(entryPath: string): void {
  const version = runCli(entryPath, ["--version"]);
  expect(version.status, version.stderr).toBe(0);
  expect(version.stdout.trim()).toBe(packageMetadata.version);

  const tools = runCli(entryPath, ["tools", "list", "--json"]);
  expect(tools.status, tools.stderr).toBe(0);
  expect(JSON.parse(tools.stdout)).toMatchObject({
    enabledCount: expectedEnabledTools,
    catalogOperationCount: catalogModule.operations.length,
  });

  const configuration = runCli(entryPath, ["config", "validate", "--json"]);
  expect(configuration.status, configuration.stderr).toBe(0);
  expect(JSON.parse(configuration.stdout)).toMatchObject({ valid: true });
}

describe("CLI subprocess entry", () => {
  let temporaryDirectory: string;
  let linkedEntry: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "etoro-mcp-cli-entry-"));
    const linkedSource = path.join(temporaryDirectory, "linked-src");
    // Junctions need no privileges on Windows; plain directory symlinks elsewhere.
    await symlink(
      path.dirname(cliEntry),
      linkedSource,
      process.platform === "win32" ? "junction" : "dir",
    );
    linkedEntry = path.join(linkedSource, path.basename(cliEntry));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("answers inspection commands when spawned through the direct entry path", () => {
    expectInspectionCommands(cliEntry);
  });

  it("answers inspection commands when spawned through a linked entry path", () => {
    expectInspectionCommands(linkedEntry);
  });
});
