import { describe, it, expect, beforeEach } from "vitest";
import { FakeBackend } from "../../../src/backend/fake";
import { readMemoryTool, searchMemoryTool } from "../../../src/tools/memory";

describe("memory tools", () => {
  let be: FakeBackend;

  beforeEach(async () => {
    be = new FakeBackend();
    await be.loadBundle({ source: "/tmp/fake" });
    be.pokeMemory(0x41e, Buffer.from("ZQXJWKV", "ascii"));
    be.pokeMemory(0x5f2b0, Buffer.from([0x63, 0x00, 0x30, 0x00, 0x50, 0x00]));
  });

  it("read_memory returns the bytes at a physical address", async () => {
    const r: any = await readMemoryTool.handler(be, { address: 0x41e, length: 7 });
    expect(Buffer.from(r.bytes_base64, "base64").toString("ascii")).toBe("ZQXJWKV");
    expect(r.address).toBe(0x41e);
    expect(r.length).toBe(7);
  });

  it("read_memory accepts segment:offset and converts to physical", async () => {
    // 0x5c99:0x2920 -> 0x5c990 + 0x2920 = 0x5f2b0
    const r: any = await readMemoryTool.handler(be, { segment: 0x5c99, offset: 0x2920, length: 6 });
    expect(r.address).toBe(0x5f2b0);
    expect(Buffer.from(r.bytes_base64, "base64")).toEqual(
      Buffer.from([0x63, 0x00, 0x30, 0x00, 0x50, 0x00])
    );
  });

  it("read_memory rejects a missing address", async () => {
    await expect(readMemoryTool.handler(be, { length: 4 })).rejects.toThrow(/address|segment/i);
  });

  it("read_memory rejects a length past the cap", async () => {
    await expect(
      readMemoryTool.handler(be, { address: 0, length: 2 * 1024 * 1024 })
    ).rejects.toThrow(/length/i);
  });

  it("read_memory rejects a negative address", async () => {
    await expect(readMemoryTool.handler(be, { address: -1, length: 4 })).rejects.toThrow(/address/i);
  });

  it("read_memory errors rather than truncating past the end of memory", async () => {
    await expect(
      readMemoryTool.handler(be, { address: be.memorySize - 2, length: 16 })
    ).rejects.toThrow(/range|end|beyond/i);
  });

  it("search_memory finds a known pattern and reports its address", async () => {
    const r: any = await searchMemoryTool.handler(be, {
      pattern_base64: Buffer.from("ZQXJWKV", "ascii").toString("base64"),
    });
    expect(r.hits).toContain(0x41e);
    expect(r.hit_count).toBeGreaterThan(0);
    expect(r.scanned_bytes).toBeGreaterThan(0);
  });

  it("search_memory honours max_hits", async () => {
    be.pokeMemory(0x1000, Buffer.from([0xaa, 0xbb]));
    be.pokeMemory(0x2000, Buffer.from([0xaa, 0xbb]));
    be.pokeMemory(0x3000, Buffer.from([0xaa, 0xbb]));
    const r: any = await searchMemoryTool.handler(be, {
      pattern_base64: Buffer.from([0xaa, 0xbb]).toString("base64"),
      max_hits: 2,
    });
    expect(r.hits.length).toBe(2);
  });

  it("search_memory honours a start/end window", async () => {
    be.pokeMemory(0x1000, Buffer.from([0xcc, 0xdd]));
    be.pokeMemory(0x9000, Buffer.from([0xcc, 0xdd]));
    const r: any = await searchMemoryTool.handler(be, {
      pattern_base64: Buffer.from([0xcc, 0xdd]).toString("base64"),
      start: 0x8000,
      end: 0xa000,
    });
    expect(r.hits).toEqual([0x9000]);
  });

  it("search_memory returns no hits for an absent pattern", async () => {
    const r: any = await searchMemoryTool.handler(be, {
      pattern_base64: Buffer.from("NOTPRESENT-ZZZ", "ascii").toString("base64"),
    });
    expect(r.hits).toEqual([]);
    expect(r.hit_count).toBe(0);
  });

  it("search_memory rejects an empty pattern", async () => {
    await expect(searchMemoryTool.handler(be, { pattern_base64: "" })).rejects.toThrow(/pattern/i);
  });
});
