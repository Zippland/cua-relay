# CUA Relay

[简体中文](README.zh-CN.md)

**Use the official Codex Computer Use runtime from a local stdio MCP client.**

CUA Relay is a local stdio MCP compatibility bridge targeting Claude Code,
Codex CLI, Gemini CLI, and Kimi Code CLI. It exposes the 10 tools provided by the official,
OpenAI-signed Codex Computer Use runtime already installed on your Mac.

CUA Relay is not a Computer Use engine. It does not bundle or modify the
proprietary runtime, run a planner or subagent, sign in to a model service, call
a model API, or read model-provider credentials. Your MCP client continues to
use its own account and subscription.

> [!CAUTION]
> **CUA Relay currently has one operating mode: Full access.** It starts the
> isolated Codex app-server context with `approvalPolicy: "never"` and
> `sandbox: "danger-full-access"`, and exposes all 10 official tools. There is
> no relay-side safe mode, allowlist, or confirmation gate. Your MCP client may
> still ask for confirmation, but once it calls a tool the relay does not add a
> second prompt. Use it only on a Mac and account you are prepared to let the
> selected agent operate. Full access does not bypass macOS TCC, administrator
> authentication, system privacy prompts, or restrictions enforced by the
> official runtime.

## What it provides

- Standard MCP over local stdio; no network server.
- Exactly the 10 official Codex Computer Use tools and schemas.
- A retained, signed runtime session for the required
  `get_app_state -> one action` sequence.
- FIFO execution inside each relay process so one client's concurrent calls
  cannot interleave desktop state.
- Official binary signature, Team ID, tool inventory, and schema verification.
- An isolated, credential-free, ephemeral Codex app-server context with model
  transport disabled.
- Fail-closed behavior if the official runtime drifts or any model-turn activity
  appears.
- Result normalization for MCP clients that handle diagnostic
  `structuredContent` differently.

```text
Claude Code / Codex CLI / Gemini CLI / Kimi Code CLI
                         |
                   MCP over stdio
                         |
                     CUA Relay
                         |
         verified, isolated Codex app-server
                         |
       official signed Computer Use component
                         |
               macOS applications
```

See [Architecture](docs/architecture.md) for the complete trust and lifecycle
model.

## Requirements

- macOS with an unlocked graphical login session.
- Node.js 22 or newer.
- The official ChatGPT macOS app installed at `/Applications/ChatGPT.app`, with
  its Codex app-server and Computer Use component installed.
- Screen Recording and Accessibility permission for the official Computer Use
  component. `get_app_state` and interaction calls exercise these permissions;
  `doctor` and `list_apps` do not prove both permissions are available.
- One target local MCP client:
  [Claude Code](docs/clients/claude-code.md),
  [Codex CLI](docs/clients/codex-cli.md),
  [Gemini CLI](docs/clients/gemini-cli.md), or
  [Kimi Code CLI](docs/clients/kimi-cli.md).

CUA Relay does not install the official runtime and does not make a model
subscription portable between providers. It only lets the MCP client you
already use call the local Computer Use component.

## Install

From source:

```bash
git clone https://github.com/Zippland/cua-relay.git
cd cua-relay
npm ci
npm run build
npm link
cua-relay doctor
```

After an npm release is published, the equivalent global install is:

```bash
npm install --global cua-relay
cua-relay doctor
```

`doctor` checks the supported macOS layout and verifies that the Codex
app-server and Computer Use client are signed by the expected OpenAI Team ID.
It prefers the signed `Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`
executable and also supports the legacy `Resources/codex` layout. The unsigned
`codex-cli/bin/codex` launcher is not supported. If a present preferred executable
fails path or signature verification, the relay fails closed instead of falling
back. `doctor --json` reports the selected `codexPath` and `codexLayout`.
Screen Recording and Accessibility can only be proven by a real tool call.

For machine-readable diagnostics:

```bash
cua-relay doctor --json
```

## Connect an MCP client

All integrations start the same local command:

```text
cua-relay serve
```

### Claude Code

```bash
claude mcp add --transport stdio --scope user cua-relay -- cua-relay serve
claude mcp get cua-relay
claude mcp list
```

