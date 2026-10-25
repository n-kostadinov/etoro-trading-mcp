import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import catalogModule from "../src/generated/tool-catalog.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const expectedVersion = (
  JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
    version: string;
  }
).version;
const expectedEnabledTools = catalogModule.operations.filter(
  (operation) => operation.defaultEnabled,
).length;
const expectedCatalogOperations = catalogModule.operations.length;
const requiredFiles = [
  "dist/cli.js",
  "dist/generated/tool-catalog.js",
  "schemas/config.schema.json",
  "README.md",
  "INSTALL.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "docs/configuration.md",
  "docs/toolsets.md",
  "docs/tools.md",
  "docs/trading.md",
  "docs/security.md",
  "docs/troubleshooting.md",
];
const forbiddenPathPatterns: RegExp[] = [
  /^(?:tests|scripts|plan|openapi|src)\//u,
  /^docs\/internal\//u,
  /^\.github\//u,
  /^\.zcode\//u,
  /^\.idea\//u,
  /^\.env/u,
];

function runNpm(
  arguments_: string[],
  options: { cwd?: string } = {},
): ReturnType<typeof spawnSync> {
  const result = spawnSync("npm", arguments_, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(
      `npm ${arguments_.join(" ")} failed:\n${String(result.stdout)}\n${String(result.stderr)}`,
    );
  }
  return result;
}

function commandOutput(value: string | Buffer | null): string {
  return value === null ? "" : value.toString();
}

function parsePackOutput(stdout: string): { path: string; filename: string }[] {
  const match = stdout.match(/\[[\s\S]*\]/);
  if (match === null) {
    throw new Error("npm pack did not return JSON metadata");
  }
  return JSON.parse(match[0]) as { path: string; filename: string }[];
}

const temporaryRoot = await mkdtemp(path.join(tmpdir(), "etoro-mcp-package-check-"));
try {
  const packDirectory = path.join(temporaryRoot, "pack");
  const installDirectory = path.join(temporaryRoot, "install");
  await mkdir(packDirectory, { recursive: true });
  await mkdir(installDirectory, { recursive: true });
  const packResult = runNpm(["pack", "--json", "--silent", "--pack-destination", packDirectory]);
  const packMetadata = parsePackOutput(commandOutput(packResult.stdout));
  const packedFile = packMetadata[0];
  if (packedFile === undefined) {
    throw new Error("npm pack produced no tarball metadata");
  }
  const tarballPath = path.join(packDirectory, packedFile.filename);

  const listing = runNpm(["pack", "--dry-run", "--json", "--silent"]);
  const listingOutput = commandOutput(listing.stdout);
  const metadata = JSON.parse(listingOutput.slice(listingOutput.indexOf("["))) as {
    files: { path: string }[];
  }[];
  const files = (metadata[0]?.files ?? []).map((file) => file.path);
  const missing = requiredFiles.filter((file) => !files.includes(file));
  const forbidden = files.filter((file) =>
    forbiddenPathPatterns.some((pattern) => pattern.test(file)),
  );
  if (missing.length > 0 || forbidden.length > 0) {
    throw new Error(
      `Package allowlist mismatch; missing=${missing.join(", ")}; forbidden=${forbidden.join(", ")}`,
    );
  }

  await writeFile(
    path.join(installDirectory, "package.json"),
    JSON.stringify({ name: "etoro-mcp-package-smoke", private: true }, null, 2),
  );
  runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--silent", tarballPath], {
    cwd: installDirectory,
  });
  const installedRoot = path.join(installDirectory, "node_modules", "etoro-trading-mcp");
  const installedCli = path.join(installedRoot, "dist", "cli.js");
  const runCli = async (arguments_: string[]) => {
    const result = spawnSync(process.execPath, [installedCli, ...arguments_], {
      cwd: installDirectory,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(`Installed CLI ${arguments_.join(" ")} failed:\n${String(result.stderr)}`);
    }
    return result.stdout;
  };
  const version = (await runCli(["--version"])).trim();
  const help = await runCli(["--help"]);
  const tools = JSON.parse(await runCli(["tools", "list", "--json"])) as {
    enabledCount: number;
    catalogOperationCount: number;
  };
  const configuration = JSON.parse(await runCli(["config", "validate", "--json"])) as {
    valid: boolean;
  };
  const installGuide = await readFile(path.join(installedRoot, "INSTALL.md"), "utf8");
  if (
    version !== expectedVersion ||
    tools.enabledCount !== expectedEnabledTools ||
    tools.catalogOperationCount !== expectedCatalogOperations ||
    !configuration.valid ||
    !help.includes("Usage:") ||
    !installGuide.includes("Agent rules")
  ) {
    throw new Error(
      `Installed package smoke check failed; version=${version}; tools=${JSON.stringify(tools)}; valid=${String(configuration.valid)}`,
    );
  }
  console.log(
    JSON.stringify(
      {
        packageFileCount: files.length,
        version,
        enabledTools: tools.enabledCount,
        catalogOperations: tools.catalogOperationCount,
        validConfiguration: configuration.valid,
        installGuideIncluded: true,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
