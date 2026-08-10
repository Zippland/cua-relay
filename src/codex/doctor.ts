import { verifyOfficialDirectBroker } from "./official-broker.js";
import { VERSION } from "../constants.js";

export interface DoctorReport {
  readonly ok: true;
  readonly relayVersion: string;
  readonly platform: "darwin";
  readonly codexVersion: string;
  readonly computerUseBuild: string;
  readonly computerUseLayout: "installed-component" | "legacy-plugin-bundle";
  readonly permissions: "not-checked";
}

export function inspectOfficialRuntime(): DoctorReport {
  if (process.platform !== "darwin") {
    throw new Error("CUA Relay currently supports the official macOS Codex Computer Use runtime only");
  }

  const verification = verifyOfficialDirectBroker();
  return {
    ok: true,
    relayVersion: VERSION,
    platform: "darwin",
    codexVersion: verification.brokerVersion,
    computerUseBuild: verification.clientBuild,
    computerUseLayout: verification.client.layout,
    permissions: "not-checked",
  };
}
