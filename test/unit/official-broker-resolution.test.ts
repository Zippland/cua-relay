import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveOfficialCodexBroker, verifyOfficialDirectBroker } from "../../src/codex/official-broker.js";

const CURRENT_RELATIVE_PATH = path.join("codex-cli", "CodexCLI.app", "Contents", "MacOS", "codex");

async function fixture(): Promise<{ root: string; resourcesRoot: string; userHome: string }> {
	const root = realpathSync(await mkdtemp(path.join(os.tmpdir(), "broker-resolution.")));
	return { root, resourcesRoot: path.join(root, "ChatGPT.app", "Contents", "Resources"), userHome: path.join(root, "account") };
}

async function file(filePath: string): Promise<string> {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, "offline fixture; never executed");
	return filePath;
}

function commands(options: { verifyStatus?: number; team?: string; version?: string } = {}) {
	const calls: Array<{ command: string; args: string[] }> = [];
	const runSync = (command: string, args: string[]) => {
		calls.push({ command, args });
		if (command === "/usr/bin/codesign" && args[0] === "--verify") return { status: options.verifyStatus ?? 0 };
		if (command === "/usr/bin/codesign" && args[0] === "-dv") return { status: 0, stderr: `TeamIdentifier=${options.team ?? "2DC432GLL2"}\n` };
		if (args[0] === "--version") return { status: 0, stdout: options.version ?? "codex-cli 0.162.0-alpha.2\n" };
		if (command === "/usr/bin/plutil") return { status: 0, stdout: "1001\n" };
		throw new Error(`Unexpected offline command: ${command}`);
	};
	return { calls, runSync };
}

