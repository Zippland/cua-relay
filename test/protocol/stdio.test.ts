import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("a real stdio transport initializes, lists tools, and returns content", async () => {
  const serverEntry = fileURLToPath(new URL("../fixtures/stdio-server.js", import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    stderr: "pipe",
  });
  const client = new Client(
    { name: "cua-relay-stdio-test", version: "1.0.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 10);

    const result = await client.callTool({ name: "list_apps", arguments: {} });
    assert.deepEqual(result.content, [{ type: "text", text: "Test App" }]);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "structuredContent"), false);
  } finally {
    await client.close();
  }
});
