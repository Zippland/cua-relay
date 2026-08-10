import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createCuaRelayServer } from "../../src/mcp/server.js";
import { ComputerUseSessionExecutor } from "../../src/session/index.js";
import { FakeOfficialBackend } from "./fake-backend.js";

const executor = new ComputerUseSessionExecutor(new FakeOfficialBackend());
const { server } = createCuaRelayServer(executor);
await server.connect(new StdioServerTransport());
