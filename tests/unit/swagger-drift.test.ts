import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { downloadSource } from "../../scripts/acquire-openapi.js";
import { OPENAPI_SOURCES } from "../../scripts/lib/openapi.js";
import { determineSwaggerDrift } from "../../scripts/lib/swagger-drift.js";
import { createSwaggerDiffReport } from "../../scripts/lib/swagger-diff.js";
import { asOpenApiDocument, canonicalJson, sha256 } from "../../src/openapi/model.js";

function documentFixture(options: {
  version: string;
  paths?: Record<string, Record<string, unknown>>;
  schemas?: Record<string, unknown>;
}) {
  return asOpenApiDocument(
    {
      openapi: "3.0.1",
      info: { version: options.version },
      paths:
        options.paths ??
        ({
          "/items": {
            get: {
              operationId: "listItems",
              tags: ["Items"],
              summary: "List items",
              "x-ratelimit": { limit: 10, window: 60 },
              responses: { 200: { description: "OK" } },
            },
          },
        } as Record<string, Record<string, unknown>>),
      components: { schemas: options.schemas ?? {} },
    },
    "fixture",
  );
}

describe("Swagger drift verdicts", () => {
  const sources = [
    { id: "swagger", apiVersion: "v1.408.0", canonicalSha256: "a".repeat(64) },
    { id: "core", apiVersion: "v1.408.0", canonicalSha256: "b".repeat(64) },
    { id: "deprecated", apiVersion: "v1.408.0", canonicalSha256: "c".repeat(64) },
  ];
  const manifest = {
    sources: {
      swagger: { apiVersion: "v1.408.0", canonicalSha256: "a".repeat(64) },
      core: { apiVersion: "v1.408.0", canonicalSha256: "b".repeat(64) },
      deprecated: { apiVersion: "v1.408.0", canonicalSha256: "c".repeat(64) },
    },
  };

  it("reports no drift when every canonical hash matches the manifest", () => {
    expect(determineSwaggerDrift({ previousManifest: manifest, acquired: sources })).toEqual({
      changed: false,
      changes: [],
    });
  });

  it("names the changed source with old and new values", () => {
    const acquired = sources.map((source) =>
      source.id === "core"
        ? { ...source, apiVersion: "v1.409.0", canonicalSha256: "d".repeat(64) }
        : source,
    );
    expect(determineSwaggerDrift({ previousManifest: manifest, acquired })).toEqual({
      changed: true,
      changes: [
        {
          id: "core",
          fromVersion: "v1.408.0",
          toVersion: "v1.409.0",
          fromCanonicalSha256: "b".repeat(64),
          toCanonicalSha256: "d".repeat(64),
        },
      ],
    });
  });

  it("treats a missing manifest as drift in every source", () => {
    const verdict = determineSwaggerDrift({ previousManifest: null, acquired: sources });
    expect(verdict.changed).toBe(true);
    expect(verdict.changes.map((change) => change.id)).toEqual(["swagger", "core", "deprecated"]);
    expect(
      verdict.changes.every(
        (change) => change.fromVersion === null && change.fromCanonicalSha256 === null,
      ),
    ).toBe(true);
  });

  it("ignores upstream formatting churn through canonical hashing", () => {
    const compact = documentFixture({ version: "v1.0.0" });
    const formatted = JSON.parse(JSON.stringify(compact, null, 4)) as unknown;
    const previousSwagger = {
      apiVersion: "v1.0.0",
      canonicalSha256: sha256(canonicalJson(compact)),
    };
    expect(
      determineSwaggerDrift({
        previousManifest: { sources: { swagger: previousSwagger } },
        acquired: [
          {
            id: "swagger",
            apiVersion: "v1.0.0",
            canonicalSha256: sha256(canonicalJson(formatted)),
          },
        ],
      }),
    ).toEqual({ changed: false, changes: [] });
  });
});

