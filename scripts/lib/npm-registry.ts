export interface CommandOutput {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface PublishedVersion {
  version: string;
  tarballUrl: string | null;
  provenanceAttestation: boolean;
}

interface RegistryViewEntry {
  name?: unknown;
  version?: unknown;
  dist?: { tarball?: unknown };
  attestations?: { provenance?: unknown };
}

export function registryViewArguments(name: string, version: string): string[] {
  return ["view", `${name}@${version}`, "--json"];
}

// npm view reports a missing package or version as exit code 1 with an E404
// diagnostic on stderr; every other failure means the lookup itself failed.
export function isRegistryAbsent(output: CommandOutput): boolean {
  return output.status !== 0 && /E404\b/u.test(output.stderr);
}

export function assertVersionUnpublished(
  name: string,
  version: string,
  output: CommandOutput,
): void {
  if (isRegistryAbsent(output)) {
    return;
  }
  const published = parsePublishedVersion(name, version, output);
  throw new Error(
    `npm already publishes ${name}@${published.version}${
      published.tarballUrl === null ? "" : ` (${published.tarballUrl})`
    }; never overwrite or republish an existing version`,
  );
}

export function verifyPublishedVersion(
  name: string,
  version: string,
  output: CommandOutput,
): PublishedVersion {
  if (isRegistryAbsent(output)) {
    throw new Error(`npm does not list ${name}@${version}; publication did not succeed`);
  }
  return parsePublishedVersion(name, version, output);
}

export function parsePublishedVersion(
  name: string,
  version: string,
  output: CommandOutput,
): PublishedVersion {
  if (output.status !== 0) {
    throw new Error(`npm registry lookup for ${name}@${version} failed: ${output.stderr.trim()}`);
  }
  let entry: RegistryViewEntry;
  try {
    entry = JSON.parse(output.stdout) as RegistryViewEntry;
  } catch {
    throw new Error(`npm registry lookup for ${name}@${version} returned unreadable output`);
  }
  if (entry.version !== version) {
    throw new Error(
      `npm registry lookup for ${name}@${version} reports version ${String(entry.version)}`,
    );
  }
  return {
    version,
    tarballUrl: typeof entry.dist?.tarball === "string" ? entry.dist.tarball : null,
    provenanceAttestation: entry.attestations?.provenance !== undefined,
  };
}
