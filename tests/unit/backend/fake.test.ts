import { describe, it, expect } from "vitest";
import { FakeBackend } from "../../../src/backend/fake";

describe("FakeBackend", () => {
  it("loadBundle sets sessionId and status", async () => {
    const backend = new FakeBackend();
    const result = await backend.loadBundle({ source: "test.jsdos" });
    expect(result.sessionId).toBeTruthy();
    expect(result.status).toBe("ready");
  });

  it("getStatus returns running=false initially", async () => {
    const backend = new FakeBackend();
    const status = await backend.getStatus();
    expect(status.running).toBe(false);
    expect(status.dosTimeMs).toBe(0);
  });

  it("fsWrite and fsRead store/retrieve bytes", async () => {
    const backend = new FakeBackend();
    const data = Buffer.from([1, 2, 3, 4, 5]);
    await backend.fsWrite("C:/TEST/FILE.BIN", data);
    const read = await backend.fsRead("C:/TEST/FILE.BIN");
    expect(read).toEqual(data);
  });

  it("fsRead throws on missing file", async () => {
    const backend = new FakeBackend();
    await expect(backend.fsRead("C:/NONEXISTENT.BIN")).rejects.toThrow(/not found/i);
  });

  it("sendKeys records keystrokes", async () => {
    const backend = new FakeBackend();
    await backend.sendKeys("HELLO");
    expect(backend.recordedKeys).toEqual(["HELLO"]);
  });

  it("fsList returns files and directories with deduplication", async () => {
    const backend = new FakeBackend();
    await backend.fsWrite("C:/DATA/FILE1.TXT", Buffer.from("a"));
    await backend.fsWrite("C:/DATA/FILE2.TXT", Buffer.from("b"));
    await backend.fsWrite("C:/DATA/SUBDIR/FILE3.TXT", Buffer.from("c"));
    const entries = await backend.fsList("C:/DATA");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.name === "FILE1.TXT" && !e.isDir)).toBe(true);
    expect(entries.some((e) => e.name === "SUBDIR" && e.isDir)).toBe(true);
  });
});
