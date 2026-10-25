import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { downloadSource } from "../../scripts/acquire-openapi.js";
import { OPENAPI_SOURCES } from "../../scripts/lib/openapi.js";
import {
  determineSynchronizationAction,
  swaggerSyncBranch,
} from "../../scripts/lib/synchronization.js";
import { createSwaggerDiffReport } from "../../scripts/lib/swagger-diff.js";
import { asOpenApiDocument, canonicalJson } from "../../src/openapi/model.js";

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

describe("Swagger synchronization decisions", () => {
  it("treats canonical equality as no change regardless of raw formatting", () => {
    const compact = documentFixture({ version: "v1.0.0" });
    const formatted = JSON.parse(JSON.stringify(compact, null, 4)) as unknown;
    expect(canonicalJson(compact)).toBe(canonicalJson(formatted));
    expect(
      determineSynchronizationAction({
        currentCanonicalSha256: "a".repeat(64),
        targetCanonicalSha256: "a".repeat(64),
      }),
    ).toEqual({ type: "none", reason: "canonical sources unchanged" });
  });

  it("creates a deterministic sanitized branch for a semantic change", () => {
    const branch = swaggerSyncBranch("v1.401.0+build/extra", "b".repeat(64));
    expect(branch).toBe(`swagger-sync/v1.401.0-build-extra-${"b".repeat(12)}`);
    expect(swaggerSyncBranch("v1.401.0+build/extra", "b".repeat(64))).toBe(branch);
    expect(
      determineSynchronizationAction({
        currentCanonicalSha256: "a".repeat(64),
        targetCanonicalSha256: "b".repeat(64),
      }),
    ).toEqual({ type: "create" });
  });

  it("skips an existing branch for the same hash and refuses a hash collision", () => {
    const target = "c".repeat(64);
    expect(
      determineSynchronizationAction({
        currentCanonicalSha256: "a".repeat(64),
        targetCanonicalSha256: target,
        existingBranchCanonicalSha256: target,
      }),
    ).toEqual({ type: "skip", reason: "update branch already exists for this canonical hash" });
    expect(
      determineSynchronizationAction({
        currentCanonicalSha256: "a".repeat(64),
        targetCanonicalSha256: target,
        existingBranchCanonicalSha256: "d".repeat(64),
      }),
    ).toMatchObject({ type: "fail" });
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
  it("fails safely on a non-retryable HTTP status without a branch decision", async () => {
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

describe("Swagger synchronization workflow", () => {
  it("is scheduled daily, write-scoped, and has no npm credential access", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/swagger-sync.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain('cron: "17 3 * * *"');
    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("pull-requests: write");
    expect(workflow).not.toContain("NPM_TOKEN");
    expect(workflow).not.toContain("npm publish");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("--dry-run");
  });

  it("persists dry-run reports and verification logs as workflow artifacts", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/swagger-sync.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain("tee artifacts/dry-run.log");
    expect(workflow).toContain("shell: bash");
    expect(workflow).toContain("actions/upload-artifact@");
    expect(workflow).toContain("name: swagger-dry-run");
    expect(workflow).toContain("path: artifacts/");
  });
});
