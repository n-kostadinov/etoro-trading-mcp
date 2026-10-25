import { describe, expect, it } from "vitest";
import {
  asOpenApiDocument,
  canonicalJson,
  canonicalizeJson,
  getOperationEntries,
  prettyCanonicalJson,
  sha256,
} from "../../src/openapi/model.js";

describe("OpenAPI model and canonicalization", () => {
  it("validates the OpenAPI document envelope and paths", () => {
    expect(() => asOpenApiDocument({ swagger: "2.0" }, "fixture")).toThrow(/OpenAPI 3.x/u);
    expect(() =>
      asOpenApiDocument({ openapi: "3.0.1", info: { version: "1" }, paths: "invalid" }, "fixture"),
    ).toThrow(/missing paths/u);
  });

  it("collects operation identities and rejects duplicates or missing IDs", () => {
    const document = asOpenApiDocument(
      {
        openapi: "3.0.1",
        info: { version: "1" },
        paths: { "/items": { get: { operationId: "listItems", tags: ["Items"] } } },
      },
      "fixture",
    );
    expect(getOperationEntries(document)).toHaveLength(1);
    expect(() =>
      getOperationEntries(
        asOpenApiDocument(
          {
            openapi: "3.0.1",
            info: { version: "1" },
            paths: {
              "/items": { get: { operationId: "listItems" } },
              "/other": { get: { operationId: "listItems" } },
            },
          },
          "fixture",
        ),
      ),
    ).toThrow(/Duplicate operationId listItems/u);
    expect(() =>
      getOperationEntries(
        asOpenApiDocument(
          {
            openapi: "3.0.1",
            info: { version: "1" },
            paths: { "/items": { get: { summary: "missing id" } } },
          },
          "fixture",
        ),
      ),
    ).toThrow(/missing operationId/u);
  });

  it("sorts object keys recursively while preserving arrays and scalars", () => {
    const left = { z: 1, a: { y: ["2", "1"], b: true } };
    const right = { a: { b: true, y: ["2", "1"] }, z: 1 };
    expect(canonicalizeJson(left)).toEqual(right);
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(prettyCanonicalJson(left)).toBe(`${JSON.stringify(right, null, 2)}\n`);
  });

  it("computes stable SHA-256 content hashes", () => {
    expect(sha256("abc")).toMatch(/^[0-9a-f]{64}$/u);
    expect(sha256("abc")).toBe(sha256(Buffer.from("abc", "utf8")));
  });
});
