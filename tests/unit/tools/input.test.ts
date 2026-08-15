import { describe, it, expect, beforeEach } from "vitest";
import { FakeBackend } from "../../../src/backend/fake";
import {
  sendKeysTool,
  sendKeySequenceTool,
  sendClickTool,
  moveMouseTool,
  moveMouseRelativeTool,
  clickAtCursorTool,
} from "../../../src/tools/input";

describe("input tools", () => {
  let be: FakeBackend;
  beforeEach(async () => {
    be = new FakeBackend();
    await be.loadBundle({ source: "/tmp/fake" });
  });

  it("send_keys records the text", async () => {
    await sendKeysTool.handler(be, { text: "hello" });
    expect(be.recordedKeys).toContain("hello");
  });

  it("send_keys requires text", async () => {
    await expect(sendKeysTool.handler(be, {})).rejects.toThrow(/text/);
  });

  it("send_key_sequence records the list", async () => {
    await sendKeySequenceTool.handler(be, { keys: ["Enter", "F5"] });
    expect(be.recordedKeySequences).toEqual([["Enter", "F5"]]);
  });

  it("send_click records coords and default button", async () => {
    await sendClickTool.handler(be, { x: 10, y: 20 });
    expect(be.recordedClicks).toEqual([{ x: 10, y: 20, button: "left" }]);
  });

  it("send_click respects button arg", async () => {
    await sendClickTool.handler(be, { x: 5, y: 6, button: "right" });
    expect(be.recordedClicks).toContainEqual({ x: 5, y: 6, button: "right" });
  });

  it("move_mouse records coords", async () => {
    await moveMouseTool.handler(be, { x: 100, y: 200 });
    expect(be.recordedMoves).toEqual([{ x: 100, y: 200 }]);
  });

  it("move_mouse_relative records the delta unchanged", async () => {
    await moveMouseRelativeTool.handler(be, { dx: -4000, dy: 322 });
    expect(be.recordedRelativeMoves).toEqual([{ dx: -4000, dy: 322 }]);
  });

  it("move_mouse_relative rejects non-numeric and non-finite deltas", async () => {
    await expect(moveMouseRelativeTool.handler(be, { dx: "1", dy: 0 })).rejects.toThrow();
    await expect(moveMouseRelativeTool.handler(be, { dx: NaN, dy: 0 })).rejects.toThrow();
    await expect(
      moveMouseRelativeTool.handler(be, { dx: Infinity, dy: 0 })
    ).rejects.toThrow();
    expect(be.recordedRelativeMoves).toEqual([]);
  });

  it("click_at_cursor defaults to left button and the default hold", async () => {
    await clickAtCursorTool.handler(be, {});
    expect(be.recordedCursorClicks).toEqual([{ button: "left", holdMs: 120 }]);
  });

  it("click_at_cursor honours an explicit button and hold", async () => {
    await clickAtCursorTool.handler(be, { button: "right", hold_ms: 400 });
    expect(be.recordedCursorClicks).toEqual([{ button: "right", holdMs: 400 }]);
  });

  it("click_at_cursor rejects an unknown button rather than coercing to left", async () => {
    await expect(clickAtCursorTool.handler(be, { button: "middle" })).rejects.toThrow();
    expect(be.recordedCursorClicks).toEqual([]);
  });

  it("click_at_cursor rejects a non-finite or negative hold", async () => {
    await expect(clickAtCursorTool.handler(be, { hold_ms: NaN })).rejects.toThrow();
    await expect(clickAtCursorTool.handler(be, { hold_ms: -1 })).rejects.toThrow();
    expect(be.recordedCursorClicks).toEqual([]);
  });
});
