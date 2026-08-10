import type {
  BackendCallOptions,
  ComputerUseBackendSession,
  ComputerUseSessionBackend,
  StatefulToolMethod,
  ToolArguments,
  ToolResult,
} from "../../src/session/index.js";

export class FakeOfficialBackend implements ComputerUseSessionBackend {
  readonly calls: string[] = [];
  sessionsCreated = 0;
  sessionsClosed = 0;

  resolveApp(app: string): string {
    return app.trim().toLowerCase();
  }

  async createSession(): Promise<ComputerUseBackendSession> {
    this.sessionsCreated += 1;
    const sessionId = this.sessionsCreated;
    return {
      call: async (
        method: StatefulToolMethod,
        _arguments: ToolArguments,
        _options: BackendCallOptions,
      ): Promise<ToolResult> => {
        this.calls.push(`${sessionId}:${method}`);
        if (method === "get_app_state") {
          return {
            content: [
              { type: "text", text: "AXWindow: Test" },
              { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
            ],
          };
        }
        return { content: [{ type: "text", text: `action:${method}` }] };
      },
      close: async (): Promise<void> => {
        this.sessionsClosed += 1;
      },
    };
  }

  async callOneShot(): Promise<ToolResult> {
    this.calls.push("oneshot:list_apps");
    return { content: [{ type: "text", text: "Test App" }] };
  }
}
