import type { Backend } from "../backend/index.js";
import type { ToolDef } from "./index.js";

export const sendKeysTool: ToolDef = {
  name: "send_keys",
  description:
    "Type literal text as keystrokes, one character at a time (e.g. 'DIR\\n'). There " +
    "is no token or escape syntax: every character is sent as itself, so a key name " +
    "wrapped in braces is typed as those characters instead of pressing that key. " +
    "'\\n' is Enter and '\\t' is Tab; use send_key_sequence for any other named key, " +
    "such as a function key or an arrow, and for a modifier combination.",
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

export const moveMouseRelativeTool: ToolDef = {
  name: "move_mouse_relative",
  description:
    "Move the mouse by a relative delta instead of to an absolute position. Prefer move_mouse unless the guest needs this. It is for games that track the cursor themselves from INT 33h relative deltas rather than reading the absolute position (Ultima Underworld does); for those, an absolute move is only ever seen as the delta it implies and so cannot place the cursor. A workable strategy is a large negative delta to clamp into a corner, then one delta to the target, then click_at_cursor so the position is not disturbed. Deltas are NOT guaranteed 1:1 with screen pixels, since the guest and DOSBox each apply their own sensitivity, and the corner strategy relies on the guest clamping, so verify against a screenshot rather than assuming. Avoid interleaving with move_mouse or send_click without deliberately re-establishing position: the absolute path moves the host pointer and this one does not, so the two notions of cursor position diverge.",
  inputSchema: {
    type: "object",
    required: ["dx", "dy"],
    properties: { dx: { type: "number" }, dy: { type: "number" } },
  },
  async handler(backend: Backend, args: unknown) {
    const a = args as { dx?: unknown; dy?: unknown };
    if (typeof a.dx !== "number" || typeof a.dy !== "number") {
      throw new Error("move_mouse_relative requires numeric 'dx' and 'dy'");
    }
    if (!Number.isFinite(a.dx) || !Number.isFinite(a.dy)) {
      throw new Error("move_mouse_relative requires finite 'dx' and 'dy'");
    }
    await backend.moveMouseRelative(a.dx, a.dy);
    return { ok: true };
  },
};

export const clickAtCursorTool: ToolDef = {
  name: "click_at_cursor",
  description:
    "Press and release a mouse button at the cursor's current position, without moving first. send_click moves to its coordinates before clicking, which discards a position established with move_mouse_relative. The button is held down for hold_ms (default 120) because the guest polls the mouse and can miss a press and release delivered in the same instant; raise it for a game that polls slowly.",
  inputSchema: {
    type: "object",
    properties: {
      button: { type: "string", enum: ["left", "right"] },
      hold_ms: { type: "number", minimum: 0 },
    },
  },
  async handler(backend: Backend, args: unknown) {
    const a = args as { button?: unknown; hold_ms?: unknown };
    // Validate rather than silently coercing anything unrecognised to "left".
    if (a.button !== undefined && a.button !== "left" && a.button !== "right") {
      throw new Error("click_at_cursor 'button' must be 'left' or 'right'");
    }
    const button = a.button === "right" ? "right" : "left";
    if (
      a.hold_ms !== undefined &&
      (typeof a.hold_ms !== "number" || !Number.isFinite(a.hold_ms) || a.hold_ms < 0)
    ) {
      throw new Error("click_at_cursor 'hold_ms' must be a finite number >= 0");
    }
    const holdMs = typeof a.hold_ms === "number" ? a.hold_ms : undefined;
    await backend.clickAtCursor(button, holdMs);
    return { ok: true };
  },
};
