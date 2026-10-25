export interface SourceManifestForNotes {
  retrievedAt: string;
  sources: Record<string, { apiVersion?: string; canonicalSha256?: string }>;
}

export interface CatalogForNotes {
  sourceVersion: string;
  sourceCanonicalSha256: string;
  defaultToolCount: number;
  toolsets: unknown[];
  operations: unknown[];
  warnings: string[];
}

export interface ReleaseNotesInput {
  version: string;
  changelog: string;
  sourceManifest: SourceManifestForNotes;
  catalog: CatalogForNotes;
  repositoryUrl: string;
}

export const strictReleaseTagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

export function normalizeReleaseTag(tag: string): string {
  if (!strictReleaseTagPattern.test(tag)) {
    throw new Error(
      `Release tag must use strict vX.Y.Z semantics without prerelease/build metadata: ${tag}`,
    );
  }
  return tag.slice(1);
}

export function extractChangelogSection(
  changelog: string,
  version: string,
): { date: string; body: string; previousVersion: string | null } {
  const headings = [...changelog.matchAll(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})$/gmu)];
  const heading = headings.find((match) => match[1] === version);
  if (heading === undefined || heading.index === undefined) {
    throw new Error(`CHANGELOG.md has no dated section for ${version}`);
  }
  const headingEnd = heading.index + heading[0].length;
  const nextHeading = headings.find(
    (match) => match.index !== undefined && match.index > heading.index,
  );
  const sectionEnd = nextHeading?.index ?? changelog.length;
  const body = changelog.slice(headingEnd, sectionEnd).trim();
  if (body.length === 0 || /<<|TBD|UNRELEASED/iu.test(body)) {
    throw new Error(`CHANGELOG.md section for ${version} is empty or contains placeholders`);
  }
  const previousVersion = previousVersionFor(headings, heading.index) ?? null;
  return { date: heading[2] as string, body, previousVersion };
}

// Changelogs list the newest version first, so the previous released version
// is the next heading below the current one.
function previousVersionFor(
  headings: RegExpMatchArray[],
  headingIndex: number,
): string | undefined {
  const later = headings
    .filter((match) => match.index !== undefined && match.index > headingIndex)
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  return later[0]?.[1];
}

export function buildReleaseNotes(input: ReleaseNotesInput): string {
  const version = normalizeReleaseTag(`v${input.version}`);
  const section = extractChangelogSection(input.changelog, version);
  const source = input.sourceManifest.sources.swagger;
  if (
    source?.apiVersion === undefined ||
    source.canonicalSha256 === undefined ||
    source.apiVersion !== input.catalog.sourceVersion ||
    source.canonicalSha256 !== input.catalog.sourceCanonicalSha256
  ) {
    throw new Error("Source manifest and generated catalog do not agree on the eToro API baseline");
  }
  const comparisonLine =
    section.previousVersion === null
      ? "- This is the first tagged release."
      : `- [Comparison](${input.repositoryUrl}/compare/v${section.previousVersion}...v${version})`;
  return `# eToro Trading MCP v${version}

Released: ${section.date}

## Changelog

${section.body}

## eToro API baseline

- Swagger UI version: \`${input.catalog.sourceVersion}\`
- Canonical SHA-256: \`${input.catalog.sourceCanonicalSha256}\`
- Source snapshot retrieved: \`${input.sourceManifest.retrievedAt}\`
- Tool catalog: **${input.catalog.operations.length} operations** across **${input.catalog.toolsets.length} toolsets**
- Default exposure: **${input.catalog.defaultToolCount} current tools**
${input.catalog.warnings.length > 0 ? `- Publication warnings: ${input.catalog.warnings.join("; ")}` : "- Publication surfaces are consistent."}

## Install

\`\`\`bash
npx -y etoro-trading-mcp@${version}
\`\`\`

## Links

- [Tool reference](${input.repositoryUrl}/blob/v${version}/docs/tools.md)
- [Full changelog](${input.repositoryUrl}/blob/v${version}/CHANGELOG.md)
${comparisonLine}
`;
}
