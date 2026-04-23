import { describe, it, expect, beforeEach } from "vitest";
import { FakeBackend } from "../../../src/backend/fake";
import {
  sendKeysTool,
  sendKeySequenceTool,
  sendClickTool,
  moveMouseTool,
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
});
