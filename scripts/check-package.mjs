#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packed = spawnSync(
  "npm",
  ["pack", "--dry-run", "--json", "--silent"],
  {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_registry: "https://registry.npmjs.org/" },
  },
);

if (packed.status !== 0) {
  process.stderr.write(packed.stderr || packed.stdout || "npm pack failed\n");
  process.exit(1);
}

let manifest;
try {
  const reports = JSON.parse(packed.stdout);
  manifest = reports[0];
  if (!manifest || !Array.isArray(manifest.files)) throw new Error("missing file inventory");
} catch (error) {
  console.error(`Could not parse npm pack inventory: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const entries = new Map(manifest.files.map((entry) => [entry.path, entry]));
const failures = [];
const required = [
  packageJson.bin?.["cua-relay"],
  "claude-mcp.example.json",
  "docs/clients/claude-code.md",
  "README.md",
  "README.zh-CN.md",
].filter(Boolean);

for (const file of required) {
  if (!entries.has(file)) failures.push(`required package file is missing: ${file}`);
}

const executable = entries.get(packageJson.bin?.["cua-relay"]);
if (executable && (executable.mode & 0o111) === 0) {
  failures.push(`package binary is not executable: ${executable.path}`);
}

for (const file of entries.keys()) {
  if (/^(?:src|test|scripts|\.github)\//.test(file)) {
    failures.push(`development-only file leaked into package: ${file}`);
  }
}

const packagedPaths = new Set(entries.keys());
for (const file of packagedPaths) {
  if (!file.endsWith(".md")) continue;
  const markdown = await readFile(path.join(root, file), "utf8");
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget || /^(?:https?:|mailto:|#)/.test(rawTarget)) continue;
    const withoutTitle = rawTarget.split(/\s+["']/)[0] ?? rawTarget;
    const localTarget = decodeURIComponent(withoutTitle.split("#")[0] ?? "");
    if (!localTarget) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), localTarget));
    const exists = packagedPaths.has(resolved)
      || [...packagedPaths].some((candidate) => candidate.startsWith(`${resolved}/`));
    if (!exists) failures.push(`${file}: package-local link is missing: ${rawTarget}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Package check passed (${manifest.entryCount} files, ${manifest.size} bytes).`);
}
