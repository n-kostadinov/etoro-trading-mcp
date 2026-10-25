import { readFile } from "node:fs/promises";
import { createSwaggerDiffReport } from "./lib/swagger-diff.js";
import { asOpenApiDocument } from "../src/openapi/model.js";

const expectedArguments = 6;
const [
  oldSwaggerPath,
  newSwaggerPath,
  oldCorePath,
  newCorePath,
  oldDeprecatedPath,
  newDeprecatedPath,
] = process.argv.slice(2);
const paths = [
  oldSwaggerPath,
  newSwaggerPath,
  oldCorePath,
  newCorePath,
  oldDeprecatedPath,
  newDeprecatedPath,
];
if (paths.some((path) => path === undefined) || paths.length !== expectedArguments) {
  throw new Error(
    "Usage: npm run swagger:diff -- old-swagger.json new-swagger.json old-core.json new-core.json old-deprecated.json new-deprecated.json",
  );
}

async function loadDocument(path: string, name: string) {
  return asOpenApiDocument(JSON.parse(await readFile(path, "utf8")) as unknown, name);
}

const [oldSwagger, newSwagger, oldCore, newCore, oldDeprecated, newDeprecated] = await Promise.all([
  loadDocument(paths[0] as string, "old swagger"),
  loadDocument(paths[1] as string, "new swagger"),
  loadDocument(paths[2] as string, "old core"),
  loadDocument(paths[3] as string, "new core"),
  loadDocument(paths[4] as string, "old deprecated"),
  loadDocument(paths[5] as string, "new deprecated"),
]);
process.stdout.write(
  createSwaggerDiffReport({
    oldSwagger,
    newSwagger,
    oldCore,
    newCore,
    oldDeprecated,
    newDeprecated,
  }),
);
