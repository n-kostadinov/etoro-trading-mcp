import type { ConfigurationLayer, LogLevel } from "./types.js";

const LOG_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

function parseList(name: string, value: string): string[] {
  if (value.trim() === "") {
    return [];
  }
  const items = value.split(",").map((item) => item.trim());
  if (items.some((item) => item.length === 0)) {
    throw new Error(`${name} contains an empty item`);
  }
  return items;
}

function parseBoolean(name: string, value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized !== "true" && normalized !== "false") {
    throw new Error(`${name} must be "true" or "false"`);
  }
  return normalized === "true";
}

function parseInteger(name: string, value: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} is outside the supported integer range`);
  }
  return parsed;
}

const REMOVED_VARIABLES: Record<string, string> = {
  ETORO_DISABLED_TOOLSETS: "was removed; list only the toolsets you want in ETORO_ENABLED_TOOLSETS",
  ETORO_DISABLED_TOOLS: "was removed; list only the tools you want in ETORO_ENABLED_TOOLS",
};

export function parseEnvironmentSettings(
  env: Record<string, string | undefined>,
): ConfigurationLayer {
  const layer: ConfigurationLayer = {};
  for (const [variable, guidance] of Object.entries(REMOVED_VARIABLES)) {
    if (env[variable] !== undefined) {
      throw new Error(`${variable} ${guidance}`);
    }
  }
  const listSettings: Array<[keyof ConfigurationLayer, string]> = [
    ["enabledToolsets", "ETORO_ENABLED_TOOLSETS"],
    ["enabledTools", "ETORO_ENABLED_TOOLS"],
  ];
  const layerRecord = layer as unknown as Record<string, unknown>;
  for (const [setting, variable] of listSettings) {
    const value = env[variable];
    if (value !== undefined) {
      layerRecord[setting] = parseList(variable, value);
    }
  }
  if (env.ETORO_INCLUDE_DEPRECATED !== undefined) {
    layer.includeDeprecated = parseBoolean(
      "ETORO_INCLUDE_DEPRECATED",
      env.ETORO_INCLUDE_DEPRECATED,
    );
  }
  if (env.ETORO_ALLOW_REAL_MONEY !== undefined) {
    layer.allowRealMoney = parseBoolean("ETORO_ALLOW_REAL_MONEY", env.ETORO_ALLOW_REAL_MONEY);
  }
  if (env.ETORO_TIMEOUT_MS !== undefined) {
    layer.requestTimeoutMs = parseInteger("ETORO_TIMEOUT_MS", env.ETORO_TIMEOUT_MS);
  }
  if (env.ETORO_MAX_RESPONSE_BYTES !== undefined) {
    layer.maxResponseBytes = parseInteger("ETORO_MAX_RESPONSE_BYTES", env.ETORO_MAX_RESPONSE_BYTES);
  }
  if (env.ETORO_LOG_LEVEL !== undefined) {
    const value = env.ETORO_LOG_LEVEL;
    if (!LOG_LEVELS.includes(value as LogLevel)) {
      throw new Error(`ETORO_LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}`);
    }
    layer.logLevel = value as LogLevel;
  }
  return layer;
}
