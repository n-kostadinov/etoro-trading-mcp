import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli.js";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    output: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    },
    stdout: () => stdout.join("\n"),
    stderr: () => stderr.join("\n"),
  };
}

describe("inspection CLI", () => {
  it("reports the package version", async () => {
    const cli = capture();
    await expect(runCli(["--version"], cli.output, { env: {} })).resolves.toBe(0);
    expect(cli.stdout()).toContain("1.0.0");
  });

  it("lists only enabled tools by default and all states with --all", async () => {
    const enabled = capture();
    await expect(runCli(["tools", "list", "--json"], enabled.output, { env: {} })).resolves.toBe(0);
    const enabledJson = JSON.parse(enabled.stdout()) as {
      enabledCount: number;
      catalogOperationCount: number;
      tools: unknown[];
    };
    expect(enabledJson).toMatchObject({ enabledCount: 28, catalogOperationCount: 197 });
    expect(enabledJson.tools).toHaveLength(28);

    const all = capture();
    await expect(
      runCli(["tools", "list", "--all", "--json"], all.output, { env: {} }),
    ).resolves.toBe(0);
    const allJson = JSON.parse(all.stdout()) as { tools: { reason: string }[] };
    expect(allJson.tools).toHaveLength(197);
    expect(allJson.tools.some((tool) => tool.reason.includes("legacy tools"))).toBe(true);

    const realMoney = capture();
    await expect(
      runCli(["tools", "list", "--all", "--json"], realMoney.output, {
        env: { ETORO_ENABLED_TOOLSETS: "trading-real", ETORO_DISABLED_TOOLSETS: "trading-demo" },
      }),
    ).resolves.toBe(0);
    const realMoneyJson = JSON.parse(realMoney.stdout()) as { tools: { reason: string }[] };
    expect(realMoneyJson.tools.some((tool) => tool.reason.includes("real-money"))).toBe(true);
  });

  it("validates effective configuration without contacting eToro", async () => {
    const cli = capture();
    const exitCode = await runCli(["config", "validate", "--json"], cli.output, {
      env: { ETORO_ENABLED_TOOLSETS: "watchlists" },
    });
    expect(exitCode).toBe(0);
    const summary = JSON.parse(cli.stdout()) as {
      valid: boolean;
      settings: { enabledToolsets: string[] };
      counts: { enabled: number };
    };
    expect(summary.valid).toBe(true);
    expect(summary.counts.enabled).toBe(46);
    expect(summary.settings.enabledToolsets).toEqual(["watchlists"]);
  });

  it("reports unknown names as a configuration error", async () => {
    const cli = capture();
    await expect(
      runCli(["config", "validate"], cli.output, {
        env: { ETORO_ENABLED_TOOLSETS: "prices" },
      }),
    ).resolves.toBe(2);
    expect(cli.stderr()).toContain("Unknown toolset names: prices");
  });
});
