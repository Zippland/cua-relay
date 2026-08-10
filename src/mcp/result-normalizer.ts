import type { CallToolResult, ContentBlock } from "@modelcontextprotocol/sdk/types.js";
import type { ToolResult } from "../session/index.js";

/**
 * Keep MCP `content` as the sole semantic result. Diagnostic metadata from the
 * app-server is intentionally never exposed as `structuredContent`, because
 * some clients prefer it and would then hide the screenshot or AX tree.
 */
export function toMcpToolResult(result: ToolResult): CallToolResult {
  return {
    content: result.content as ContentBlock[],
    ...(result.isError === true ? { isError: true } : {}),
  };
}

export function toMcpToolError(error: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : "Official Codex Computer Use failed",
      },
    ],
    isError: true,
  };
}
