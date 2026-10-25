export type CredentialConfiguration =
  | { type: "apiKey"; apiKey: string; userKey: string }
  | { type: "bearer"; token: string }
  | null;

export function readCredentialConfiguration(
  env: Record<string, string | undefined>,
): CredentialConfiguration {
  const apiKey = env.ETORO_API_KEY?.trim();
  const userKey = env.ETORO_USER_KEY?.trim();
  const token = env.ETORO_ACCESS_TOKEN?.trim();
  const supplied = [
    { name: "ETORO_API_KEY", value: apiKey },
    { name: "ETORO_USER_KEY", value: userKey },
    { name: "ETORO_ACCESS_TOKEN", value: token },
  ].filter((entry) => entry.value !== undefined && entry.value !== "");

  if (supplied.length === 0) {
    return null;
  }
  const names = supplied.map((entry) => entry.name);
  if (names.includes("ETORO_ACCESS_TOKEN") && names.length > 1) {
    throw new Error(
      "ETORO_ACCESS_TOKEN is mutually exclusive with ETORO_API_KEY and ETORO_USER_KEY",
    );
  }
  if (names.includes("ETORO_API_KEY") !== names.includes("ETORO_USER_KEY")) {
    throw new Error("ETORO_API_KEY and ETORO_USER_KEY must be supplied together");
  }
  if (token !== undefined && token !== "") {
    return { type: "bearer", token };
  }
  if (apiKey !== undefined && userKey !== undefined) {
    return { type: "apiKey", apiKey, userKey };
  }
  throw new Error("Invalid credential configuration");
}

export function credentialSecrets(credentials: CredentialConfiguration): string[] {
  if (credentials === null) {
    return [];
  }
  return credentials.type === "apiKey"
    ? [credentials.apiKey, credentials.userKey]
    : [credentials.token];
}

export function authenticationHeaders(credentials: CredentialConfiguration): HeadersInit {
  if (credentials === null) {
    return {};
  }
  if (credentials.type === "apiKey") {
    return { "x-api-key": credentials.apiKey, "x-user-key": credentials.userKey };
  }
  return { authorization: `Bearer ${credentials.token}` };
}

export function redactSecrets(text: string, secrets: readonly string[]): string {
  return secrets
    .filter((secret) => secret.length > 0)
    .reduce((value, secret) => value.replaceAll(secret, "[redacted]"), text);
}
