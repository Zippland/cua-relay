# Claude Code

CUA Relay runs as a local stdio MCP server. It does not use Claude credentials
or call the Anthropic API itself; Claude Code remains responsible for its own
authentication, model, subscription, permissions, and tool decisions.

## Before connecting

```bash
cua-relay doctor
```

Read the repository's [Full access semantics](../security-model.md#full-access)
before continuing. Keep Claude Code's normal MCP/tool confirmation behavior
enabled. CUA Relay adds no second confirmation after Claude Code calls a tool.

## Add the server

Make the bridge available to all Claude Code projects for the current user:

```bash
claude mcp add --transport stdio --scope user cua-relay -- cua-relay serve
```

Alternatively, use the repository's [`claude-mcp.example.json`](../../claude-mcp.example.json)
as a starting point. It contains no credentials or machine-specific path.

For a source checkout without a global link, configure:

```json
{
  "mcpServers": {
    "cua-relay": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/cua-relay/dist/src/cli.js",
        "serve"
      ]
    }
  }
}
```

Replace the placeholder with the checkout's actual absolute path, but do not
commit that machine-local configuration to a public repository.

## Verify

```bash
claude mcp get cua-relay
claude mcp list
```

Start a new Claude Code session after changing MCP configuration. In the session,
use `/mcp` and confirm that `cua-relay` is connected and exposes exactly 10
tools.

Begin with supervised read-only calls:

1. Ask Claude Code to call `list_apps`.
2. Ask it to call `get_app_state` for a disposable target app.
3. Inspect the screenshot and accessibility tree before allowing an action.

CUA Relay requires a fresh `get_app_state` before every action and consumes the
state after one action.

## Remove

```bash
claude mcp remove --scope user cua-relay
```

Refer to the current
[Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) for client
configuration and permission behavior.
