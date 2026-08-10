# Security model

## Summary

CUA Relay gives an MCP client read and write access to real macOS applications
through the official Codex Computer Use runtime. It is powerful local automation,
not a sandbox. The current release deliberately uses Full access and relies on
the invoking client and the user to decide when a tool call is appropriate.

## Trust boundaries

### Trusted for execution

- The local operating-system account.
- The selected MCP client and model session.
- The official app-bundled Codex executable after signature verification.
- The official Computer Use client after signature verification.
- The reviewed CUA Relay release and its locked dependencies.

### Untrusted input

- Text and images displayed by target applications.
- Web pages, messages, documents, and accessibility metadata.
- Tool arguments proposed by a model.
- Unexpected output or protocol drift from a changed runtime.
- Paths, environment variables, and issue-report attachments supplied by users.

Visible content may contain prompt injection. A signed runtime proves software
origin, not the safety of the content being operated on.

## Full access

The isolated app-server context uses `approvalPolicy: "never"` and
`sandbox: "danger-full-access"`. CUA Relay exposes every official action and has
no relay-side safe mode, allowlist, or confirmation gate.

Client-side confirmations are independent. Keep them enabled, supervise early
runs, and do not enable Claude Code's permission bypass, Gemini CLI's `--trust`,
or Kimi Code CLI's YOLO/AFK modes merely to make setup easier.

Full access does not bypass:

- macOS Screen Recording, Accessibility, and TCC controls;
- administrator authentication or system privacy dialogs;
- target-app authentication and authorization;
- restrictions enforced by the official Computer Use runtime.

## Model isolation

CUA Relay does not use the Codex app-server as an agent. It creates an empty,
ephemeral thread only because the official direct MCP call requires a thread
identifier.

The private app-server environment:

- contains no user Codex authentication files;
- configures an unreachable loopback model endpoint;
- disables shell tools, plugins, remote control, memories, hooks, history,
  analytics, telemetry export, and web search;
- never calls `turn/start`;
- fails if any `turn/*` or `item/*` activity is observed.

This prevents the bridge from spending model tokens or sending a second model
request behind the invoking MCP client.

## Desktop-state integrity

An accessibility element index is meaningful only for the state that produced
it. CUA Relay therefore grants a short state lease:

- a successful `get_app_state(app)` creates the lease;
- only one action using the same normalized app selector may consume it;
- the lease expires after 120 seconds;
- a new state, `list_apps`, mismatch, error, cancellation, or shutdown closes it;
- all calls within that relay process are FIFO serialized.

This reduces stale-state and cross-app mistakes. It does not prove that the
model selected the correct element or that the user's intent is safe.

## Data handling

Computer Use inputs and outputs can contain:

- screenshots;
- visible accessibility text;
- application and window identity;
- element identifiers and coordinates;
- literal text and keys to be entered.

CUA Relay returns this data to the invoking MCP client and does not intentionally
persist it. The client may send it to its configured model provider. Users must
evaluate that provider's privacy, retention, and workspace policies.

The relay does not require model API keys or provider tokens. Do not pass them
through MCP environment configuration.

## Runtime and supply-chain checks

- Canonical paths prevent accepting a symlinked replacement.
- Strict code-signature checks require the expected OpenAI Team ID.
- Tool inventory and schema comparison detect runtime drift.
- Protocol line, result size, and content-block validation bound untrusted data.
- Temporary directories use private permissions and are removed after cleanup.
- Cleanup has one deadline and checks the process group, discovered descendants,
  and processes that still own the private working directory.
- Dependency versions and integrity hashes are locked for reproducible installs.

## User responsibilities

- Use a disposable test document or account during initial setup.
- Keep client-side tool confirmations enabled.
- Inspect fresh state before every action.
- Confirm recipient, destination, amount, selected account, and irreversible
  consequences before high-impact actions.
- Do not expose CUA Relay through a network transport or to an untrusted local
  user.
- Do not include private screenshots, accessibility trees, tokens, or paths in
  public issues.
- Stop the MCP client if the displayed UI differs from the agent's description.

## Non-goals

CUA Relay does not attempt to classify intent, recognize every destructive UI
operation, isolate the target app, provide a secure desktop, contain a malicious
signed runtime that deliberately escapes process ancestry, group, and working
directory checks, protect against a compromised client, or make autonomous
desktop use safe. For stronger isolation, use a separate macOS account or
disposable machine environment and keep valuable accounts signed out.
