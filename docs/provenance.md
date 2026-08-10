# Source provenance

CUA Relay is an independent project with a narrow product boundary: standard
MCP compatibility for the locally installed official Codex Computer Use
runtime. It does not redistribute proprietary runtime components.

## MIT source baseline

Selected implementation work is adapted from:

| Field | Value |
| --- | --- |
| Project | `tmustier/codex-computer-use-mcp` |
| Repository | <https://github.com/tmustier/codex-computer-use-mcp> |
| Release | `v0.3.4` |
| Commit | `68eded579eaf5eea99c4d0e85f8bc3afa33e030d` |
| License | MIT |
| Original copyright | Copyright (c) 2026 Thomas Mustier |

The full upstream MIT text is preserved in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Adapted areas

| CUA Relay file | Upstream source area | Local responsibility |
| --- | --- | --- |
| `src/codex/official-broker.ts` | `src/direct-broker.ts`, `src/direct-service.ts`, and supporting runtime logic | Official-path and signature verification, isolated zero-turn app-server dispatch, bounded protocol handling, process cleanup. |
| `src/codex/tool-contract.ts` | `src/tools.ts` | Pinned 10-tool contract, validation, descriptions, annotations, and key normalization. |
| `src/mcp/elicitation.ts` | `src/mcp-elicitation.ts` | Forward supported MCP elicitation requests and cancel unsupported responses. |

Each adapted source file carries a provenance header. CUA Relay-specific MCP
normalization, client-neutral CLI, strict state lease, protocol tests, and
documentation are maintained in this repository.

## Update procedure

When reviewing a newer upstream release:

1. Record the new release and full commit SHA before copying any code.
2. Review the diff for changes to binary discovery, signature validation,
   app-server isolation, tool schemas, elicitation, and cleanup.
3. Port only behavior within CUA Relay's single official-backend scope.
4. Keep original copyright and MIT permission text for copied or substantially
   adapted portions.
5. Update file headers, this document, and third-party notices together.
6. Run unit, protocol, package, and supervised live compatibility checks.
7. Document any official runtime version constraint in the release notes.

Do not copy code from a repository without an explicit compatible license. An
idea, public interface, or observed behavior is not recorded as copied source;
substantial source adaptation is.

## Proprietary components

The following are discovered only from the user's existing installation and are
not part of this repository or npm package:

- ChatGPT and Codex application binaries;
- Codex app-server;
- Codex Computer Use application, service, client, and helper binaries.

Those components retain their own licensing and terms. CUA Relay's MIT license
does not apply to them.
