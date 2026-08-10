import assert from "node:assert/strict";
import test from "node:test";

import {
  AppMismatchError,
  ComputerUseSessionExecutor,
  DEFAULT_FRESH_STATE_TTL_MS,
  FreshStateRequiredError,
  SessionCleanupError,
  SessionExecutorClosedError,
  StateExpiredError,
  type BackendCallOptions,
  type ComputerUseBackendSession,
  type ComputerUseSessionBackend,
  type SessionClock,
  type StatefulToolMethod,
  type ToolArguments,
  type ToolResult,
} from "../../src/session/index.js";

const OK: ToolResult = { content: [{ type: "text", text: "ok" }] };

interface FakeTimer {
  readonly id: number;
  readonly at: number;
  readonly callback: () => void;
  cancelled: boolean;
}

class FakeClock implements SessionClock {
  #now = 0;
  #nextId = 1;
  #timers: FakeTimer[] = [];

  now(): number {
    return this.#now;
  }

  setTimeout(callback: () => void, delayMs: number): FakeTimer {
    const timer: FakeTimer = {
      id: this.#nextId++,
      at: this.#now + delayMs,
      callback,
      cancelled: false,
    };
    this.#timers.push(timer);
    return timer;
  }

  clearTimeout(handle: unknown): void {
    (handle as FakeTimer).cancelled = true;
  }

  advance(ms: number): void {
    this.#now += ms;
    const due = this.#timers
      .filter((timer) => !timer.cancelled && timer.at <= this.#now)
      .sort((left, right) => left.at - right.at || left.id - right.id);
    for (const timer of due) {
      timer.cancelled = true;
      timer.callback();
    }
  }
}

type SessionCallHandler = (
  session: FakeSession,
  method: StatefulToolMethod,
  arguments_: ToolArguments,
  options: BackendCallOptions,
) => Promise<ToolResult>;

class FakeSession implements ComputerUseBackendSession {
  readonly id: number;
  readonly events: string[];
  readonly handler: SessionCallHandler;
  closeCount = 0;
  closeFailure: Error | undefined;

  constructor(id: number, events: string[], handler: SessionCallHandler) {
    this.id = id;
    this.events = events;
    this.handler = handler;
  }

  async call(
    method: StatefulToolMethod,
    arguments_: ToolArguments,
    options: BackendCallOptions,
  ): Promise<ToolResult> {
    this.events.push(`session:${this.id}:call:${method}`);
    return this.handler(this, method, arguments_, options);
  }

  async close(): Promise<void> {
    this.closeCount += 1;
    this.events.push(`session:${this.id}:close`);
    if (this.closeFailure) throw this.closeFailure;
  }
}

class FakeBackend implements ComputerUseSessionBackend {
  readonly events: string[] = [];
  readonly sessions: FakeSession[] = [];
  sessionHandler: SessionCallHandler = async () => OK;
  oneShotHandler: (
    arguments_: ToolArguments,
    options: BackendCallOptions,
  ) => Promise<ToolResult> = async () => OK;

  resolveApp(app: string): string {
    this.events.push(`resolve:${app}`);
    return app.trim().toLowerCase();
  }

  async createSession(): Promise<FakeSession> {
    const session = new FakeSession(
      this.sessions.length + 1,
      this.events,
      (...arguments__) => this.sessionHandler(...arguments__),
    );
    this.sessions.push(session);
    this.events.push(`session:${session.id}:create`);
    return session;
  }

