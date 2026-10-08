import { verifyOfficialDirectBroker, type OfficialCodexBroker } from "./official-broker.js";
import { VERSION } from "../constants.js";

export interface DoctorReport {
  readonly ok: true;
  readonly relayVersion: string;
  readonly platform: "darwin";
  readonly codexVersion: string;
  readonly codexPath: string;
  readonly codexLayout: OfficialCodexBroker["layout"];
  readonly computerUseBuild: string;
  readonly computerUseLayout: "installed-component" | "legacy-plugin-bundle";
  readonly permissions: "not-checked";
}

interface DoctorOptions {
  /** Test-only platform and verifier injection; the CLI does not accept overrides. */
  platform?: NodeJS.Platform;
  verify?: typeof verifyOfficialDirectBroker;
}

export function inspectOfficialRuntime(options: DoctorOptions = {}): DoctorReport {
  if ((options.platform ?? process.platform) !== "darwin") {
    throw new Error("CUA Relay currently supports the official macOS Codex Computer Use runtime only");
  }

  const verification = (options.verify ?? verifyOfficialDirectBroker)();
  return {
    ok: true,
    relayVersion: VERSION,
    platform: "darwin",
    codexVersion: verification.brokerVersion,
    codexPath: verification.broker.brokerPath,
    codexLayout: verification.broker.layout,
    computerUseBuild: verification.clientBuild,
    computerUseLayout: verification.client.layout,
    permissions: "not-checked",
  };
}
