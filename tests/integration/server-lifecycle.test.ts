import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import catalogModule from "../../src/generated/tool-catalog.js";
import { defaultRuntimeSettings } from "../../src/config/configuration.js";
import { startMcpServer } from "../../src/mcp/start-server.js";
import type { EtoroTransport } from "../../src/transport/types.js";

const transport: EtoroTransport = {
  execute: async () => {
    throw new Error("The lifecycle suite does not dispatch tools");
  },
};

async function startLifecycleServer(installSignalHandlers: boolean) {
  const serverInput = new PassThrough();
  const serverOutput = new PassThrough();
  const handle = await startMcpServer({
    settings: { ...defaultRuntimeSettings },
    catalog: catalogModule,
    credentials: null,
    stdin: serverInput,
    stdout: serverOutput,
    installSignalHandlers,
    transportFactory: () => transport,
  });
  return { handle, serverInput };
}

function signalListenerCounts() {
  return {
    sigint: process.listenerCount("SIGINT"),
    sigterm: process.listenerCount("SIGTERM"),
  };
}

describe("server lifecycle", () => {
  it("shares one close operation across concurrent and repeated calls", async () => {
    const before = signalListenerCounts();
    const { handle } = await startLifecycleServer(true);
    const firstClose = handle.close();
    const concurrentClose = handle.close();

    expect(concurrentClose).toBe(firstClose);
    await firstClose;
    await expect(handle.close()).resolves.toBeUndefined();
    await handle.closed;
    expect(signalListenerCounts()).toEqual(before);
  });

  it("settles stdio-driven closure and removes installed signal listeners", async () => {
    const before = signalListenerCounts();
    const { handle, serverInput } = await startLifecycleServer(true);

    serverInput.end();
    await handle.closed;
    expect(signalListenerCounts()).toEqual(before);
    await expect(handle.close()).resolves.toBeUndefined();
  });
});
