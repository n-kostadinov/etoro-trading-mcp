import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLinter } from "actionlint";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const workflowDirectory = path.join(repositoryRoot, ".github", "workflows");

const linter = await createLinter();
const files = (await readdir(workflowDirectory))
  .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
  .sort();
if (files.length === 0) {
  throw new Error("No GitHub workflow files found");
}
const failures: string[] = [];
for (const file of files) {
  const filePath = path.join(workflowDirectory, file);
  const source = await readFile(filePath, "utf8");
  for (const result of linter(source, filePath)) {
    failures.push(`${result.file}:${result.line}:${result.column} ${result.message}`);
  }
}
if (failures.length > 0) {
  throw new Error(`GitHub workflow validation failed:\n${failures.join("\n")}`);
}
console.log(`Validated ${files.length} GitHub workflow files with actionlint.`);
