# Security policy

## Supported versions

CUA Relay is pre-1.0. Security fixes are applied to the latest release only.
Official Codex and Computer Use components can change independently, so always
reproduce a report with the latest CUA Relay release before filing it.

## Report a vulnerability privately

Use GitHub private vulnerability reporting for this repository. Do not open a
public issue containing an exploit, credentials, private screenshots,
accessibility trees, personal data, local account names, or unredacted paths.

Include only what is needed to reproduce the issue:

- CUA Relay version.
- macOS version.
- MCP client name and version.
- Redacted output from `cua-relay doctor --json`.
- Expected and observed behavior.
- A minimal reproduction that does not contain private screen content.

Issues in the proprietary Codex, ChatGPT, or Computer Use components are outside
this repository's maintenance boundary. Report those through the vendor's
security channel. A CUA Relay bug that incorrectly validates, isolates, forwards,
or cleans up the official runtime is in scope here.

## Full access warning

CUA Relay currently starts its isolated Codex app-server context with:

```text
approvalPolicy: never
sandbox: danger-full-access
```

This is the relay's only operating mode. It exposes all 10 official Computer Use
tools and does not implement an app allowlist, action classifier, permission
prompt, or safe mode. Client-side approvals are separate and should remain
enabled. Full access does not bypass macOS TCC, administrator authentication,
system privacy prompts, or restrictions enforced by the official runtime.

## Data handled by the relay

`get_app_state` can return a screenshot and accessibility text. Interaction
tools can carry literal text, key combinations, element identifiers, and screen
coordinates. CUA Relay forwards these results only to the invoking MCP client
and does not intentionally persist them.

The invoking client may send tool inputs and outputs to its configured model
service. Review that client's privacy, retention, and subscription settings.
CUA Relay does not log in to a model provider, read model credentials, or call a
model API. Its isolated app-server environment contains no user Codex
credentials and has model transport disabled.

## Threats users must account for

- Prompt injection in web pages, messages, documents, and other visible UI.
- Incorrect clicks, keystrokes, text entry, uploads, purchases, or destructive
  application actions chosen by the invoking model.
- Sensitive information present in screenshots or accessibility trees.
- A compromised MCP client, dependency, local account, or already-running app.
- Loss of state between observation and action.

CUA Relay reduces the final item by enforcing one fresh `get_app_state` followed
by at most one action for the same app within 120 seconds. It cannot establish
the user's intent or determine whether an otherwise valid action is safe.

## Implementation security properties

- Only reviewed local paths for the official app-server and Computer Use client
  are accepted.
- Both executables must have a valid signature from the expected OpenAI Team ID.
- The 10-tool inventory and input schemas must exactly match the pinned contract.
- The app-server runs with a private temporary home, empty credential state,
  disabled model transport, disabled history, and disabled telemetry export.
- Any observed `turn/*` or `item/*` model activity fails the call.
- Runtime calls are FIFO serialized. Cleanup is bounded and fails closed when
  the process group, discovered descendants, or private-workdir owners cannot
  be terminated and checked.
- Unsupported elicitations are cancelled rather than fabricated as accepted.
- MCP stdout is reserved for protocol messages; diagnostics use stderr.

See [docs/security-model.md](docs/security-model.md) for the detailed trust
boundaries and non-goals.

## Sensitive-data hygiene

Never commit or attach credentials, private service URLs, model identifiers,
personal absolute paths, screenshots, accessibility trees, or typed private
content. Examples in this repository use public commands and placeholder paths
only.