### Codex CLI

```bash
codex mcp add cua-relay -- cua-relay serve
codex mcp get cua-relay
codex mcp list
```

### Gemini CLI

```bash
gemini mcp add --scope user --transport stdio cua-relay cua-relay serve
gemini mcp list
```

Do not add `--trust` unless you intentionally want Gemini CLI to bypass its own
tool confirmations.

### Kimi Code CLI

```bash
kimi mcp add --transport stdio cua-relay -- cua-relay serve
kimi mcp test cua-relay
kimi mcp list
```

Do not use YOLO or AFK mode unless you intentionally want Kimi Code CLI to
automatically approve MCP tool calls.

If `cua-relay` is not on the launching client's `PATH`, use the source checkout
directly:

```text
command: node
args: /absolute/path/to/cua-relay/dist/src/cli.js serve
```

Complete, client-specific configuration and verification steps are under
[`docs/clients`](docs/clients).

## Tools

CUA Relay exposes no custom MCP tools:

| Tool | Purpose |
| --- | --- |
| `list_apps` | List running and recently used applications. |
| `get_app_state` | Return the key-window screenshot and accessibility tree. |
| `click` | Click by accessibility element or screenshot coordinates. |
| `perform_secondary_action` | Invoke a secondary accessibility action. |
| `set_value` | Assign a value to a settable accessibility element. |
| `select_text` | Select text or place the text cursor. |
| `scroll` | Scroll an accessibility element. |
| `drag` | Drag between screenshot coordinates. |
| `press_key` | Send a key or key combination. |
| `type_text` | Type literal text. |

The tool metadata comes from the official contract. In particular,
`destructiveHint: false` is not a safety guarantee: typing, clicking, or sending
a key can still submit, send, overwrite, or delete data in the target app.

## Required call sequence

For every interaction:

1. Call `get_app_state` for the target app.
2. Inspect the returned screenshot and accessibility tree.
3. Call at most one action for the same app within 120 seconds.
4. Call `get_app_state` again before another action.

The state lease is consumed by one action. A different app, an expired state, a
new `get_app_state`, `list_apps`, an error, or client shutdown closes the retained
runtime session. This deliberately rejects action chains based on stale UI.

## Privacy and security

CUA Relay itself does not log in to a model provider or send requests to a model
API. It creates a private temporary Codex home without user credentials,
disables model transport, and rejects observed model-turn activity.

Computer Use results are different: screenshots and accessibility text return
to the invoking MCP client. That client may send them to the model service the
user configured. Treat visible application content as data that can leave the
device through your client.

CUA Relay does not persist screenshots, accessibility trees, typed text, or tool
results. Web pages, messages, documents, and app UI can contain prompt injection.
Re-read state and verify the target before sending, submitting, deleting,
uploading, purchasing, or changing account settings.

Read the [Security model](docs/security-model.md) and
[Security policy](SECURITY.md) before use.

## Compatibility and limits

- macOS only; Windows and Linux are not supported.
- The local Mac must remain unlocked.
- The bridge has one backend: the locally installed official Codex Computer Use
  runtime.
- It does not provide remote desktop access, headless automation, macros,
  recording/replay, a planner, or a multi-backend abstraction.
- Runtime and schema drift fail closed instead of guessing.
- Client authentication, model choice, billing, and subscription limits remain
  entirely the client's responsibility.

See [Compatibility](docs/compatibility.md) and
[Troubleshooting](docs/troubleshooting.md).

## Development

```bash
npm ci
npm run check
npm test
npm run pack:check
```

Hosted tests use a fake backend and never operate the desktop. Real GUI smoke
tests require an unlocked local Mac and explicit operator supervision.

## Independence and license

CUA Relay is an independent open-source project. It is not an OpenAI product and
is not affiliated with or endorsed by OpenAI. Codex, ChatGPT, and Computer Use
remain subject to their respective terms.

The repository is MIT licensed. Selected bridge code is adapted from
[`tmustier/codex-computer-use-mcp`](https://github.com/tmustier/codex-computer-use-mcp)
under MIT. See [Third-party notices](THIRD_PARTY_NOTICES.md) and
[Provenance](docs/provenance.md).
