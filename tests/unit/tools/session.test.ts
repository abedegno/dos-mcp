import { describe, it, expect, beforeEach } from "vitest";
import { FakeBackend } from "../../../src/backend/fake";
import { loadBundleTool, shutdownTool, waitTool } from "../../../src/tools/session";

describe("session tools", () => {
  let be: FakeBackend;
  beforeEach(() => {
    be = new FakeBackend();
  });

  it("load_bundle returns session_id and status", async () => {
    const r = await loadBundleTool.handler(be, { source: "/tmp/fake" });
    expect(r).toMatchObject({ session_id: expect.any(String), status: "ready" });
  });

  it("load_bundle validates source is a string", async () => {
    await expect(loadBundleTool.handler(be, {})).rejects.toThrow(/source/);
  });

  it("shutdown succeeds after load", async () => {
    await loadBundleTool.handler(be, { source: "/tmp/fake" });
    const r = await shutdownTool.handler(be, {});
    expect(r).toEqual({ ok: true });
  });

  it("wait accepts ms number and returns ok", async () => {
    await loadBundleTool.handler(be, { source: "/tmp/fake" });
    const r = await waitTool.handler(be, { ms: 5 });
    expect(r).toEqual({ ok: true });
  });

  it("wait rejects negative ms", async () => {
    await loadBundleTool.handler(be, { source: "/tmp/fake" });
    await expect(waitTool.handler(be, { ms: -1 })).rejects.toThrow(/ms/);
  });
});
