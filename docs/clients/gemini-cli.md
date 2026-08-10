# Gemini CLI

CUA Relay runs as a local stdio MCP server. It does not use Gemini credentials
or call the Gemini API itself; Gemini CLI remains responsible for authentication,
model access, subscription limits, and tool confirmations.

## Before connecting

```bash
cua-relay doctor
```

CUA Relay uses Full access inside its isolated official host. Do not use Gemini
CLI's `--trust` option merely to simplify setup: that option bypasses Gemini
CLI's confirmation prompts for the server.

## Add the server

Add a user-scoped stdio server:

```bash
gemini mcp add --scope user --transport stdio cua-relay cua-relay serve
```

The equivalent entry in `~/.gemini/settings.json` is:

```json
{
  "mcpServers": {
    "cua-relay": {
      "command": "cua-relay",
      "args": [
        "serve"
      ],
      "timeout": 180000,
      "trust": false
    }
  }
}
```

For a source checkout without a global link, use:

```json
{
  "mcpServers": {
    "cua-relay": {
      "command": "node",
      "args": [
        "/absolute/path/to/cua-relay/dist/src/cli.js",
        "serve"
      ],
      "timeout": 180000,
      "trust": false
    }
  }
}
```

Replace the placeholder with the actual checkout path and keep the resulting
machine-local file out of public commits.

## Verify

Run from a folder Gemini CLI trusts; untrusted folders do not connect local
stdio MCP servers.

```bash
gemini mcp list
```

Inside Gemini CLI, `/mcp` shows the server and its tools. Confirm that 10 tools
are present, then begin with `list_apps` and `get_app_state` against a disposable
target. CUA Relay permits one action per fresh state.

See Gemini CLI's public
[MCP server documentation](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md)
for current settings and confirmation behavior.

## Remove

```bash
gemini mcp remove --scope user cua-relay
```
