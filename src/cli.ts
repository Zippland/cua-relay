#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { inspectOfficialRuntime } from "./codex/doctor.js";
import { PRODUCT_NAME, VERSION } from "./constants.js";
import { createCuaRelayServer } from "./mcp/server.js";

const HELP = `${PRODUCT_NAME} ${VERSION}

Usage:
  cua-relay serve        Start the stdio MCP bridge (default)
  cua-relay doctor       Verify the local OpenAI-signed runtime
  cua-relay doctor --json
  cua-relay --version
  cua-relay --help

The MCP server exposes exactly the 10 official Codex Computer Use tools.
It does not implement Computer Use and does not call a model API.`;

async function serve(): Promise<void> {
  const { server, executor } = createCuaRelayServer();
  const transport = new StdioServerTransport();
  let shuttingDown = false;

  const shutdown = async (exitCode: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await executor.close();
      await server.close();
      process.exitCode = exitCode;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void shutdown(130));
  process.once("SIGTERM", () => void shutdown(143));
  process.stdin.once("end", () => void shutdown(0));

  await server.connect(transport);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && args[0] === "serve")) {
    await serve();
    return;
  }

  if (args[0] === "doctor" && args.length <= 2) {
    const json = args[1] === "--json";
    if (args.length === 2 && !json) throw new Error("Usage: cua-relay doctor [--json]");
    const report = inspectOfficialRuntime();
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`${PRODUCT_NAME}: OK`);
      console.log(`Codex: ${report.codexVersion}`);
      console.log(`Computer Use build: ${report.computerUseBuild}`);
      console.log(`Layout: ${report.computerUseLayout}`);
      console.log("Screen Recording and Accessibility are exercised by get_app_state and interaction calls.");
    }
    return;
  }

  if (args.length === 1 && (args[0] === "--version" || args[0] === "-V")) {
    console.log(VERSION);
    return;
  }

  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(HELP);
    return;
  }

  throw new Error(HELP);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
