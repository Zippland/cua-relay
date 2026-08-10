# Codex CLI

CUA Relay runs as a local stdio MCP server. The bridge's isolated app-server is
only a signed host for direct Computer Use calls; it does not start a Codex model
turn or use Codex CLI's model credentials. Codex CLI continues to manage its own
login, model, subscription, sandbox, and approvals.

## Before connecting

```bash
cua-relay doctor
```

CUA Relay itself uses Full access inside its empty ephemeral host context. Keep
Codex CLI's MCP tool approvals enabled so the client remains the user-facing
decision point.

## Add the server

```bash
codex mcp add cua-relay -- cua-relay serve
codex mcp get cua-relay
codex mcp list
```

Codex stores MCP configuration in `~/.codex/config.toml`. For explicit timeouts
and client-side prompting, the equivalent configuration is:

```toml
[mcp_servers.cua-relay]
command = "cua-relay"
args = ["serve"]
startup_timeout_sec = 30
tool_timeout_sec = 180
default_tools_approval_mode = "prompt"
```

For a source checkout without a global link:

```toml
[mcp_servers.cua-relay]
command = "node"
args = ["/absolute/path/to/cua-relay/dist/src/cli.js", "serve"]
startup_timeout_sec = 30
tool_timeout_sec = 180
default_tools_approval_mode = "prompt"
```

Replace the placeholder with the checkout's actual absolute path. Do not commit
a personal path into a public repository.

## Verify

Restart Codex CLI after editing `config.toml`. In the TUI, run `/mcp` and confirm
that `cua-relay` is connected and exposes exactly 10 tools.

Use a supervised sequence:

1. `list_apps`.
2. `get_app_state` for a disposable target.
3. At most one action against the same app within 120 seconds.
4. Refresh state before every later action.

The official OpenAI documentation for current MCP CLI commands and `config.toml`
fields is [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp).

## Remove

```bash
codex mcp remove cua-relay
```
