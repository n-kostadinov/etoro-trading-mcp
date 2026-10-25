import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import { parseEnvironmentSettings } from "./environment.js";
import type {
  ConfigurationFile,
  ConfigurationLayer,
  ConfigurationLoadResult,
  RuntimeSettings,
} from "./types.js";

export const defaultRuntimeSettings: RuntimeSettings = {
  enabledToolsets: [],
  enabledTools: [],
  includeDeprecated: false,
  allowRealMoney: false,
  requestTimeoutMs: 30_000,
  maxResponseBytes: 25 * 1024 * 1024,
  logLevel: "info",
};

export interface LoadConfigurationOptions {
  env: Record<string, string | undefined>;
  cli: ConfigurationLayer;
  cliConfigPath: string | null;
  readFile?: ((path: string) => Promise<string>) | undefined;
  configSchema?: unknown;
}

async function defaultReadFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function loadConfigSchema(
  readFileImplementation: (path: string) => Promise<string>,
): Promise<unknown> {
  const schemaUrl = new URL("../../schemas/config.schema.json", import.meta.url);
  return JSON.parse(await readFileImplementation(fileURLToPath(schemaUrl))) as unknown;
}

// The schema describes any partial layer; required settings are supplied by defaults.
const layerSchemaReference = "urn:etoro-trading-mcp:configuration";

function validateLayer(
  ajv: Ajv2020,
  layer: ConfigurationLayer | ConfigurationFile,
  layerName: string,
): void {
  if (
    !ajv.validate(layerSchemaReference, layer) &&
    ajv.errors !== undefined &&
    ajv.errors !== null
  ) {
    const details = ajv.errors
      .map((error) => {
        const additionalProperty = (error.params as { additionalProperty?: string } | undefined)
          ?.additionalProperty;
        const location =
          additionalProperty === undefined
            ? error.instancePath || "/"
            : `${error.instancePath || ""}/${additionalProperty}`;
        return `${location} ${error.message ?? "is invalid"}`;
      })
      .join("; ");
    throw new Error(`${layerName} failed schema validation: ${details}`);
  }
}

function initializeValidator(schema: unknown): Ajv2020 {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  ajv.addSchema(schema as AnySchema, layerSchemaReference);
  return ajv;
}

export async function loadConfiguration(
  options: LoadConfigurationOptions,
): Promise<ConfigurationLoadResult> {
  const readFileImplementation = options.readFile ?? defaultReadFile;
  const ajv = initializeValidator(
    options.configSchema ?? (await loadConfigSchema(readFileImplementation)),
  );
  const configPath = options.cliConfigPath ?? options.env.ETORO_CONFIG ?? null;
  if (configPath !== null && configPath.trim() === "") {
    throw new Error("Configuration path must not be empty");
  }

  let fileLayer: ConfigurationFile = {};
  if (configPath !== null) {
    let content: string;
    try {
      content = await readFileImplementation(configPath);
    } catch (error) {
      throw new Error(`Unable to read configuration file ${configPath}: ${String(error)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error(`Configuration file ${configPath} is not valid JSON: ${String(error)}`);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Configuration file ${configPath} must contain a JSON object`);
    }
    fileLayer = parsed as ConfigurationFile;
    validateLayer(ajv, fileLayer, `Configuration file ${configPath}`);
  }

  const environmentLayer = parseEnvironmentSettings(options.env);
  validateLayer(ajv, environmentLayer, "Environment configuration");
  validateLayer(ajv, options.cli, "CLI configuration");

  const settings = { ...defaultRuntimeSettings };
  const settingsRecord = settings as unknown as Record<string, unknown>;
  for (const layer of [fileLayer, environmentLayer, options.cli]) {
    const layerRecord = layer as unknown as Record<string, unknown>;
    for (const key of Object.keys(defaultRuntimeSettings)) {
      if (layerRecord[key] !== undefined) {
        settingsRecord[key] = layerRecord[key];
      }
    }
  }

  return { settings, configPath };
}
