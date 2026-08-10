# Compatibility

## Target clients

CUA Relay uses standard local MCP over stdio and targets these client families:

| Client | Transport | Configuration |
| --- | --- | --- |
| Claude Code | stdio | [Claude Code guide](clients/claude-code.md) |
| Codex CLI | stdio | [Codex CLI guide](clients/codex-cli.md) |
| Gemini CLI | stdio | [Gemini CLI guide](clients/gemini-cli.md) |
| Kimi Code CLI | stdio | [Kimi Code CLI guide](clients/kimi-cli.md) |

Compatibility requires the client to launch the same `cua-relay serve` command,
discover all 10 tools, consume text and image content blocks, and preserve the
required `get_app_state -> action` workflow. It does not mean the clients share
authentication, subscriptions, model behavior, permission UI, or billing.

### Current verification snapshot

Verified locally on 2026-08-10:

| Surface | Version | Evidence |
| --- | --- | --- |
| Claude Code | 2.1.226 | User-scoped server registration and stdio health check: connected. |
| Codex CLI | 0.147.0 | Isolated config registration, `mcp get`, and `mcp list`: enabled. |
| Generic MCP live harness | SDK 1.30.0 | Production `cua-relay serve` completed stdio initialization, exact 10-tool discovery, live `list_apps`, live `get_app_state` text/image output, and one harmless retained-session action; `structuredContent` was absent. |
| Official local runtime | Codex CLI 0.147.0-alpha.6.5; Computer Use build 1000633 | Signature and layout checks passed through the production bridge. |
| Gemini CLI | Not installed on the verification Mac | Configuration follows the current public CLI documentation; client E2E remains pending. |
| Kimi Code CLI | Not installed on the verification Mac | Configuration follows the current public CLI documentation; client E2E remains pending. |

The Claude and Codex rows prove client registration, not a model-driven desktop
task. Do not describe a client version as fully end-to-end verified until it
completes the release checklist below.

Client releases change independently. Include the exact client version in bug
reports and retest the connection after upgrading it.

## Supported host

| Requirement | Support |
| --- | --- |
| Operating system | macOS only |
| Login state | Unlocked graphical session |
| Node.js | 22 or newer |
| Codex host | App-bundled executable in the official ChatGPT macOS app |
| Computer Use layout | Current installed component, with one reviewed legacy bundle fallback |
| Transport | Local stdio only |

Windows, Linux, remote hosts, containers, SSH-only sessions, headless sessions,
and locked Macs are not supported.

## Official tool contract

CUA Relay exposes exactly:

```text
list_apps
get_app_state
click
perform_secondary_action
set_value
select_text
scroll
drag
press_key
type_text
```

No status, diagnostics, planning, policy, macro, or provider tools are added.
Use `cua-relay doctor` for installation diagnostics.

Every interaction action requires a successful `get_app_state` for the same app
within the previous 120 seconds. The state supports one action and is then
consumed. Clients that try to issue several actions from one screenshot receive
an explicit fresh-state error.

## Runtime compatibility policy

The Codex app-server and Computer Use helper are installed separately and can
change without a CUA Relay release. At startup or call time, CUA Relay verifies:

- reviewed paths and OpenAI code signatures;
- the official tool inventory;
- exact input schemas;
- an empty ephemeral runtime context;
- absence of model-turn activity.

A mismatch is reported as an incompatibility instead of being ignored. After an
official runtime update, run:

```bash
cua-relay doctor
```

Then perform a supervised read-only `list_apps` and `get_app_state` smoke test
before enabling actions.

## Client result handling

The MCP response uses `content` as the semantic result and supports official
text and image content blocks. Internal diagnostic `structuredContent` is not
forwarded because clients disagree on whether it supplements or replaces
`content`.

Remaining official elicitations are forwarded through MCP when the client
supports them. An unsupported or failed elicitation is cancelled; CUA Relay
does not fabricate user acceptance.

## Release verification

A release should not claim a client version as end-to-end verified until it has
completed, on an unlocked supervised Mac:

1. MCP initialization and `tools/list` with exactly 10 tools.
2. `list_apps`.
3. `get_app_state` with accessibility text and an image.
4. One harmless state-followed action against a disposable test target.
5. A second action rejected until state is refreshed.
6. Clean shutdown with no retained app-server process or temporary state.

Hosted CI covers protocol and session behavior using a fake backend. It cannot
prove TCC permissions or live GUI behavior.