test("reviewed nested CodexCLI executable is preferred when both signed layouts exist", async () => {
	const { root, resourcesRoot } = await fixture();
	try {
		const current = await file(path.join(resourcesRoot, CURRENT_RELATIVE_PATH));
		await file(path.join(resourcesRoot, "codex"));
		const runner = commands();
		assert.deepEqual(resolveOfficialCodexBroker({ resourcesRoot, runSync: runner.runSync }), {
			brokerPath: current, layout: "nested-codex-cli",
		});
		assert.deepEqual(runner.calls, [
			{ command: "/usr/bin/codesign", args: ["--verify", "--strict", current] },
			{ command: "/usr/bin/codesign", args: ["-dv", "--verbose=2", current] },
		]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("legacy signed resource executable remains supported when the nested layout is absent", async () => {
	const { root, resourcesRoot } = await fixture();
	try {
		const legacy = await file(path.join(resourcesRoot, "codex"));
		const runner = commands();
		assert.deepEqual(resolveOfficialCodexBroker({ resourcesRoot, runSync: runner.runSync }), {
			brokerPath: legacy, layout: "legacy-resource-binary",
		});
		assert.ok(runner.calls.every((call) => call.args.at(-1) === legacy));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("unsigned bin wrapper is never a broker candidate and missing diagnostics name reviewed paths", async () => {
	const { root, resourcesRoot } = await fixture();
	try {
		const wrapper = await file(path.join(resourcesRoot, "codex-cli", "bin", "codex"));
		const runner = commands();
		assert.throws(() => resolveOfficialCodexBroker({ resourcesRoot, runSync: runner.runSync }), (error: Error) => {
			assert.match(error.message, /Official Codex broker was not found in a supported location/);
			assert.ok(error.message.includes(path.join(resourcesRoot, CURRENT_RELATIVE_PATH)));
			assert.ok(error.message.includes(path.join(resourcesRoot, "codex")));
			assert.ok(!error.message.includes(wrapper));
			return true;
		});
		assert.deepEqual(runner.calls, []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("a nested candidate failing strict signature verification does not fall back to another executable", async () => {
	const { root, resourcesRoot } = await fixture();
	try {
		const current = await file(path.join(resourcesRoot, CURRENT_RELATIVE_PATH));
		await file(path.join(resourcesRoot, "codex"));
		const runner = commands({ verifyStatus: 1 });
		assert.throws(() => resolveOfficialCodexBroker({ resourcesRoot, runSync: runner.runSync }), /Signature verification failed/);
		assert.deepEqual(runner.calls, [{ command: "/usr/bin/codesign", args: ["--verify", "--strict", current] }]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("a signed executable with a different Team ID is rejected without fallback", async () => {
	const { root, resourcesRoot } = await fixture();
	try {
		const current = await file(path.join(resourcesRoot, CURRENT_RELATIVE_PATH));
		await file(path.join(resourcesRoot, "codex"));
		const runner = commands({ team: "UNTRUSTED" });
		assert.throws(() => resolveOfficialCodexBroker({ resourcesRoot, runSync: runner.runSync }), /expected OpenAI team/);
		assert.ok(runner.calls.every((call) => call.args.at(-1) === current));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("a symlinked executable outside the reviewed path is rejected before any signature command", async () => {
	const { root, resourcesRoot } = await fixture();
	try {
		const candidate = path.join(resourcesRoot, CURRENT_RELATIVE_PATH);
		const outside = await file(path.join(root, "outside", "codex"));
		await mkdir(path.dirname(candidate), { recursive: true });
		await symlink(outside, candidate);
		const runner = commands();
		assert.throws(() => resolveOfficialCodexBroker({ resourcesRoot, runSync: runner.runSync }), /was not canonical/);
		assert.deepEqual(runner.calls, []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("a dangling nested symlink is rejected without falling back to the legacy executable", async () => {
	const { root, resourcesRoot } = await fixture();
	try {
		const candidate = path.join(resourcesRoot, CURRENT_RELATIVE_PATH);
		await file(path.join(resourcesRoot, "codex"));
		await mkdir(path.dirname(candidate), { recursive: true });
		await symlink(path.join(root, "missing", "codex"), candidate);
		const runner = commands();
		assert.throws(() => resolveOfficialCodexBroker({ resourcesRoot, runSync: runner.runSync }), /Could not resolve the official Codex broker path/);
		assert.deepEqual(runner.calls, []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("a redirected resource root is rejected rather than accepted as an arbitrary signed-binary location", async () => {
	const { root, resourcesRoot } = await fixture();
	try {
		await file(path.join(resourcesRoot, CURRENT_RELATIVE_PATH));
		const redirected = path.join(root, "redirected-resources");
		await symlink(resourcesRoot, redirected);
		const runner = commands();
		assert.throws(() => resolveOfficialCodexBroker({ resourcesRoot: redirected, runSync: runner.runSync }), /was not canonical/);
		assert.deepEqual(runner.calls, []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("broker verification checks the version of the selected executable and returns that exact canonical path", async () => {
	const { root, resourcesRoot, userHome } = await fixture();
	try {
		const current = await file(path.join(resourcesRoot, CURRENT_RELATIVE_PATH));
		await file(path.join(resourcesRoot, "codex"));
		const client = await file(path.join(userHome, ".codex", "computer-use", "Codex Computer Use.app", "Contents", "SharedSupport", "SkyComputerUseClient.app", "Contents", "MacOS", "SkyComputerUseClient"));
		const runner = commands();
		const verification = verifyOfficialDirectBroker({ resourcesRoot, userHome, runSync: runner.runSync });
		assert.equal(verification.broker.brokerPath, current);
		assert.equal(verification.broker.layout, "nested-codex-cli");
		assert.equal(verification.brokerVersion, "codex-cli 0.162.0-alpha.2");
		assert.equal(verification.client.clientPath, client);
		assert.equal(verification.clientBuild, "1001");
		assert.deepEqual(runner.calls.filter((call) => call.args[0] === "--version"), [{ command: current, args: ["--version"] }]);
		assert.deepEqual(runner.calls.filter((call) => call.args[0] === "--verify").map((call) => call.args.at(-1)), [current, client]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("broker verification still rejects a selected executable without a valid codex-cli version", async () => {
	const { root, resourcesRoot, userHome } = await fixture();
	try {
		await file(path.join(resourcesRoot, CURRENT_RELATIVE_PATH));
		await file(path.join(userHome, ".codex", "computer-use", "Codex Computer Use.app", "Contents", "SharedSupport", "SkyComputerUseClient.app", "Contents", "MacOS", "SkyComputerUseClient"));
		const runner = commands({ version: "unknown executable" });
		assert.throws(() => verifyOfficialDirectBroker({ resourcesRoot, userHome, runSync: runner.runSync }), /app-bundled Codex app-server version/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
