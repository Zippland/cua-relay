#!/usr/bin/env node

import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

async function markdownFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await markdownFiles(target)));
    else if (entry.isFile() && entry.name.endsWith(".md")) result.push(target);
  }
  return result;
}

const missing = [];
for (const file of await markdownFiles(root)) {
  const markdown = await readFile(file, "utf8");
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget || /^(?:https?:|mailto:|#)/.test(rawTarget)) continue;
    const withoutTitle = rawTarget.split(/\s+["']/)[0] ?? rawTarget;
    const localTarget = decodeURIComponent(withoutTitle.split("#")[0] ?? "");
    if (!localTarget) continue;
    const resolved = path.resolve(path.dirname(file), localTarget);
    try {
      await access(resolved);
    } catch {
      const line = markdown.slice(0, match.index).split("\n").length;
      missing.push(`${path.relative(root, file)}:${line}: ${rawTarget}`);
    }
  }
}

try {
  JSON.parse(await readFile(path.join(root, "claude-mcp.example.json"), "utf8"));
} catch (error) {
  missing.push(`claude-mcp.example.json: ${error instanceof Error ? error.message : String(error)}`);
}

if (missing.length > 0) {
  console.error(missing.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Documentation checks passed.");
}
