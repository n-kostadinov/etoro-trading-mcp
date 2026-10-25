import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateArtifactsFromDisk, repositoryRoot } from "./lib/generation.js";

const artifacts = await generateArtifactsFromDisk();
for (const [relativePath, content] of artifacts) {
  const destination = path.join(repositoryRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
  console.log(`generated ${relativePath}`);
}
