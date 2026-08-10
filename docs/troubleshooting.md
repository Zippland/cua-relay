# Troubleshooting

Start with:

```bash
cua-relay --version
cua-relay doctor --json
```

Do not paste unredacted diagnostics, screenshots, accessibility trees, account
names, or local paths into a public issue.

## `cua-relay: command not found`

Confirm the package binary is on the same `PATH` inherited by the MCP client:

```bash
command -v cua-relay
```

For a source checkout, build it and either run `npm link` or configure the
client explicitly:

```text
command: node
args: /absolute/path/to/cua-relay/dist/src/cli.js serve
```

GUI-launched clients may inherit a smaller `PATH` than an interactive shell.
Using `node` plus an absolute placeholder-replaced script path avoids that
difference.

## The official runtime was not found

CUA Relay currently requires the official ChatGPT macOS app at
`/Applications/ChatGPT.app` and a supported local Computer Use component layout.
Open the official app, install or enable Computer Use, then rerun `doctor`.

CUA Relay does not download or redistribute the missing proprietary component.

## Signature verification failed

CUA Relay accepts only canonical reviewed paths signed by the expected OpenAI
Team ID. Reinstall or update the official application through its normal vendor
channel. Do not bypass the signature check or point the bridge at a copied
binary.

## `doctor` succeeds but the first tool call fails

`doctor` verifies files, versions, layout, and signatures. `get_app_state` and
interaction calls exercise macOS Screen Recording and Accessibility;
`list_apps` alone does not prove both permissions are available.

Review **System Settings -> Privacy & Security** for the official Computer Use
components, then restart the MCP client. Do not assume that granting permission
to a terminal automatically grants it to the signed helper.

## The MCP server is disconnected

1. Run `cua-relay doctor` in a terminal.
2. Run the client's MCP list or test command from its client guide.
3. Confirm the command is `cua-relay` and the argument is `serve`.
4. Restart the client after changing its configuration.
5. Increase the client tool timeout to at least 180 seconds if it defaults below
   the official call timeout.

For Gemini CLI, stdio servers are connected only from a trusted folder. For
Kimi Code CLI, `kimi mcp test cua-relay` prints the discovered tool list.

## Exactly 10 tools are not available

CUA Relay rejects any official tool inventory or schema that differs from the
pinned contract. This commonly means the installed official runtime changed.
Upgrade CUA Relay to a release that explicitly supports that runtime. Do not
disable the drift check or manually hide the mismatch.

## Fresh state is required

Every action requires a successful `get_app_state` for the same app. State is
consumed after one action and expires after 120 seconds. Ask the client to:

1. call `get_app_state` for the target app;
2. inspect the new screenshot and accessibility tree;
3. perform one action;
4. refresh state before the next action.

## App mismatch

The `app` value used for an action resolved to a different app than the preceding
`get_app_state`. CUA Relay closes the retained session rather than guessing.
Refresh state and use the same unambiguous app or bundle identifier.

## Screenshot or accessibility content is missing

Confirm that both Screen Recording and Accessibility are granted and that the
target Mac is unlocked. Then start a fresh client session. CUA Relay returns the
official `content` blocks and deliberately omits internal diagnostic
`structuredContent`.

## Calls fail while the Mac is locked

Locked-screen local operation is not supported. Unlock the Mac and refresh app
state. CUA Relay does not attempt to unlock the computer or bypass the official
runtime's session restrictions.

## Cleanup failure

A cleanup error is fatal for that server process because continuing could leave
an unknown app-server state. Stop the MCP client, confirm no CUA Relay-launched
process remains, then restart it. If the failure repeats, file a private security
report with redacted diagnostics.

## The model chooses incorrect actions

That is not a transport failure. Keep client-side confirmations enabled, use a
disposable target, and require the agent to refresh state before every action.
Do not enable a client's automatic-approval mode to work around poor model
behavior.
