import { describe, expect, it } from "vitest";
import {
  authenticationHeaders,
  credentialSecrets,
  readCredentialConfiguration,
  redactSecrets,
} from "../../src/transport/credentials.js";
import { createStderrDiagnosticSink } from "../../src/mcp/stderr-logger.js";
import type { DiagnosticEvent } from "../../src/transport/types.js";

describe("credential handling", () => {
  it("accepts only a complete key pair or a lone bearer token", () => {
    expect(readCredentialConfiguration({})).toBeNull();
    expect(readCredentialConfiguration({ ETORO_API_KEY: "app", ETORO_USER_KEY: "user" })).toEqual({
      type: "apiKey",
      apiKey: "app",
      userKey: "user",
    });
    expect(readCredentialConfiguration({ ETORO_ACCESS_TOKEN: "token" })).toEqual({
      type: "bearer",
      token: "token",
    });
  });

  it("rejects mixed and partial credentials actionably", () => {
    expect(() =>
      readCredentialConfiguration({ ETORO_API_KEY: "app", ETORO_ACCESS_TOKEN: "token" }),
    ).toThrow(/mutually exclusive/u);
    expect(() => readCredentialConfiguration({ ETORO_API_KEY: "app" })).toThrow(/together/u);
  });

  it("creates authentication headers and redacts every supplied secret", () => {
    const apiKeyCredentials = readCredentialConfiguration({
      ETORO_API_KEY: "app-secret",
      ETORO_USER_KEY: "user-secret",
    });
    expect(authenticationHeaders(apiKeyCredentials)).toEqual({
      "x-api-key": "app-secret",
      "x-user-key": "user-secret",
    });
    const secrets = credentialSecrets(apiKeyCredentials);
    expect(redactSecrets("app-secret and user-secret", secrets)).toBe("[redacted] and [redacted]");
  });
});

describe("stderr diagnostics", () => {
  it("filters by level, emits JSON lines, and never throws", () => {
    const lines: string[] = [];
    const sink = createStderrDiagnosticSink("warn", (line) => lines.push(line));
    const debugEvent: DiagnosticEvent = {
      level: "debug",
      message: "ignored debug message",
    };
    const warnEvent: DiagnosticEvent = {
      level: "warn",
      message: "rate limit exhausted",
      operationId: "getRates",
    };
    sink(debugEvent);
    sink(warnEvent);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      level: "warn",
      message: "rate limit exhausted",
      operationId: "getRates",
    });
    expect(() => sink({ level: "error", message: "still safe" })).not.toThrow();
  });
});
