#!/usr/bin/env node

import { chmod } from "node:fs/promises";
import path from "node:path";

const cli = path.resolve(import.meta.dirname, "../dist/src/cli.js");
await chmod(cli, 0o755);
