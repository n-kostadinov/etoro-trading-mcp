import type { CatalogOperation, ToolCatalog } from "../catalog/types.js";
import type { RuntimeSettings } from "../config/types.js";

export type ToolBlockReason = "deprecated" | "real-money";

export interface ToolStatus {
  operationId: string;
  toolsetId: string;
  method: string;
  path: string;
  selected: boolean;
  enabled: boolean;
  blockedBy: ToolBlockReason[];
  reason: string;
}

export interface ToolRegistry {
  enabledToolsets: string[];
  enabledOperations: CatalogOperation[];
  statuses: ToolStatus[];
  warnings: string[];
}

function rejectUnknownNames(
  names: string[],
  validNames: ReadonlySet<string>,
  kind: "toolset" | "tool",
): void {
  const unknown = [...new Set(names)].filter((name) => !validNames.has(name));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown ${kind} names: ${unknown.join(", ")}. Run "etoro-trading-mcp tools list --all" to inspect valid names.`,
    );
  }
}

function statusReason(status: Omit<ToolStatus, "reason">): string {
  if (status.enabled) {
    return "enabled";
  }
  if (!status.selected) {
    return "toolset is not selected and the tool is not individually enabled";
  }
  if (status.blockedBy.includes("deprecated")) {
    return "blocked: legacy tools require includeDeprecated";
  }
  return "blocked: real-money mutations require allowRealMoney";
}

export function resolveToolRegistry(catalog: ToolCatalog, settings: RuntimeSettings): ToolRegistry {
  const validToolsets = new Set(catalog.toolsets.map((toolset) => toolset.id));
  const validTools = new Set(catalog.operations.map((operation) => operation.operationId));
  rejectUnknownNames(settings.enabledToolsets, validToolsets, "toolset");
  rejectUnknownNames(settings.enabledTools, validTools, "tool");

  const enabledToolsets = new Set(settings.enabledToolsets);
  const enabledTools = new Set(settings.enabledTools);
  const statuses: ToolStatus[] = [];
  const enabledOperations: CatalogOperation[] = [];
  const warnings: string[] = [];

  for (const operation of catalog.operations) {
    const selected =
      enabledToolsets.has(operation.toolsetId) || enabledTools.has(operation.operationId);
    const blockedBy: ToolBlockReason[] = [];
    if (selected && operation.deprecated && !settings.includeDeprecated) {
      blockedBy.push("deprecated");
    }
    if (selected && operation.realMoneyMutation && !settings.allowRealMoney) {
      blockedBy.push("real-money");
    }
    const partialStatus = {
      operationId: operation.operationId,
      toolsetId: operation.toolsetId,
      method: operation.method,
      path: operation.path,
      selected,
      enabled: selected && blockedBy.length === 0,
      blockedBy,
    };
    statuses.push({ ...partialStatus, reason: statusReason(partialStatus) });
    if (partialStatus.enabled) {
      enabledOperations.push(operation);
    }
    if (selected && blockedBy.length > 0) {
      warnings.push(`${operation.operationId} is selected but blocked (${blockedBy.join(", ")})`);
    }
  }

  if (enabledOperations.length === 0) {
    warnings.push("No tools are enabled; the MCP server will expose an empty tool list");
  }

  return {
    enabledToolsets: [...enabledToolsets],
    enabledOperations,
    statuses,
    warnings,
  };
}
