import type { Backend } from "../backend/index.js";
import type { ToolDef } from "./index.js";

export const sendKeysTool: ToolDef = {
  name: "send_keys",
  description: "Inject a text sequence as keystrokes (e.g. 'hello\\n' or '{F5}{Enter}').",
  inputSchema: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string" },
      key_delay_ms: { type: "number", minimum: 0 },
    },
  },
  async handler(backend: Backend, args: unknown) {
    const a = args as { text?: unknown; key_delay_ms?: unknown };
    if (typeof a.text !== "string") throw new Error("send_keys requires 'text' (string)");
    const delay = typeof a.key_delay_ms === "number" ? a.key_delay_ms : undefined;
    await backend.sendKeys(a.text, delay);
    return { ok: true };
  },
};

export const sendKeySequenceTool: ToolDef = {
  name: "send_key_sequence",
  description: "Inject a named key sequence (e.g. ['Ctrl+F5', 'Escape', 'ArrowUp']).",
  inputSchema: {
    type: "object",
    required: ["keys"],
    properties: {
      keys: { type: "array", items: { type: "string" }, minItems: 1 },
    },
  },
  async handler(backend: Backend, args: unknown) {
    const a = args as { keys?: unknown };
    if (!Array.isArray(a.keys) || !a.keys.every(k => typeof k === "string")) {
      throw new Error("send_key_sequence requires 'keys' (string[])");
    }
    await backend.sendKeySequence(a.keys as string[]);
    return { ok: true };
  },
};

export const sendClickTool: ToolDef = {
  name: "send_click",
  description: "Click at canvas-relative coordinates.",
  inputSchema: {
    type: "object",
    required: ["x", "y"],
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      button: { type: "string", enum: ["left", "right"] },
    },
  },
  async handler(backend: Backend, args: unknown) {
    const a = args as { x?: unknown; y?: unknown; button?: unknown };
    if (typeof a.x !== "number" || typeof a.y !== "number") {
      throw new Error("send_click requires numeric 'x' and 'y'");
    }
    const button = a.button === "right" ? "right" : "left";
    await backend.sendClick(a.x, a.y, button);
    return { ok: true };
  },
};

export const moveMouseTool: ToolDef = {
  name: "move_mouse",
  description: "Move the mouse without clicking.",
  inputSchema: {
    type: "object",
    required: ["x", "y"],
    properties: { x: { type: "number" }, y: { type: "number" } },
  },
  async handler(backend: Backend, args: unknown) {
    const a = args as { x?: unknown; y?: unknown };
    if (typeof a.x !== "number" || typeof a.y !== "number") {
      throw new Error("move_mouse requires numeric 'x' and 'y'");
    }
    await backend.moveMouse(a.x, a.y);
    return { ok: true };
  },
};
