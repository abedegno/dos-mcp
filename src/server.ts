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

async function main() {
  const config = parseArgs(process.argv.slice(2));

  let backend: Backend | undefined;
  const _ = config;
  void _;

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
    if (!backend) throw new Error("backend not initialised; call load_bundle first");
    const result = await tool.handler(backend, req.params.arguments ?? {});
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error("dos-mcp fatal:", err);
  process.exit(1);
});
