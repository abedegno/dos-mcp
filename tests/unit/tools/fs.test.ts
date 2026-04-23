import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { FakeBackend } from "../../../src/backend/fake";
import {
  fsReadTool,
  fsWriteTool,
  fsListTool,
  fsDeleteTool,
  fsPushDirTool,
  fsPullDirTool,
  fsSyncTool,
} from "../../../src/tools/fs";

describe("fs tools", () => {
  let be: FakeBackend;
  let tmp: string;

  beforeEach(async () => {
    be = new FakeBackend();
    await be.loadBundle({ source: "/tmp/fake" });
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-fs-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("fs_write then fs_read round-trip", async () => {
    const src = Buffer.from([1, 2, 3]);
    await fsWriteTool.handler(be, { dos_path: "C:/X.DAT", bytes_base64: src.toString("base64") });
    const r: any = await fsReadTool.handler(be, { dos_path: "C:/X.DAT" });
    expect(Buffer.from(r.bytes_base64, "base64")).toEqual(src);
    expect(r.size).toBe(3);
  });

  it("fs_list returns written files", async () => {
    await fsWriteTool.handler(be, { dos_path: "C:/A.TXT", bytes_base64: Buffer.from("a").toString("base64") });
    await fsWriteTool.handler(be, { dos_path: "C:/B.TXT", bytes_base64: Buffer.from("bb").toString("base64") });
    const r: any = await fsListTool.handler(be, { dos_path: "C:/" });
    expect(r.map((e: any) => e.name).sort()).toEqual(["A.TXT", "B.TXT"]);
  });

  it("fs_delete removes a file", async () => {
    await fsWriteTool.handler(be, { dos_path: "C:/A.TXT", bytes_base64: Buffer.from("a").toString("base64") });
    await fsDeleteTool.handler(be, { dos_path: "C:/A.TXT" });
    await expect(fsReadTool.handler(be, { dos_path: "C:/A.TXT" })).rejects.toThrow();
  });

  it("fs_push_dir copies host dir into virtual DOS FS", async () => {
    fs.mkdirSync(path.join(tmp, "sub"));
    fs.writeFileSync(path.join(tmp, "top.txt"), "top");
    fs.writeFileSync(path.join(tmp, "sub", "nested.txt"), "nested");

    const r: any = await fsPushDirTool.handler(be, { host_path: tmp, dos_path: "C:/UP" });
    expect(r.file_count).toBe(2);
    expect(r.bytes_written).toBe(Buffer.from("top").length + Buffer.from("nested").length);

    const top = await fsReadTool.handler(be, { dos_path: "C:/UP/TOP.TXT" });
    expect(Buffer.from((top as any).bytes_base64, "base64").toString()).toBe("top");
  });

  it("fs_pull_dir copies virtual DOS FS subtree to host", async () => {
    await fsWriteTool.handler(be, { dos_path: "C:/OUT/X.DAT", bytes_base64: Buffer.from([9, 9]).toString("base64") });
    const r: any = await fsPullDirTool.handler(be, { dos_path: "C:/OUT", host_path: tmp });
    expect(r.file_count).toBe(1);
    expect(fs.readFileSync(path.join(tmp, "X.DAT"))).toEqual(Buffer.from([9, 9]));
  });

  it("fs_sync returns flushed count (zero for fake)", async () => {
    const r: any = await fsSyncTool.handler(be, {});
    expect(r.mirrors_flushed).toBe(0);
  });
});
