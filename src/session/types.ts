export const ACTION_METHODS = [
  "click",
  "perform_secondary_action",
  "set_value",
  "select_text",
  "scroll",
  "drag",
  "press_key",
  "type_text",
] as const;

export type ActionMethod = (typeof ACTION_METHODS)[number];
export type StatefulToolMethod = "get_app_state" | ActionMethod;
export type ToolMethod = "list_apps" | StatefulToolMethod;

export type ToolArguments = Readonly<Record<string, unknown>>;

/** The session layer deliberately treats MCP content as an opaque payload. */
export interface ToolResult {
  readonly content: readonly unknown[];
  readonly isError?: boolean;
}

export interface BackendCallOptions {
  readonly signal?: AbortSignal | undefined;
}

/** One retained official app-server/Computer Use session. */
export interface ComputerUseBackendSession {
  call(
    method: StatefulToolMethod,
    arguments_: ToolArguments,
    options: BackendCallOptions,
  ): Promise<ToolResult>;

  close(): Promise<void>;
}

/**
 * Adapter boundary for the official Computer Use backend.
 *
 * Keeping process creation and app identity resolution behind this interface
 * makes the state machine deterministic in unit tests.
 */
export interface ComputerUseSessionBackend {
  resolveApp(app: string, options: BackendCallOptions): Promise<string> | string;

  createSession(options: BackendCallOptions): Promise<ComputerUseBackendSession>;

  callOneShot(
    method: "list_apps",
    arguments_: ToolArguments,
    options: BackendCallOptions,
  ): Promise<ToolResult>;
}

export interface SessionClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SessionExecutorOptions {
  /** Fresh state lifetime. Defaults to 120 seconds. */
  readonly ttlMs?: number;
  /** Injectable monotonic-enough clock/timer surface for deterministic tests. */
  readonly clock?: SessionClock;
}

export interface ExecuteOptions {
  readonly signal?: AbortSignal | undefined;
}

const ACTION_METHOD_SET: ReadonlySet<string> = new Set(ACTION_METHODS);

export function isActionMethod(method: string): method is ActionMethod {
  return ACTION_METHOD_SET.has(method);
}

export function isToolMethod(method: string): method is ToolMethod {
  return method === "list_apps" || method === "get_app_state" || isActionMethod(method);
}
