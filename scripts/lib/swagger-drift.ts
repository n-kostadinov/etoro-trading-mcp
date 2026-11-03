export interface DriftSource {
  id: string;
  apiVersion: string;
  canonicalSha256: string;
}

export interface SourceDrift {
  id: string;
  fromVersion: string | null;
  toVersion: string;
  fromCanonicalSha256: string | null;
  toCanonicalSha256: string;
}

export interface SwaggerDrift {
  changed: boolean;
  changes: SourceDrift[];
}

export interface PreviousSourceManifest {
  sources?: Record<string, { apiVersion?: string; canonicalSha256?: string }>;
}

export function determineSwaggerDrift(options: {
  previousManifest: PreviousSourceManifest | null;
  acquired: DriftSource[];
}): SwaggerDrift {
  const previous = options.previousManifest?.sources ?? {};
  const changes = options.acquired
    .filter((source) => previous[source.id]?.canonicalSha256 !== source.canonicalSha256)
    .map((source) => ({
      id: source.id,
      fromVersion: previous[source.id]?.apiVersion ?? null,
      toVersion: source.apiVersion,
      fromCanonicalSha256: previous[source.id]?.canonicalSha256 ?? null,
      toCanonicalSha256: source.canonicalSha256,
    }));
  return { changed: changes.length > 0, changes };
}
