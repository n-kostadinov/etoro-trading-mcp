export type LogLevel = "error" | "warn" | "info" | "debug";

export interface RuntimeSettings {
  enabledToolsets: string[];
  disabledToolsets: string[];
  enabledTools: string[];
  disabledTools: string[];
  includeDeprecated: boolean;
  allowRealMoney: boolean;
  requestTimeoutMs: number;
  maxResponseBytes: number;
  logLevel: LogLevel;
}

export interface ConfigurationLayer {
  enabledToolsets?: string[];
  disabledToolsets?: string[];
  enabledTools?: string[];
  disabledTools?: string[];
  includeDeprecated?: boolean;
  allowRealMoney?: boolean;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  logLevel?: LogLevel;
}

export interface ConfigurationFile extends ConfigurationLayer {
  $schema?: string;
}

export interface ConfigurationLoadResult {
  settings: RuntimeSettings;
  configPath: string | null;
}
