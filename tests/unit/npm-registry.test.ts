import { describe, expect, it } from "vitest";
import {
  assertVersionUnpublished,
  isRegistryAbsent,
  parsePublishedVersion,
  registryViewArguments,
  type CommandOutput,
} from "../../scripts/lib/npm-registry.js";

function output(overrides: Partial<CommandOutput> = {}): CommandOutput {
  return { status: 0, stdout: "", stderr: "", ...overrides };
}

const publishedView = output({
  stdout: JSON.stringify({
    name: "etoro-trading-mcp",
    version: "1.0.0",
    dist: { tarball: "https://registry.npmjs.org/etoro-trading-mcp/-/etoro-trading-mcp-1.0.0.tgz" },
    attestations: {
      url: "https://registry.npmjs.org/-/npm/v1/attestations/etoro-trading-mcp",
      provenance: { predicateType: "https://slsa.dev/provenance/v1" },
    },
  }),
});

describe("npm registry lookup", () => {
  it("constructs the exact registry view command", () => {
    expect(registryViewArguments("etoro-trading-mcp", "1.0.0")).toEqual([
      "view",
      "etoro-trading-mcp@1.0.0",
      "--json",
    ]);
  });

  it("treats an E404 exit as an absent version only", () => {
    expect(
      isRegistryAbsent(
        output({
          status: 1,
          stderr: "npm error code E404\nnpm error not found : etoro-trading-mcp@9.9.9",
        }),
      ),
    ).toBe(true);
    expect(isRegistryAbsent(output({ status: 1, stderr: "npm error code ENOTFOUND" }))).toBe(false);
    expect(isRegistryAbsent(output())).toBe(false);
  });

  it("passes an unpublished version and blocks an existing one", () => {
    expect(() =>
      assertVersionUnpublished(
        "etoro-trading-mcp",
        "1.0.0",
        output({ status: 1, stderr: "npm error code E404" }),
      ),
    ).not.toThrow();
    expect(() => assertVersionUnpublished("etoro-trading-mcp", "1.0.0", publishedView)).toThrow(
      /already publishes etoro-trading-mcp@1\.0\.0.*never overwrite/u,
    );
  });

  it("fails safely when the registry cannot be reached", () => {
    expect(() =>
      assertVersionUnpublished(
        "etoro-trading-mcp",
        "1.0.0",
        output({ status: 1, stderr: "npm error code ENOTFOUND" }),
      ),
    ).toThrow(/registry lookup for etoro-trading-mcp@1\.0\.0 failed/u);
  });

  it("rejects metadata for the wrong version or malformed output", () => {
    expect(() => parsePublishedVersion("etoro-trading-mcp", "1.0.1", publishedView)).toThrow(
      /reports version 1\.0\.0/u,
    );
    expect(() =>
      parsePublishedVersion("etoro-trading-mcp", "1.0.0", output({ stdout: "{broken" })),
    ).toThrow(/unreadable output/u);
  });
});
