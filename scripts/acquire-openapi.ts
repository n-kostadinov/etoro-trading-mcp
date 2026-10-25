import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  OPENAPI_SOURCES,
  prettyCanonicalJson,
  sha256,
  validateOpenApiDocument,
} from "./lib/openapi.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = path.join(repositoryRoot, "openapi");
const maximumDocumentBytes = 25 * 1024 * 1024;

interface DownloadOptions {
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface AcquiredSource {
  id: string;
  file: string;
  url: string;
  apiVersion: string;
  openApiVersion: string;
  operations: number;
  rawSha256: string;
  canonicalSha256: string;
  document: unknown;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function downloadSource(
  source: (typeof OPENAPI_SOURCES)[number],
  options: DownloadOptions = {},
): Promise<AcquiredSource> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retries = options.retries ?? 2;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImplementation(source.url, {
        // This endpoint double-encodes its Swagger document when application/json is requested.
        headers: { accept: "*/*" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > maximumDocumentBytes) {
        throw new Error(`${source.id} exceeds the ${maximumDocumentBytes}-byte limit`);
      }
      if (!response.ok) {
        const error = new Error(`${source.id} download returned HTTP ${response.status}`);
        if (response.status === 429 || response.status >= 500) {
          throw error;
        }
        throw Object.assign(error, { retryable: false });
      }
      const content = Buffer.from(await response.arrayBuffer());
      if (content.byteLength > maximumDocumentBytes) {
        throw new Error(`${source.id} exceeds the ${maximumDocumentBytes}-byte limit`);
      }
      const parsed = JSON.parse(content.toString("utf8")) as unknown;
      const { document, operations } = await validateOpenApiDocument(parsed, source.id);
      return {
        id: source.id,
        file: source.file,
        url: source.url,
        apiVersion: document.info.version,
        openApiVersion: document.openapi,
        operations: operations.length,
        rawSha256: sha256(content),
        canonicalSha256: sha256(canonicalJson(document)),
        document,
      };
    } catch (error) {
      lastError = error;
      if (
        attempt === retries ||
        (typeof error === "object" &&
          error !== null &&
          "retryable" in error &&
          error.retryable === false)
      ) {
        break;
      }
      await sleep(250 * 2 ** attempt);
    }
  }

  throw new Error(`Unable to acquire ${source.id}: ${String(lastError)}`);
}

async function writeIfChanged(filePath: string, content: string): Promise<boolean> {
  const previous = await readFile(filePath, "utf8").catch(() => null);
  if (previous === content) {
    return false;
  }
  await writeFile(filePath, content, "utf8");
  return true;
}

export interface AcquiredSourceManifest {
  schemaVersion: number;
  retrievedAt: string;
  sources: Record<string, Omit<AcquiredSource, "document">>;
}

export async function writeAcquiredSources(
  acquired: AcquiredSource[],
  dryRun: boolean,
): Promise<{ manifest: AcquiredSourceManifest; unchanged: boolean }> {
  const previousManifest = await readFile(
    path.join(outputDirectory, "source-manifest.json"),
    "utf8",
  )
    .then(
      (content) =>
        JSON.parse(content) as {
          retrievedAt?: string;
          sources?: Record<string, { canonicalSha256?: string }>;
        },
    )
    .catch(() => null);
  const unchanged = acquired.every(
    (source) => previousManifest?.sources?.[source.id]?.canonicalSha256 === source.canonicalSha256,
  );
  const manifest = {
    schemaVersion: 1,
    retrievedAt: unchanged
      ? (previousManifest?.retrievedAt ?? new Date().toISOString())
      : new Date().toISOString(),
    sources: Object.fromEntries(
      acquired.map(({ document: _document, ...source }) => [source.id, source]),
    ),
  };

  if (!dryRun) {
    await mkdir(outputDirectory, { recursive: true });
    for (const source of acquired) {
      await writeIfChanged(
        path.join(outputDirectory, source.file),
        prettyCanonicalJson(source.document),
      );
    }
    await writeIfChanged(
      path.join(outputDirectory, "source-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }
  return { manifest, unchanged };
}

async function main(): Promise<void> {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  const acquired = await Promise.all(OPENAPI_SOURCES.map((source) => downloadSource(source)));
  const { manifest, unchanged } = await writeAcquiredSources(acquired, dryRun);
  console.log(
    JSON.stringify(
      {
        dryRun,
        unchanged,
        retrievedAt: manifest.retrievedAt,
        sources: Object.values(manifest.sources),
      },
      null,
      2,
    ),
  );
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main();
}
