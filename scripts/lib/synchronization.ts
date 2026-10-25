export type SynchronizationAction =
  | { type: "none"; reason: "canonical sources unchanged" }
  | { type: "skip"; reason: "update branch already exists for this canonical hash" }
  | { type: "create" }
  | { type: "fail"; reason: string };

export function swaggerSyncBranch(version: string, canonicalSha256: string): string {
  const safeVersion = version.replace(/[^A-Za-z0-9.-]+/gu, "-");
  return `swagger-sync/${safeVersion}-${canonicalSha256.slice(0, 12)}`;
}

export function determineSynchronizationAction(options: {
  currentCanonicalSha256: string | null;
  targetCanonicalSha256: string;
  existingBranchCanonicalSha256?: string | null | undefined;
}): SynchronizationAction {
  if (options.currentCanonicalSha256 === options.targetCanonicalSha256) {
    return { type: "none", reason: "canonical sources unchanged" };
  }
  if (options.existingBranchCanonicalSha256 === undefined) {
    return { type: "create" };
  }
  if (options.existingBranchCanonicalSha256 === options.targetCanonicalSha256) {
    return { type: "skip", reason: "update branch already exists for this canonical hash" };
  }
  return {
    type: "fail",
    reason:
      "update branch exists for a different canonical hash; refusing to force-push or rewrite review history",
  };
}
