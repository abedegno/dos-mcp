import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MirrorTracker } from "../../../src/mirror/mirror";

describe("MirrorTracker", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-mirror-")); });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("registers mirror specs and notes dirty writes by dos path", () => {
    const m = new MirrorTracker();
    m.addMirror({ host: tmp, dos: "C:/SAVE1" });
    m.markDirty("C:/SAVE1/DESC", Buffer.from("desc"));
    m.markDirty("C:/OUT/IGNORED", Buffer.from("no"));
    expect(m.pendingCount()).toBe(1);
  });

  it("flush writes dirty files into the mapped host dir", async () => {
    const m = new MirrorTracker();
    m.addMirror({ host: tmp, dos: "C:/SAVE1" });
    m.markDirty("C:/SAVE1/DESC", Buffer.from("desc"));
    // Mirror mode uses DOS-canonical (uppercased) paths on the host side too,
    // because normalizeDosPath uppercases "sub" -> "SUB" and that propagates.
    // On case-sensitive hosts (Linux CI) the host path must match exactly.
    m.markDirty("C:/SAVE1/sub/FILE.DAT", Buffer.from([9, 9, 9]));
    const count = await m.flush();
    expect(count).toBe(2);
    expect(fs.readFileSync(path.join(tmp, "DESC")).toString()).toBe("desc");
    expect(fs.readFileSync(path.join(tmp, "SUB", "FILE.DAT"))).toEqual(Buffer.from([9, 9, 9]));
    expect(m.pendingCount()).toBe(0);
  });

  it("flush is idempotent when nothing is dirty", async () => {
    const m = new MirrorTracker();
    m.addMirror({ host: tmp, dos: "C:/X" });
    expect(await m.flush()).toBe(0);
  });
});
