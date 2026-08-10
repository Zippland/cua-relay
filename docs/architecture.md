# Architecture

## Scope

CUA Relay is a compatibility bridge, not a Computer Use implementation. Its one
production backend is the official Codex Computer Use component already
installed on the user's Mac. The repository contains no Computer Use binary,
vision model, planner, remote-control service, or model-provider integration.

The public interface is a local standard MCP server over stdio:

```text
MCP client
  -> CUA Relay stdio server
  -> session executor
  -> official-runtime adapter
  -> isolated Codex app-server
  -> OpenAI-signed Computer Use MCP client
  -> macOS application
```

## Components

### CLI

`cua-relay serve` starts the stdio MCP server. `cua-relay doctor` performs
read-only installation and signature checks. Diagnostics remain CLI commands so
the MCP surface contains exactly the 10 official tools.

### MCP server

The server publishes the official tool names, descriptions, schemas, and MCP
annotations. It validates every argument before dispatch, forwards supported
elicitation requests, maps session errors to MCP tool errors, and returns only
semantic `content` plus `isError`.

Diagnostic `structuredContent` from the internal app-server is deliberately not
forwarded. Some MCP clients treat it as the primary tool result, which can hide
the screenshot or accessibility tree in `content`.

### Session executor

Computer Use element indices and active-app state belong to an inspection
session. The executor implements a small state machine:

| State | Accepted call | Resulting state |
| --- | --- | --- |
| Idle | `list_apps` | Idle |
| Idle | `get_app_state(app)` | Ready for that app |
| Idle | Any action | Rejected: fresh state required |
| Ready | One action for the same app | Idle after verified cleanup |
| Ready | Action for another app | Rejected and closed |
| Ready | New `get_app_state` | Old session closed, new app ready |
| Ready | `list_apps` | Session closed, then one-shot list |
| Ready | 120-second expiry | Session closed; next action rejected |
| Any | Error, cancellation, or shutdown | Session closed |

All calls handled by one relay process pass through one FIFO queue. A cleanup
failure poisons the executor so subsequent calls cannot continue against an
unknown process state. Separate MCP clients normally launch separate stdio
processes; v0.1 does not claim cross-process serialization.

### Official-runtime adapter

The adapter accepts only reviewed official installation layouts. It resolves
canonical paths and verifies both the app-bundled Codex executable and the
Computer Use client with strict code-signature validation and the expected
OpenAI Team ID.

For each retained session it creates a private temporary root containing:

- an empty Codex home with no account credentials;
- an empty working directory;
- a minimal configuration containing only the official Computer Use MCP server;
- a disabled model provider pointed at unreachable loopback;
- disabled shell, plugins, remote control, memories, hooks, history, analytics,
  telemetry export, and web search.

The app-server context is pathless, ephemeral, and starts with no turns. The
adapter uses `mcpServer/tool/call` directly and never calls `turn/start`. Any
observed `turn/*` or `item/*` activity terminates the session and fails closed.

### Process lifecycle

The app-server and its helpers run in a detached process group rooted in the
private working directory. Closing a session uses one bounded cleanup deadline:
it freezes the group, enumerates descendants and processes that still own the
working directory, terminates them, checks the known processes, and removes
temporary state. A call fails closed if these checks fail.

This lifecycle check assumes the signed official runtime is not intentionally
trying to escape its process group, ancestry, and private working directory at
the same time. CUA Relay does not claim containment against a malicious or
compromised signed runtime.

## Full access semantics

The isolated app-server thread is created with:

```text
approvalPolicy: never
sandbox: danger-full-access
```

This is the current product contract, not a fallback. CUA Relay does not add a
second authorization system, app allowlist, or action policy. Approval UI in
Claude Code, Codex CLI, Gemini CLI, or Kimi Code CLI belongs to that client and
should remain enabled.

The setting does not bypass operating-system controls. macOS TCC, Screen
Recording, Accessibility, administrator authentication, privacy dialogs, and
restrictions inside the official Computer Use component remain authoritative.

## Protocol invariants

CUA Relay fails closed unless all of the following remain true:

1. Both official executables resolve to canonical reviewed locations.
2. Both have valid signatures from the expected OpenAI Team ID.
3. The official server exposes exactly the pinned 10-tool inventory.
4. Every official input schema matches the pinned contract.
5. The runtime attests an empty, pathless, ephemeral context.
6. No model-turn activity occurs.
7. Tool results contain only supported text or image blocks within size limits.
8. The owned process tree is cleaned up after use.

Failing closed can temporarily reject a newer official release. This is
intentional: silently guessing at a private runtime change has a higher cost
than requiring a reviewed CUA Relay update.

## Data flow

Tool arguments and results travel between the MCP client and the local official
runtime. CUA Relay does not initiate model API traffic. The invoking MCP client
may include screenshots, accessibility text, and action results in its own model
request, according to that client's configuration.

CUA Relay does not intentionally persist tool arguments or results. Bounded
stderr diagnostics must never contain screenshots, accessibility trees, typed
text, credentials, or model-provider configuration.

## Non-goals

- Implementing mouse, keyboard, screen capture, accessibility, or vision logic.
- Supporting a second Computer Use backend.
- Windows, Linux, remote desktop, locked-screen, or headless operation.
- Natural-language planning, autonomous task execution, macros, or replay.
- Providing a sandbox, intent classifier, subscription proxy, or model gateway.
