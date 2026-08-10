import {
  AppMismatchError,
  FreshStateRequiredError,
  InvalidSessionRequestError,
  SessionCleanupError,
  SessionExecutorClosedError,
  StateExpiredError,
} from "./errors.js";
import {
  isActionMethod,
  isToolMethod,
  type ComputerUseBackendSession,
  type ComputerUseSessionBackend,
  type ExecuteOptions,
  type SessionClock,
  type SessionExecutorOptions,
  type ToolArguments,
  type ToolMethod,
  type ToolResult,
} from "./types.js";

export const DEFAULT_FRESH_STATE_TTL_MS = 120_000;

interface ReadyState {
  readonly app: string;
  readonly session: ComputerUseBackendSession;
  readonly expiresAt: number;
  readonly generation: number;
  timer: unknown;
}

const SYSTEM_CLOCK: SessionClock = {
  now: () => Date.now(),
  setTimeout(callback, delayMs) {
    const timer = globalThis.setTimeout(callback, delayMs);
    // A retained READY session should not keep an otherwise idle stdio server alive.
    timer.unref?.();
    return timer;
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

function abortIfRequested(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted();
}

function appArgument(arguments_: ToolArguments): string {
  const value = arguments_.app;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidSessionRequestError("Computer Use app must be a non-empty string");
  }
  return value;
}

function combinedFailure(primary: unknown, cleanup: SessionCleanupError): AggregateError {
  return new AggregateError(
    [primary, cleanup],
    "Computer Use call failed and its session could not be cleaned up",
  );
}

/**
 * Serializes Computer Use calls and owns the one state -> one action lease.
 *
 * No protocol or MCP concerns live here: callers map typed errors to their
 * chosen wire-level error shape, while backends adapt the official runtime.
 */
export class ComputerUseSessionExecutor {
  readonly #backend: ComputerUseSessionBackend;
  readonly #ttlMs: number;
  readonly #clock: SessionClock;
  readonly #shutdown = new AbortController();

  #tail: Promise<void> = Promise.resolve();
  #ready: ReadyState | undefined;
  #generation = 0;
  #accepting = true;
  #closePromise: Promise<void> | undefined;
  #fatalError: SessionCleanupError | undefined;
  #lastExpiredApp: string | undefined;

  constructor(backend: ComputerUseSessionBackend, options: SessionExecutorOptions = {}) {
    const ttlMs = options.ttlMs ?? DEFAULT_FRESH_STATE_TTL_MS;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError("Computer Use fresh-state TTL must be a positive finite number");
    }

    this.#backend = backend;
    this.#ttlMs = ttlMs;
    this.#clock = options.clock ?? SYSTEM_CLOCK;
  }

  execute(
    method: ToolMethod,
    arguments_: ToolArguments,
    options: ExecuteOptions = {},
  ): Promise<ToolResult> {
    if (!this.#accepting) return Promise.reject(new SessionExecutorClosedError());

    const signal = options.signal
      ? AbortSignal.any([options.signal, this.#shutdown.signal])
      : this.#shutdown.signal;
    return this.#enqueue(() => this.#executeNow(method, arguments_, { signal }));
  }

  close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;

    this.#accepting = false;
    this.#shutdown.abort(new SessionExecutorClosedError());
    this.#closePromise = this.#enqueue(async () => {
      this.#lastExpiredApp = undefined;
      await this.#closeReady();
      if (this.#fatalError) throw this.#fatalError;
    });
    return this.#closePromise;
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    return (async () => {
      await previous;
      try {
        return await operation();
      } finally {
        release();
      }
    })();
  }

  async #executeNow(
    method: ToolMethod,
    arguments_: ToolArguments,
    options: ExecuteOptions,
  ): Promise<ToolResult> {
    abortIfRequested(options.signal);

    if (!isToolMethod(method)) {
      throw new InvalidSessionRequestError(`Unknown Computer Use method: ${String(method)}`);
    }
    if (this.#fatalError) throw this.#fatalError;

    if (method === "list_apps") {
      this.#lastExpiredApp = undefined;
      await this.#closeReady();
      abortIfRequested(options.signal);
      const result = await this.#backend.callOneShot(method, arguments_, {
        signal: options.signal,
      });
      abortIfRequested(options.signal);
      return result;
    }

    if (method === "get_app_state") {
      return this.#getAppState(arguments_, options);
    }

    if (isActionMethod(method)) {
      return this.#performAction(method, arguments_, options);
    }

    // isToolMethod above makes this unreachable, but retaining a runtime guard
    // keeps the layer safe when called from untyped JavaScript.
    throw new InvalidSessionRequestError(`Unsupported Computer Use method: ${String(method)}`);
  }

  async #getAppState(
    arguments_: ToolArguments,
    options: ExecuteOptions,
  ): Promise<ToolResult> {
    const rawApp = appArgument(arguments_);

    this.#lastExpiredApp = undefined;
    await this.#closeReady();
    abortIfRequested(options.signal);

    const app = await this.#backend.resolveApp(rawApp, { signal: options.signal });
    abortIfRequested(options.signal);

    const session = await this.#backend.createSession({ signal: options.signal });
    let result: ToolResult;
    try {
      abortIfRequested(options.signal);
      result = await session.call("get_app_state", arguments_, {
        signal: options.signal,
      });
      abortIfRequested(options.signal);
    } catch (error) {
      return this.#closeDetachedAfterFailure(session, error);
    }

    if (result.isError === true) {
      await this.#closeDetached(session);
      return result;
    }

    const generation = ++this.#generation;
    const ready: ReadyState = {
      app,
      session,
      expiresAt: this.#clock.now() + this.#ttlMs,
      generation,
      timer: undefined,
    };
    this.#ready = ready;
    try {
      ready.timer = this.#clock.setTimeout(
        () => this.#expireGeneration(generation),
        this.#ttlMs,
      );
    } catch (error) {
      this.#ready = undefined;
      return this.#closeDetachedAfterFailure(session, error);
    }
    return result;
  }

  async #performAction(
    method: Exclude<ToolMethod, "list_apps" | "get_app_state">,
    arguments_: ToolArguments,
    options: ExecuteOptions,
  ): Promise<ToolResult> {
    const rawApp = appArgument(arguments_);
    const ready = this.#ready;

    if (!ready) {
      if (this.#lastExpiredApp) throw new StateExpiredError(this.#lastExpiredApp);
      throw new FreshStateRequiredError(rawApp);
    }

    if (this.#clock.now() >= ready.expiresAt) {
      this.#lastExpiredApp = ready.app;
      await this.#closeReady();
      throw new StateExpiredError(ready.app);
    }

    let app: string;
    try {
      app = await this.#backend.resolveApp(rawApp, { signal: options.signal });
      abortIfRequested(options.signal);
    } catch (error) {
      this.#lastExpiredApp = undefined;
      try {
        await this.#closeReady();
      } catch (cleanupError) {
        throw combinedFailure(error, cleanupError as SessionCleanupError);
      }
      throw error;
    }

    if (app !== ready.app) {
      this.#lastExpiredApp = undefined;
      await this.#closeReady();
      throw new AppMismatchError(ready.app, app);
    }

    const session = this.#takeReady();
    let result: ToolResult | undefined;
    let callFailed = false;
    let callFailure: unknown;
    try {
      result = await session.call(method, arguments_, { signal: options.signal });
      abortIfRequested(options.signal);
    } catch (error) {
      callFailed = true;
      callFailure = error;
    }

    let cleanupFailure: SessionCleanupError | undefined;
    try {
      await this.#closeDetached(session);
    } catch (error) {
      cleanupFailure = error as SessionCleanupError;
    }

    if (callFailed && cleanupFailure) {
      throw combinedFailure(callFailure, cleanupFailure);
    }
    if (cleanupFailure) throw cleanupFailure;
    if (callFailed) throw callFailure;
    return result as ToolResult;
  }

  #takeReady(): ComputerUseBackendSession {
    const ready = this.#ready;
    if (!ready) throw new Error("Internal error: no READY session to consume");

    this.#ready = undefined;
    this.#lastExpiredApp = undefined;
    this.#clock.clearTimeout(ready.timer);
    return ready.session;
  }

  #expireGeneration(generation: number): void {
    const expiration = this.#enqueue(async () => {
      const ready = this.#ready;
      if (!ready || ready.generation !== generation || this.#clock.now() < ready.expiresAt) {
        return;
      }

      this.#lastExpiredApp = ready.app;
      await this.#closeReady();
    });

    // Timer callbacks cannot return a promise. Cleanup failure poisons the
    // executor in #closeDetached and is surfaced by the next call or close().
    void expiration.catch(() => undefined);
  }

  async #closeReady(): Promise<void> {
    const ready = this.#ready;
    if (!ready) return;

    this.#ready = undefined;
    this.#clock.clearTimeout(ready.timer);
    await this.#closeDetached(ready.session);
  }

  async #closeDetached(session: ComputerUseBackendSession): Promise<void> {
    try {
      await session.close();
    } catch (cause) {
      const error = new SessionCleanupError(cause);
      this.#fatalError = error;
      throw error;
    }
  }

  async #closeDetachedAfterFailure(
    session: ComputerUseBackendSession,
    primary: unknown,
  ): Promise<never> {
    try {
      await this.#closeDetached(session);
    } catch (cleanupError) {
      throw combinedFailure(primary, cleanupError as SessionCleanupError);
    }
    throw primary;
  }
}
