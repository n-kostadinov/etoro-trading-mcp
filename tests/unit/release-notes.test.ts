import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import catalogModule from "../../src/generated/tool-catalog.js";
import {
  buildReleaseNotes,
  extractChangelogSection,
  normalizeReleaseTag,
} from "../../scripts/lib/release-notes.js";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

const changelogFixture = [
  "# Changelog",
  "",
  "## [1.1.0] - 2026-11-02",
  "",
  "### Added",
  "",
  "- Second release.",
  "",
  "## [1.0.0] - 2026-10-24",
  "",
  "### Added",
  "",
  "- Initial release.",
  "",
  "## [0.9.0] - 2026-10-01",
  "",
  "### Added",
  "",
  "- Prehistory.",
  "",
].join("\n");

const sourceManifestFixture = {
  retrievedAt: "2026-10-24T10:13:50.463Z",
  sources: {
    swagger: {
      apiVersion: catalogModule.sourceVersion,
      canonicalSha256: catalogModule.sourceCanonicalSha256,
    },
  },
};

describe("release tag normalization", () => {
  it("accepts strict semantic tags and strips the v prefix", () => {
    expect(normalizeReleaseTag("v1.0.0")).toBe("1.0.0");
    expect(normalizeReleaseTag("v10.20.30")).toBe("10.20.30");
  });

  it("rejects prerelease, build, padded, and unversioned tags", () => {
    expect(() => normalizeReleaseTag("v1.0.0-rc1")).toThrow(/strict vX\.Y\.Z/u);
    expect(() => normalizeReleaseTag("v1.0.0+build.1")).toThrow(/strict/u);
    expect(() => normalizeReleaseTag("v01.0.0")).toThrow(/strict/u);
    expect(() => normalizeReleaseTag("1.0.0")).toThrow(/strict/u);
    expect(() => normalizeReleaseTag("latest")).toThrow(/strict/u);
  });
});

describe("changelog section extraction", () => {
  it("extracts the dated section and the previous version", () => {
    const section = extractChangelogSection(changelogFixture, "1.0.0");
    expect(section.date).toBe("2026-10-24");
    expect(section.body).toContain("Initial release.");
    expect(section.previousVersion).toBe("0.9.0");
  });

  it("fails for a missing section", () => {
    expect(() => extractChangelogSection(changelogFixture, "2.0.0")).toThrow(
      /no dated section for 2\.0\.0/u,
    );
  });

  it("fails for placeholder or empty sections", () => {
    const placeholder = changelogFixture.replace("- Initial release.", "TBD");
    expect(() => extractChangelogSection(placeholder, "1.0.0")).toThrow(
      /empty or contains placeholders/u,
    );
    expect(() => extractChangelogSection(changelogFixture, "1.1.0")).not.toThrow();
  });
});

describe("release notes assembly", () => {
  const baseInput = {
    version: "1.0.0",
    changelog: changelogFixture,
    sourceManifest: sourceManifestFixture,
    catalog: catalogModule,
    repositoryUrl: "https://github.com/n-kostadinov/etoro-trading-mcp",
  };

  it("builds notes with install command, baseline agreement, and first-release wording", () => {
    const firstReleaseChangelog = [
      "# Changelog",
      "",
      "## [1.0.0] - 2026-10-24",
      "",
      "- Initial release.",
      "",
    ].join("\n");
    const notes = buildReleaseNotes({ ...baseInput, changelog: firstReleaseChangelog });
    expect(notes).toContain("# eToro Trading MCP v1.0.0");
    expect(notes).toContain("npx -y etoro-trading-mcp@1.0.0");
    expect(notes).toContain(
      `**${catalogModule.operations.length} operations** across **${catalogModule.toolsets.length} toolsets**`,
    );
    expect(notes).toContain("- This is the first tagged release.");
    expect(notes).not.toContain("](This is");
  });

  it("links to the previous version comparison for follow-up releases", () => {
    const notes = buildReleaseNotes({ ...baseInput, version: "1.1.0" });
    expect(notes).toContain(
      "[Comparison](https://github.com/n-kostadinov/etoro-trading-mcp/compare/v1.0.0...v1.1.0)",
    );
  });

  it("fails when the source manifest and catalog disagree on the baseline", () => {
    expect(() =>
      buildReleaseNotes({
        ...baseInput,
        sourceManifest: {
          ...sourceManifestFixture,
          sources: {
            swagger: {
              apiVersion: catalogModule.sourceVersion,
              canonicalSha256: "0".repeat(64),
            },
          },
        },
      }),
    ).toThrow(/do not agree on the eToro API baseline/u);
  });
});

describe("repository changelog stays releasable", () => {
  it("has a non-placeholder section for the current package version", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as { version: string };
    const changelog = readFileSync(path.join(repositoryRoot, "CHANGELOG.md"), "utf8");
    expect(() => extractChangelogSection(changelog, packageJson.version)).not.toThrow();
  });
});
