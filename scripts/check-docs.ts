import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import catalogModule from "../src/generated/tool-catalog.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const documentationFiles = [
  "README.md",
  "docs/configuration.md",
  "docs/security.md",
  "docs/toolsets.md",
  "docs/tools.md",
  "docs/trading.md",
  "docs/troubleshooting.md",
];

async function readDocument(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

async function assertGeneratedCoverage(documents: Map<string, string>): Promise<void> {
  const tools = documents.get("docs/tools.md");
  const toolsets = documents.get("docs/toolsets.md");
  if (tools === undefined || toolsets === undefined) {
    throw new Error("Generated documentation files are missing");
  }
  const missingTools = catalogModule.operations.filter(
    (operation) =>
      !tools.includes(`\`${operation.operationId}\``) ||
      !tools.includes(`\`${operation.method} ${operation.path}\``),
  );
  if (missingTools.length > 0) {
    throw new Error(
      `Generated tool reference is missing ${missingTools.length} operations: ${missingTools
        .slice(0, 5)
        .map((operation) => operation.operationId)
        .join(", ")}`,
    );
  }
  const missingToolsets = catalogModule.toolsets.filter(
    (toolset) => !toolsets.includes(`\`${toolset.id}\``),
  );
  if (missingToolsets.length > 0) {
    throw new Error(
      `Generated toolset reference is missing: ${missingToolsets
        .map((toolset) => toolset.id)
        .join(", ")}`,
    );
  }
  if (!tools.includes(`**${catalogModule.operations.length} tools**`)) {
    throw new Error("Generated tool reference has an incorrect operation count");
  }
}

async function validateConfigurationExamples(
  content: string,
  documentName: string,
  requireConfigExample: boolean,
): Promise<void> {
  const schema = JSON.parse(
    await readFile(path.join(repositoryRoot, "schemas/config.schema.json"), "utf8"),
  ) as unknown;
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  ajv.addSchema(schema as AnySchema, "urn:etoro-trading-mcp:configuration-example");
  const blocks = [...content.matchAll(/```json\r?\n([\s\S]*?)```/gu)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
  if (blocks.length === 0) {
    throw new Error(`${documentName} contains no JSON examples`);
  }
  const schemaProperties = Object.keys(
    (schema as { properties: Record<string, unknown> }).properties,
  );
  let configExamples = 0;
  for (const [index, block] of blocks.entries()) {
    const parsed = JSON.parse(block) as unknown;
    // Client entries such as an mcpServers block are not configuration files;
    // only blocks that use configuration properties must match the schema.
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).some((key) => schemaProperties.includes(key))
    ) {
      configExamples += 1;
      if (!ajv.validate("urn:etoro-trading-mcp:configuration-example", parsed)) {
        throw new Error(`${documentName} JSON example ${index + 1} failed schema validation`);
      }
    }
  }
  if (requireConfigExample && configExamples === 0) {
    throw new Error(`${documentName} contains no configuration examples`);
  }
}

function assertReadmeToolsetReferences(content: string): void {
  const references = new Set<string>();
  for (const match of content.matchAll(/ETORO_ENABLED_TOOLSETS[":= ]+([a-z0-9,-]+)/gu)) {
    const value = match[1];
    if (value !== undefined) {
      for (const id of value.split(",")) {
        references.add(id);
      }
    }
  }
  for (const match of content.matchAll(/"enabledToolsets"\s*:\s*\[([^\]]*)\]/gu)) {
    const value = match[1];
    if (value !== undefined) {
      for (const id of value.matchAll(/"([^"]+)"/gu)) {
        if (id[1] !== undefined) {
          references.add(id[1]);
        }
      }
    }
  }
  if (references.size === 0) {
    throw new Error("README.md does not reference any enabled toolsets");
  }
  const known = new Set(catalogModule.toolsets.map((toolset) => toolset.id));
  const unknown = [...references].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(`README.md references unknown toolsets: ${unknown.join(", ")}`);
  }
}

async function assertLocalLinks(documents: Map<string, string>): Promise<void> {
  const broken: string[] = [];
  for (const [relativePath, content] of documents) {
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/gu)) {
      const target = match[1];
      if (target === undefined || /^(https?:|mailto:)/u.test(target)) {
        continue;
      }
      const filePath = target.split("#")[0];
      if (filePath === undefined || filePath.length === 0) {
        continue;
      }
      const resolved = path.resolve(repositoryRoot, path.dirname(relativePath), filePath);
      try {
        await access(resolved);
      } catch {
        broken.push(`${relativePath}: ${target}`);
      }
    }
  }
  if (broken.length > 0) {
    throw new Error(`Broken local documentation links: ${broken.join(", ")}`);
  }
}

const documents = new Map<string, string>();
for (const file of documentationFiles) {
  documents.set(file, await readDocument(file));
}
await assertGeneratedCoverage(documents);
await validateConfigurationExamples(
  documents.get("docs/configuration.md") ?? "",
  "docs/configuration.md",
  true,
);
await validateConfigurationExamples(documents.get("README.md") ?? "", "README.md", true);
await assertReadmeToolsetReferences(documents.get("README.md") ?? "");
await assertLocalLinks(documents);
console.log(
  `Verified ${documentationFiles.length} documentation files, ${catalogModule.operations.length} tool entries, and ${catalogModule.toolsets.length} toolsets.`,
);
