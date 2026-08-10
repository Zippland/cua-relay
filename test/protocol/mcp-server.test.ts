import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { JSONRPCMessage, RequestId } from "@modelcontextprotocol/sdk/types.js";

import { OFFICIAL_METHODS } from "../../src/codex/tool-contract.js";
import { createCuaRelayServer } from "../../src/mcp/server.js";
import {
  ComputerUseSessionExecutor,
  type ExecuteOptions,
  type ToolArguments,
  type ToolMethod,
  type ToolResult,
} from "../../src/session/index.js";
import { FakeOfficialBackend } from "../fixtures/fake-backend.js";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class BlockingExecutor extends ComputerUseSessionExecutor {
  readonly started = deferred<AbortSignal>();
  readonly result = deferred<ToolResult>();

  constructor() {
    super(new FakeOfficialBackend());
  }

  override execute(
    _method: ToolMethod,
    _arguments: ToolArguments,
    options: ExecuteOptions = {},
  ): Promise<ToolResult> {
    assert.ok(options.signal);
    this.started.resolve(options.signal);
    return this.result.promise;
  }
}

async function connectedHarness() {
  const backend = new FakeOfficialBackend();
  const executor = new ComputerUseSessionExecutor(backend);
  const { server } = createCuaRelayServer(executor);
  const client = new Client(
    { name: "cua-relay-protocol-test", version: "1.0.0" },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    backend,
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

async function assertCancellationAbortsWithoutLateResponse(requestId: RequestId): Promise<void> {
  const executor = new BlockingExecutor();
  const { server } = createCuaRelayServer(executor);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const received: JSONRPCMessage[] = [];
  clientTransport.onmessage = (message) => received.push(message);

  await Promise.all([server.connect(serverTransport), clientTransport.start()]);
  try {
    await clientTransport.send({
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: { name: "list_apps", arguments: {} },
    });
    const signal = await executor.started.promise;
    assert.equal(signal.aborted, false);
    const aborted = new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true });
    });

    await clientTransport.send({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId, reason: "protocol test" },
    });
    await aborted;
    assert.equal(signal.aborted, true);

    executor.result.resolve({ content: [{ type: "text", text: "late result" }] });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(
      received.some((message) => "id" in message && message.id === requestId),
      false,
    );
  } finally {
    executor.result.resolve({ content: [] });
    await server.close();
  }
}

test("notifications/cancelled aborts an in-flight tools/call with request id 0", async () => {
  await assertCancellationAbortsWithoutLateResponse(0);
});

test("notifications/cancelled still aborts an in-flight tools/call with a non-zero id", async () => {
  await assertCancellationAbortsWithoutLateResponse(7);
});

test("tools/list exposes exactly the 10 official tools", async () => {
  const harness = await connectedHarness();
  try {
    const listed = await harness.client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      [...OFFICIAL_METHODS],
    );
    assert.equal(listed.tools.some((tool) => /status|health|doctor/.test(tool.name)), false);
  } finally {
    await harness.close();
  }
});

test("content is preserved without diagnostic structuredContent", async () => {
  const harness = await connectedHarness();
  try {
    const result = await harness.client.callTool({
      name: "get_app_state",
      arguments: { app: "Test App" },
    });
    assert.deepEqual(result.content, [
      { type: "text", text: "AXWindow: Test" },
      { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
    ]);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "structuredContent"), false);
  } finally {
    await harness.close();
  }
});

test("get_app_state and the next same-app action share one backend session", async () => {
  const harness = await connectedHarness();
  try {
    await harness.client.callTool({
      name: "get_app_state",
      arguments: { app: "Test App" },
    });
    const action = await harness.client.callTool({
      name: "press_key",
      arguments: { app: "test app", key: "Return" },
    });
    assert.deepEqual(action.content, [{ type: "text", text: "action:press_key" }]);
    assert.deepEqual(harness.backend.calls, ["1:get_app_state", "1:press_key"]);
    assert.equal(harness.backend.sessionsCreated, 1);
    assert.equal(harness.backend.sessionsClosed, 1);
  } finally {
    await harness.close();
  }
});

test("an action without fresh state fails instead of opening a one-shot session", async () => {
  const harness = await connectedHarness();
  try {
    const result = await harness.client.callTool({
      name: "click",
      arguments: { app: "Test App", element_index: "1" },
    });
    assert.equal(result.isError, true);
    const content = result.content as Array<{ text?: string }>;
    assert.match(String(content[0]?.text), /Call get_app_state/);
    assert.equal(harness.backend.sessionsCreated, 0);
    assert.deepEqual(harness.backend.calls, []);
  } finally {
    await harness.close();
  }
});

test("schema validation errors do not consume a retained state", async () => {
  const harness = await connectedHarness();
  try {
    await harness.client.callTool({
      name: "get_app_state",
      arguments: { app: "Test App" },
    });
    const invalid = await harness.client.callTool({
      name: "press_key",
      arguments: { app: "Test App" },
    });
    assert.equal(invalid.isError, true);

    const valid = await harness.client.callTool({
      name: "press_key",
      arguments: { app: "Test App", key: "Return" },
    });
    assert.equal(valid.isError, undefined);
    assert.deepEqual(harness.backend.calls, ["1:get_app_state", "1:press_key"]);
  } finally {
    await harness.close();
  }
});
