# Kimi Code CLI

CUA Relay runs as a local stdio MCP server. It does not use Kimi credentials or
call a Moonshot model API itself; Kimi Code CLI remains responsible for its own
login, model access, subscription, and approvals.

## Before connecting

```bash
cua-relay doctor
```

CUA Relay uses Full access inside its isolated official host. Kimi Code CLI
normally asks before MCP tool calls. Do not use YOLO or AFK mode unless you
intentionally want those calls automatically approved.

## Add the server

```bash
kimi mcp add --transport stdio cua-relay -- cua-relay serve
```

The equivalent `~/.kimi/mcp.json` entry is:

```json
{
  "mcpServers": {
    "cua-relay": {
      "command": "cua-relay",
      "args": [
        "serve"
      ]
    }
  }
}
```

For a source checkout without a global link:

```json
{
  "mcpServers": {
    "cua-relay": {
      "command": "node",
      "args": [
        "/absolute/path/to/cua-relay/dist/src/cli.js",
        "serve"
      ]
    }
  }
}
```

Replace the placeholder with the actual checkout path and do not commit the
machine-local file publicly.

## Verify

```bash
kimi mcp test cua-relay
kimi mcp list
```

`kimi mcp test` should report exactly 10 tools. Inside Kimi Code CLI, `/mcp`
shows connection status and loaded tools. Begin with supervised `list_apps` and
`get_app_state` calls; every action needs a fresh state and consumes it.

See Kimi Code CLI's public
[MCP documentation](https://github.com/MoonshotAI/kimi-cli/blob/main/docs/en/customization/mcp.md)
for current configuration and approval behavior.

## Remove

```bash
kimi mcp remove cua-relay
```