  async callOneShot(
    _method: "list_apps",
    arguments_: ToolArguments,
    options: BackendCallOptions,
  ): Promise<ToolResult> {
    this.events.push("oneshot:list_apps:start");
    const result = await this.oneShotHandler(arguments_, options);
    this.events.push("oneshot:list_apps:end");
    return result;
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test("default fresh-state TTL is 120 seconds", () => {
  assert.equal(DEFAULT_FRESH_STATE_TTL_MS, 120_000);
});

test("FIFO serializes calls and continues after a rejected call", async () => {
  const backend = new FakeBackend();
  const gate = deferred();
  let calls = 0;
  backend.oneShotHandler = async () => {
    calls += 1;
    if (calls === 1) {
      await gate.promise;
      throw new Error("first failed");
    }
    return OK;
  };
  const executor = new ComputerUseSessionExecutor(backend);

  const first = executor.execute("list_apps", {});
  const second = executor.execute("list_apps", {});
  await nextMicrotask();
  assert.equal(calls, 1);

  gate.resolve();
  await assert.rejects(first, /first failed/);
  await second;
  assert.equal(calls, 2);
  assert.deepEqual(
    backend.events.filter((event) => event.startsWith("oneshot")),
    [
      "oneshot:list_apps:start",
      "oneshot:list_apps:start",
      "oneshot:list_apps:end",
    ],
  );
  await executor.close();
});

test("get_app_state retains its session for one same-app action", async () => {
  const backend = new FakeBackend();
  const executor = new ComputerUseSessionExecutor(backend);

  await executor.execute("get_app_state", { app: "COM.EXAMPLE.Notes" });
  await executor.execute("press_key", { app: "com.example.notes", key: "Return" });

  assert.equal(backend.sessions.length, 1);
  assert.equal(backend.sessions[0]?.closeCount, 1);
  assert.deepEqual(
    backend.events.filter((event) => event.startsWith("session:")),
    [
      "session:1:create",
      "session:1:call:get_app_state",
      "session:1:call:press_key",
      "session:1:close",
    ],
  );
  await executor.close();
});

test("an action consumes READY even when the official result is an error", async () => {
  const backend = new FakeBackend();
  backend.sessionHandler = async (_session, method) =>
    method === "click" ? { content: [], isError: true } : OK;
  const executor = new ComputerUseSessionExecutor(backend);

  await executor.execute("get_app_state", { app: "A" });
  const result = await executor.execute("click", { app: "a", element_index: "1" });
  assert.equal(result.isError, true);
  await assert.rejects(
    executor.execute("click", { app: "a", element_index: "1" }),
    FreshStateRequiredError,
  );
  assert.equal(backend.sessions[0]?.closeCount, 1);
  await executor.close();
});

test("an action without fresh state is rejected without a one-shot fallback", async () => {
  const backend = new FakeBackend();
  const executor = new ComputerUseSessionExecutor(backend);

  await assert.rejects(
    executor.execute("type_text", { app: "Notes", text: "hello" }),
    FreshStateRequiredError,
  );
  assert.equal(backend.sessions.length, 0);
  assert.equal(backend.events.some((event) => event.startsWith("oneshot")), false);
  await executor.close();
});

test("an app mismatch closes READY and never dispatches the action", async () => {
  const backend = new FakeBackend();
  const executor = new ComputerUseSessionExecutor(backend);

  await executor.execute("get_app_state", { app: "Notes" });
  await assert.rejects(
    executor.execute("click", { app: "Safari", element_index: "1" }),
    AppMismatchError,
  );

  assert.equal(backend.sessions[0]?.closeCount, 1);
  assert.equal(
    backend.events.some((event) => event === "session:1:call:click"),
    false,
  );
  await assert.rejects(
    executor.execute("click", { app: "Notes", element_index: "1" }),
    FreshStateRequiredError,
  );
  await executor.close();
});

test("expired state is closed and cannot be used", async () => {
  const backend = new FakeBackend();
  const clock = new FakeClock();
  const executor = new ComputerUseSessionExecutor(backend, { ttlMs: 120, clock });

  await executor.execute("get_app_state", { app: "Notes" });
  clock.advance(120);

  await assert.rejects(
    executor.execute("press_key", { app: "Notes", key: "Return" }),
    StateExpiredError,
  );
  assert.equal(backend.sessions[0]?.closeCount, 1);
  assert.equal(
    backend.events.some((event) => event === "session:1:call:press_key"),
    false,
  );
  await executor.close();
});

test("list_apps closes READY before making its one-shot call", async () => {
  const backend = new FakeBackend();
  backend.oneShotHandler = async () => {
    assert.equal(backend.sessions[0]?.closeCount, 1);
    return OK;
  };
  const executor = new ComputerUseSessionExecutor(backend);

  await executor.execute("get_app_state", { app: "Notes" });
  await executor.execute("list_apps", {});

  assert.deepEqual(backend.events.slice(-3), [
    "session:1:close",
    "oneshot:list_apps:start",
    "oneshot:list_apps:end",
  ]);
  await assert.rejects(
    executor.execute("click", { app: "Notes", element_index: "1" }),
    FreshStateRequiredError,
  );
  await executor.close();
});

test("a new get_app_state closes and replaces the previous READY session", async () => {
  const backend = new FakeBackend();
  const executor = new ComputerUseSessionExecutor(backend);

  await executor.execute("get_app_state", { app: "Notes" });
  await executor.execute("get_app_state", { app: "Safari" });

  assert.equal(backend.sessions.length, 2);
  assert.equal(backend.sessions[0]?.closeCount, 1);
  assert.equal(backend.sessions[1]?.closeCount, 0);
  await executor.close();
  assert.equal(backend.sessions[1]?.closeCount, 1);
});

test("get_app_state failure closes the newly-created session", async () => {
  const backend = new FakeBackend();
  backend.sessionHandler = async () => {
    throw new Error("state failed");
  };
  const executor = new ComputerUseSessionExecutor(backend);

  await assert.rejects(
    executor.execute("get_app_state", { app: "Notes" }),
    /state failed/,
  );
  assert.equal(backend.sessions[0]?.closeCount, 1);
  await assert.rejects(
    executor.execute("click", { app: "Notes", element_index: "1" }),
    FreshStateRequiredError,
  );
  await executor.close();
});

test("action failure still closes the retained session", async () => {
  const backend = new FakeBackend();
  backend.sessionHandler = async (_session, method) => {
    if (method === "type_text") throw new Error("action failed");
    return OK;
  };
  const executor = new ComputerUseSessionExecutor(backend);

  await executor.execute("get_app_state", { app: "Notes" });
  await assert.rejects(
    executor.execute("type_text", { app: "Notes", text: "hello" }),
    /action failed/,
  );
  assert.equal(backend.sessions[0]?.closeCount, 1);
  await assert.rejects(
    executor.execute("type_text", { app: "Notes", text: "hello" }),
    FreshStateRequiredError,
  );
  await executor.close();
});

test("close aborts the active and queued calls without dispatching queued work", async () => {
  const backend = new FakeBackend();
  const started = deferred();
  backend.sessionHandler = async (_session, method, _arguments, options) => {
    if (method !== "get_app_state") return OK;

    started.resolve();
    const signal = options.signal;
    assert.ok(signal);
    return new Promise<ToolResult>((_resolve, reject) => {
      const rejectFromAbort = () => reject(signal.reason);
      if (signal.aborted) {
        rejectFromAbort();
        return;
      }
      signal.addEventListener("abort", rejectFromAbort, { once: true });
    });
  };
  const executor = new ComputerUseSessionExecutor(backend);

  const active = executor.execute("get_app_state", { app: "Notes" });
  const queued = executor.execute("press_key", { app: "Notes", key: "Return" });
  await started.promise;

  const closing = executor.close();
  const rejectedAfterClose = assert.rejects(
    executor.execute("list_apps", {}),
    SessionExecutorClosedError,
  );
  await assert.rejects(active, SessionExecutorClosedError);
  await assert.rejects(queued, SessionExecutorClosedError);
  await rejectedAfterClose;
  await closing;

  assert.equal(backend.sessions[0]?.closeCount, 1);
  assert.equal(
    backend.events.some((event) => event === "session:1:call:press_key"),
    false,
  );
});

test("close reports a cleanup failure raised by asynchronous TTL expiration", async () => {
  const backend = new FakeBackend();
  const clock = new FakeClock();
  const executor = new ComputerUseSessionExecutor(backend, { ttlMs: 120, clock });

  await executor.execute("get_app_state", { app: "Notes" });
  const session = backend.sessions[0];
  assert.ok(session);
  session.closeFailure = new Error("TTL cleanup failed");

  clock.advance(120);

  await assert.rejects(executor.close(), (error: unknown) => {
    assert.ok(error instanceof SessionCleanupError);
    assert.equal((error.cause as Error).message, "TTL cleanup failed");
    return true;
  });
  assert.equal(session.closeCount, 1);
});

test("close cleans READY and rejects later calls", async () => {
  const backend = new FakeBackend();
  const executor = new ComputerUseSessionExecutor(backend);

  await executor.execute("get_app_state", { app: "Notes" });
  await executor.close();

  assert.equal(backend.sessions[0]?.closeCount, 1);
  await assert.rejects(executor.execute("list_apps", {}), /executor is closed/);
});
