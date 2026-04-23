import type { Backend } from "../backend/index.js";
import type { ToolDef } from "./index.js";

export const screenshotTool: ToolDef = {
  name: "screenshot",
  description: "Capture the current emulator frame as an image (PNG by default).",
  inputSchema: {
    type: "object",
    properties: { format: { type: "string", enum: ["png", "jpeg"] } },
  },
  async handler(backend: Backend, args: unknown) {
    const a = args as { format?: unknown };
    const format = a.format === "jpeg" ? "jpeg" : "png";
    const shot = await backend.screenshot(format);
    return { image_base64: shot.bytes.toString("base64"), mime: shot.mime };
  },
};

export const getStatusTool: ToolDef = {
  name: "get_status",
  description: "Return runtime status (running, dos_time_ms, last_error).",
  inputSchema: { type: "object", properties: {} },
  async handler(backend: Backend, _args: unknown) {
    const s = await backend.getStatus();
    return {
      running: s.running,
      dos_time_ms: s.dosTimeMs,
      last_error: s.lastError,
    };
  },
};