describe("Swagger semantic diff report", () => {
  it("reports added, removed, changed, schema, default, and SemVer impacts", () => {
    const oldSwagger = documentFixture({
      version: "v1.0.0",
      schemas: { Item: { type: "object", properties: { id: { type: "integer" } } } },
    });
    const newSwagger = documentFixture({
      version: "v1.1.0",
      paths: {
        "/items": {
          get: {
            operationId: "listItems",
            tags: ["Market Data"],
            summary: "List all items",
            "x-ratelimit": { limit: 20, window: 60 },
            responses: { 200: { description: "OK" } },
          },
        },
        "/markets": {
          get: {
            operationId: "listMarkets",
            tags: ["Market Data"],
            summary: "List markets",
            "x-ratelimit": { limit: 10, window: 60 },
            responses: { 200: { description: "OK" } },
          },
        },
      },
      schemas: { Item: { type: "object", properties: { id: { type: "string" } } } },
    });
    const removedDocument = documentFixture({
      version: "v1.0.0",
      paths: {
        "/legacy": {
          get: {
            operationId: "getLegacy",
            tags: ["Legacy"],
            "x-ratelimit": { limit: 10, window: 60 },
            responses: { 200: { description: "OK" } },
          },
        },
      },
    });
    const report = createSwaggerDiffReport({
      oldSwagger,
      newSwagger,
      oldCore: oldSwagger,
      newCore: newSwagger,
      oldDeprecated: removedDocument,
      newDeprecated: removedDocument,
    });
    expect(report).toContain("Old Swagger version: `v1.0.0`");
    expect(report).toContain("New Swagger version: `v1.1.0`");
    expect(report).toContain("Added operations: **1**");
    expect(report).toContain("`GET /markets` -> listMarkets");
    expect(report).toContain("Deprecated-portal-only operations: getLegacy");
    expect(report).toContain("changed summary");
    expect(report).toContain("changed x-ratelimit");
    expect(report).toContain("adds a default-enabled tool");
    expect(report).toContain("## Changed component schemas");
    expect(report).toContain("No merge, tag, or npm publication is automatic.");
  });

  it("recommends a major review for removed operations", () => {
    const oldSwagger = documentFixture({ version: "v1.0.0" });
    const replacement = documentFixture({
      version: "v1.1.0",
      paths: {
        "/replacement": {
          get: {
            operationId: "listReplacement",
            tags: ["Items"],
            "x-ratelimit": { limit: 10, window: 60 },
            responses: { 200: { description: "OK" } },
          },
        },
      },
    });
    const report = createSwaggerDiffReport({
      oldSwagger,
      newSwagger: replacement,
      oldCore: oldSwagger,
      newCore: replacement,
      oldDeprecated: oldSwagger,
      newDeprecated: replacement,
    });
    expect(report).toContain("Removed operations: **1**");
    expect(report).toContain("Suggested package SemVer impact: **major");
  });
});

describe("OpenAPI download failure handling", () => {
  it("fails safely on a non-retryable HTTP status without a drift verdict", async () => {
    const calls: string[] = [];
    await expect(
      downloadSource(OPENAPI_SOURCES[0] as (typeof OPENAPI_SOURCES)[number], {
        fetchImplementation: async (url) => {
          calls.push(String(url));
          return new Response("missing", { status: 404 });
        },
        sleep: async () => {
          throw new Error("must not sleep");
        },
      }),
    ).rejects.toThrow(/HTTP 404/u);
    expect(calls).toHaveLength(1);
  });

  it("fails safely and retries only transient malformed downloads", async () => {
    let attempts = 0;
    await expect(
      downloadSource(OPENAPI_SOURCES[0] as (typeof OPENAPI_SOURCES)[number], {
        fetchImplementation: async () => {
          attempts += 1;
          return new Response("{", { status: 200 });
        },
        retries: 1,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/Unable to acquire swagger/u);
    expect(attempts).toBe(2);
  });
});

describe("Swagger drift workflow", () => {
  it("is scheduled daily, read-scoped, and checks without publishing", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/swagger-drift.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain('cron: "17 3 * * *"');
    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toContain("pull-requests");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("NPM_TOKEN");
    expect(workflow).not.toContain("npm publish");
    expect(workflow).not.toContain("upload-artifact");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("npm run check:swagger");
  });
});
