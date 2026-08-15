#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { parseArgs } from "./config.js";
import { tools } from "./tools/index.js";
import type { Backend } from "./backend/index.js";
import { JsDosBackend } from "./backend/jsdos.js";

async function main() {
  const config = parseArgs(process.argv.slice(2));

  let backend: Backend | undefined;

  const server = new Server(
    { name: "dos-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const tool = tools.find(t => t.name === name);
    if (!tool) throw new Error(`unknown tool: ${name}`);
    if (!backend) {
      if (name !== "load_bundle") {
        throw new Error("backend not initialised; call load_bundle first");
      }
      backend = new JsDosBackend({ headless: !config.attended });
    }
    const result = await tool.handler(backend, req.params.arguments ?? {});
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  // Tear the emulator down when the client goes away, rather than relying on it
  // to call shutdown. Each load_bundle launches a Puppeteer browser running a DOS
  // guest in a tight loop, so a leaked one burns a full core per renderer
  // indefinitely. A client crashing, being killed, or just exiting is normal.
  let cleaningUp = false;
  async function cleanup(reason: string, exitCode: number | null) {
    if (cleaningUp) return;
    cleaningUp = true;
    if (backend) {
      try {
        // Bound the wait: a wedged emulator must not stop us killing the browser.
        await Promise.race([
          backend.shutdown(),
          new Promise<void>((resolve) => setTimeout(resolve, 5000)),
        ]);
      } catch (err) {
        console.error(`dos-mcp cleanup (${reason}) failed:`, err);
      }
    }
    if (exitCode !== null) process.exit(exitCode);
  }

  // Use server.onclose, not transport.onclose: Protocol.connect() takes ownership
  // of the transport and overwrites any callbacks already set on it, so a handler
  // assigned to transport.onclose is silently replaced and never fires.
  server.onclose = () => void cleanup("server closed", 0);
  process.stdin.on("end", () => void cleanup("stdin closed", 0));
  process.stdin.on("close", () => void cleanup("stdin closed", 0));
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(sig, () => void cleanup(sig, 0));
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error("dos-mcp fatal:", err);
  process.exit(1);
});
