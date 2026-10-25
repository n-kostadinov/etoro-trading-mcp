import type { ConfigurationLayer, LogLevel } from "./types.js";

export type CliCommand = "server" | "tools-list" | "config-validate" | "help" | "version";

export interface CliInvocation {
  command: CliCommand;
  settings: ConfigurationLayer;
  configPath: string | null;
  all: boolean;
  json: boolean;
}

const LIST_FLAGS: Record<string, keyof ConfigurationLayer> = {
  "--enable-toolset": "enabledToolsets",
  "--disable-toolset": "disabledToolsets",
  "--enable-tool": "enabledTools",
  "--disable-tool": "disabledTools",
};

const LOG_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

function parsePositiveInteger(flag: string, value: string): number {
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${flag} requires an integer value`);
  }
  return Number(value);
}

function validateRange(setting: string, value: number, minimum: number, maximum: number): void {
  if (value < minimum || value > maximum) {
    throw new Error(`${setting} must be between ${minimum} and ${maximum}`);
  }
}

export function parseCliArguments(args: string[]): CliInvocation {
  if (args.includes("--help")) {
    return { command: "help", settings: {}, configPath: null, all: false, json: false };
  }
  if (args.includes("--version")) {
    return { command: "version", settings: {}, configPath: null, all: false, json: false };
  }

  const settings: ConfigurationLayer = {};
  const scalars = new Map<string, string>();
  const listValues = new Map<keyof ConfigurationLayer, string[]>();
  const booleans = new Map<string, boolean>();
  const positionals: string[] = [];
  let configPath: string | null = null;
  let all = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    if (arg === "--all") {
      all = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--include-deprecated" || arg === "--no-include-deprecated") {
      booleans.set("includeDeprecated", arg === "--include-deprecated");
      continue;
    }
    if (arg === "--allow-real-money" || arg === "--no-allow-real-money") {
      booleans.set("allowRealMoney", arg === "--allow-real-money");
      continue;
    }
    const listSetting = LIST_FLAGS[arg];
    if (listSetting !== undefined) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      const values = listValues.get(listSetting) ?? [];
      if (value.trim() === "") {
        throw new Error(`${arg} value must not be empty`);
      }
      values.push(value.trim());
      listValues.set(listSetting, values);
      index += 1;
      continue;
    }
    if (
      arg === "--config" ||
      arg === "--timeout-ms" ||
      arg === "--max-response-bytes" ||
      arg === "--log-level"
    ) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      if (scalars.has(arg)) {
        throw new Error(`${arg} may only be specified once`);
      }
      scalars.set(arg, value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option ${arg}`);
  }

  const settingsRecord = settings as unknown as Record<string, unknown>;
  for (const [setting, values] of listValues) {
    settingsRecord[setting] = values;
  }
  for (const [setting, value] of booleans) {
    if (setting === "includeDeprecated") {
      settings.includeDeprecated = value;
    } else {
      settings.allowRealMoney = value;
    }
  }
  const configValue = scalars.get("--config");
  if (configValue !== undefined) {
    if (configValue.trim() === "") {
      throw new Error("--config value must not be empty");
    }
    configPath = configValue;
  }
  const timeout = scalars.get("--timeout-ms");
  if (timeout !== undefined) {
    settings.requestTimeoutMs = parsePositiveInteger("--timeout-ms", timeout);
    validateRange("requestTimeoutMs", settings.requestTimeoutMs, 1000, 600000);
  }
  const maxResponseBytes = scalars.get("--max-response-bytes");
  if (maxResponseBytes !== undefined) {
    settings.maxResponseBytes = parsePositiveInteger("--max-response-bytes", maxResponseBytes);
    validateRange("maxResponseBytes", settings.maxResponseBytes, 1024, 268435456);
  }
  const logLevel = scalars.get("--log-level");
  if (logLevel !== undefined) {
    if (!LOG_LEVELS.includes(logLevel as LogLevel)) {
      throw new Error(`--log-level must be one of ${LOG_LEVELS.join(", ")}`);
    }
    settings.logLevel = logLevel as LogLevel;
  }

  let command: CliCommand;
  if (positionals.length === 0) {
    command = "server";
  } else if (positionals.join(" ") === "tools list") {
    command = "tools-list";
  } else if (positionals.join(" ") === "config validate") {
    command = "config-validate";
  } else {
    throw new Error(`Unknown command: ${positionals.join(" ")}`);
  }
  if (all && command !== "tools-list") {
    throw new Error("--all is only valid with: tools list");
  }
  if (json && command !== "tools-list" && command !== "config-validate") {
    throw new Error("--json is only valid with: tools list or config validate");
  }

  return { command, settings, configPath, all, json };
}
