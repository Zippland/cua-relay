#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([".git", "node_modules", "npm-packages"]);
const textExtensions = new Set([
  ".cjs", ".js", ".json", ".map", ".md", ".mjs", ".toml", ".ts", ".yaml", ".yml",
]);
const forbidden = [
  {
    label: "personal macOS absolute path",
    pattern: /\/Users\/(?!example(?:\/|\b)|your-name(?:\/|\b))[^/\s"']+/,
  },
  {
    label: "credential assignment",
    pattern: /(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|CLIENT_SECRET)\s*[=:]\s*["']?[A-Za-z0-9_./+-]{16,}/i,
  },
  {
    label: "private key material",
    pattern: /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
  },
  {
    label: "likely provider or GitHub token",
    pattern: /(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
  },
];

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesUnder(target)));
    else if (entry.isFile() && textExtensions.has(path.extname(entry.name))) result.push(target);
  }
  return result;
}

const findings = [];
for (const file of await filesUnder(root)) {
  if ((await stat(file)).size > 2 * 1024 * 1024) continue;
  const text = await readFile(file, "utf8");
  for (const rule of forbidden) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    const line = text.slice(0, match.index).split("\n").length;
    findings.push(`${path.relative(root, file)}:${line}: ${rule.label}`);
  }
}

try {
  const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
    if (typeof metadata?.resolved !== "string") continue;
    const host = new URL(metadata.resolved).hostname;
    if (host !== "registry.npmjs.org") {
      findings.push(`package-lock.json: non-public registry host for ${packagePath || "root"}`);
    }
  }
} catch (error) {
  findings.push(`package-lock.json: ${error instanceof Error ? error.message : String(error)}`);
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Privacy scan passed.");
}
