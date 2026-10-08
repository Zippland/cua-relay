import assert from "node:assert/strict";
import test from "node:test";
import { inspectOfficialRuntime } from "../../src/codex/doctor.js";
import type { OfficialCodexBroker, verifyOfficialDirectBroker } from "../../src/codex/official-broker.js";
import { VERSION } from "../../src/constants.js";

function verification(broker: OfficialCodexBroker): ReturnType<typeof verifyOfficialDirectBroker> {
  return {
    brokerVersion: "codex-cli 0.162.0-alpha.2",
    broker,
    clientBuild: "1001",
    client: {
      appPath: "/offline-account/.codex/computer-use/Codex Computer Use.app",
      clientPath: "/offline-account/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
      layout: "installed-component",
    },
  };
}

for (const broker of [
  { brokerPath: "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex", layout: "nested-codex-cli" },
  { brokerPath: "/Applications/ChatGPT.app/Contents/Resources/codex", layout: "legacy-resource-binary" },
] satisfies OfficialCodexBroker[]) {
  test(`doctor JSON identifies the selected ${broker.layout} executable separately from the Computer Use layout`, () => {
    let verifications = 0;
    const report = inspectOfficialRuntime({
      platform: "darwin",
      verify: () => {
        verifications += 1;
        return verification(broker);
      },
    });
    const json = JSON.parse(JSON.stringify(report));
    assert.equal(json.codexPath, broker.brokerPath);
    assert.equal(json.codexLayout, broker.layout);
    assert.equal(json.codexVersion, "codex-cli 0.162.0-alpha.2");
    assert.equal(json.computerUseLayout, "installed-component");
    assert.equal(json.computerUseBuild, "1001");
    assert.equal(json.relayVersion, VERSION);
    assert.equal(json.permissions, "not-checked");
    assert.equal(json.ok, true);
    assert.equal(verifications, 1);
  });
}

test("doctor preserves a missing-layout diagnostic instead of reporting an unrelated signature failure", () => {
  assert.throws(() => inspectOfficialRuntime({
    platform: "darwin",
    verify: () => { throw new Error("Official Codex broker was not found in a supported location"); },
  }), /broker was not found in a supported location/);
});

test("doctor never returns OK when runtime signature verification fails", () => {
  assert.throws(() => inspectOfficialRuntime({
    platform: "darwin",
    verify: () => { throw new Error("Signature verification failed for codex"); },
  }), /Signature verification failed/);
});

test("doctor rejects an unsupported platform before invoking runtime verification", () => {
  let verifications = 0;
  assert.throws(() => inspectOfficialRuntime({
    platform: "linux",
    verify: () => {
      verifications += 1;
      return verification({ brokerPath: "/offline/codex", layout: "legacy-resource-binary" });
    },
  }), /official macOS Codex Computer Use runtime only/);
  assert.equal(verifications, 0);
});
