import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  CancelledNotificationSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type RequestId,
} from "@modelcontextprotocol/sdk/types.js";

import { OfficialCodexBackend } from "../codex/backend.js";
import {
  EXPECTED_OFFICIAL_INPUT_SCHEMAS,
  isOfficialToolName,
  OFFICIAL_METHODS,
  OFFICIAL_TOOL_METADATA,
  validateOfficialArguments,
} from "../codex/tool-contract.js";
import { SERVER_NAME, VERSION } from "../constants.js";
import { ComputerUseSessionExecutor } from "../session/index.js";
import { forwardOfficialElicitationToMcpClient } from "./elicitation.js";
import { toMcpToolError, toMcpToolResult } from "./result-normalizer.js";

export interface CuaRelayServer {
  readonly server: Server;
  readonly executor: ComputerUseSessionExecutor;
}

interface SdkCancellationInternals {
  readonly _requestHandlerAbortControllers: Map<RequestId, AbortController>;
}

function installCancellationCompat(server: Server): void {
  // SDK 1.30.0 treats requestId=0 as absent. The dependency is pinned, so this
  // narrow shim replaces only that handler while preserving its controller map.
  const internals = server as unknown as SdkCancellationInternals;
  if (!(internals._requestHandlerAbortControllers instanceof Map)) {
    throw new Error("MCP SDK cancellation internals changed; refusing to start");
  }
  server.setNotificationHandler(CancelledNotificationSchema, (notification) => {
    const requestId = notification.params.requestId;
    if (requestId === undefined) return;
    internals._requestHandlerAbortControllers.get(requestId)?.abort(notification.params.reason);
  });
}

export function createCuaRelayServer(
  injectedExecutor?: ComputerUseSessionExecutor,
): CuaRelayServer {
  const server = new Server(
    { name: SERVER_NAME, version: VERSION },
    { capabilities: { tools: {} } },
  );
  installCancellationCompat(server);

  const executor =
    injectedExecutor ??
    new ComputerUseSessionExecutor(
      new OfficialCodexBackend({
        onElicitation: (request, signal) =>
          forwardOfficialElicitationToMcpClient(server, request, signal),
      }),
    );

  const tools = OFFICIAL_METHODS.map((method) => ({
    name: method,
    description: OFFICIAL_TOOL_METADATA[method].description,
    inputSchema: EXPECTED_OFFICIAL_INPUT_SCHEMAS[method],
    annotations: OFFICIAL_TOOL_METADATA[method].annotations,
  }));

  if (tools.length !== 10) {
    throw new Error(`Expected exactly 10 official Computer Use tools, received ${tools.length}`);
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name } = request.params;
    if (!isOfficialToolName(name)) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
    }

    let arguments_: Record<string, unknown>;
    try {
      arguments_ = validateOfficialArguments(name, request.params.arguments ?? {});
    } catch (error) {
      return toMcpToolError(error);
    }

    try {
      const result = await executor.execute(name, arguments_, { signal: extra.signal });
      return toMcpToolResult(result);
    } catch (error) {
      return toMcpToolError(error);
    }
  });

  server.onclose = () => {
    void executor.close().catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  };

  return { server, executor };
}
