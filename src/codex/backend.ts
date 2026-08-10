import {
  callOfficialDirectTool,
  createOfficialDirectToolSession,
  type DirectBrokerElicitationRequest,
  type DirectBrokerElicitationResponse,
  type OfficialDirectToolSession,
} from "./official-broker.js";
import type { OfficialToolArguments, OfficialToolName } from "./tool-contract.js";
import type {
  BackendCallOptions,
  ComputerUseBackendSession,
  ComputerUseSessionBackend,
  StatefulToolMethod,
  ToolArguments,
  ToolResult,
} from "../session/index.js";

export type ElicitationForwarder = (
  request: DirectBrokerElicitationRequest,
  signal?: AbortSignal,
) => DirectBrokerElicitationResponse | Promise<DirectBrokerElicitationResponse>;

export interface OfficialBackendOptions {
  readonly onElicitation?: ElicitationForwarder;
}

function normalizeAppIdentifier(app: string): string {
  return app.trim().normalize("NFC").toLocaleLowerCase("en-US");
}

function toToolResult(result: {
  content: Array<Record<string, unknown>>;
  isError: boolean;
}): ToolResult {
  return {
    content: result.content,
    ...(result.isError ? { isError: true } : {}),
  };
}

class RetainedOfficialSession implements ComputerUseBackendSession {
  readonly #session: OfficialDirectToolSession;
  readonly #onElicitation: ElicitationForwarder | undefined;

  constructor(session: OfficialDirectToolSession, onElicitation?: ElicitationForwarder) {
    this.#session = session;
    this.#onElicitation = onElicitation;
  }

  async call(
    method: StatefulToolMethod,
    arguments_: ToolArguments,
    options: BackendCallOptions,
  ): Promise<ToolResult> {
    const result = await this.#session.call(
      method as OfficialToolName,
      arguments_ as OfficialToolArguments,
      {
        supportsOpenAiFormElicitation: false,
        ...(options.signal ? { signal: options.signal } : {}),
		...(this.#onElicitation
		  ? {
			  onElicitation: (request, signal) =>
				this.#onElicitation?.(request, signal ?? options.signal) ?? { action: "cancel" },
			}
          : {}),
      },
    );
    return toToolResult(result);
  }

  close(): Promise<void> {
    return this.#session.close();
  }
}

/**
 * The only production backend. It delegates every observation and action to
 * the locally installed, OpenAI-signed Codex Computer Use runtime.
 */
export class OfficialCodexBackend implements ComputerUseSessionBackend {
  readonly #onElicitation: ElicitationForwarder | undefined;

  constructor(options: OfficialBackendOptions = {}) {
    this.#onElicitation = options.onElicitation;
  }

  resolveApp(app: string): string {
    return normalizeAppIdentifier(app);
  }

  async createSession(options: BackendCallOptions): Promise<ComputerUseBackendSession> {
    const session = await createOfficialDirectToolSession(
      options.signal ? { signal: options.signal } : {},
    );
    return new RetainedOfficialSession(session, this.#onElicitation);
  }

  async callOneShot(
    method: "list_apps",
    arguments_: ToolArguments,
    options: BackendCallOptions,
  ): Promise<ToolResult> {
    const result = await callOfficialDirectTool(
      method,
      arguments_ as OfficialToolArguments,
      {
        supportsOpenAiFormElicitation: false,
        ...(options.signal ? { signal: options.signal } : {}),
		...(this.#onElicitation
		  ? {
			  onElicitation: (request, signal) =>
				this.#onElicitation?.(request, signal ?? options.signal) ?? { action: "cancel" },
			}
          : {}),
      },
    );
    return toToolResult(result);
  }
}
