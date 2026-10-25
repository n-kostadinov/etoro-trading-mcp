import { readFile } from "node:fs/promises";
import path from "node:path";
import { generateArtifactsFromDisk, repositoryRoot } from "./lib/generation.js";

const artifacts = await generateArtifactsFromDisk();
const stale: string[] = [];
for (const [relativePath, expected] of artifacts) {
  const actual = await readFile(path.join(repositoryRoot, relativePath), "utf8").catch(() => null);
  if (actual !== expected) {
    stale.push(relativePath);
  }
}
if (stale.length > 0) {
  throw new Error(`Generated artifacts are stale or missing: ${stale.join(", ")}`);
}
console.log(`Verified ${artifacts.size} generated artifacts.`);
