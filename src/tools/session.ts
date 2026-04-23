import type { Backend } from "../backend";
import type { ToolDef } from "./index";

export const loadBundleTool: ToolDef = {
  name: "load_bundle",
  description: "Load a DOS bundle (directory, .zip, or .jsdos) and optionally autoexec commands.",
  inputSchema: {
    type: "object",
    required: ["source"],
    properties: {
      source: { type: "string", description: "Path to directory, .zip, or .jsdos" },
      autoexec: { type: "array", items: { type: "string" } },
      mirror: {
        type: "array",
        items: {
          type: "object",
          required: ["host", "dos"],
          properties: {
            host: { type: "string" },
            dos: { type: "string" },
          },
        },
      },
    },
  },
  async handler(backend: Backend, args: unknown) {
    const a = args as { source?: unknown; autoexec?: unknown; mirror?: unknown };
    if (typeof a.source !== "string") throw new Error("load_bundle requires 'source' (string)");
    const result = await backend.loadBundle({
      source: a.source,
      autoexec: Array.isArray(a.autoexec) ? (a.autoexec as string[]) : undefined,
      mirror: Array.isArray(a.mirror) ? (a.mirror as { host: string; dos: string }[]) : undefined,
    });
    return { session_id: result.sessionId, status: result.status };
  },
};

export const shutdownTool: ToolDef = {
  name: "shutdown",
  description: "Tear down the emulator.",
  inputSchema: { type: "object", properties: {} },
  async handler(backend: Backend, _args: unknown) {
    await backend.shutdown();
    return { ok: true };
  },
};

export const waitTool: ToolDef = {
  name: "wait",
  description: "Let the emulator tick for a number of milliseconds.",
  inputSchema: {
    type: "object",
    required: ["ms"],
    properties: { ms: { type: "number", minimum: 0 } },
  },
  async handler(backend: Backend, args: unknown) {
    const a = args as { ms?: unknown };
    if (typeof a.ms !== "number" || a.ms < 0) {
      throw new Error("wait requires 'ms' >= 0");
    }
    await backend.wait(a.ms);
    return { ok: true };
  },
};
