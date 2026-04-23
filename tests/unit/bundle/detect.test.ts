import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { detectBundleSource } from "../../../src/bundle/detect";

let tmpDir: string;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-detect-"));
  fs.mkdirSync(path.join(tmpDir, "a-dir"));
  fs.writeFileSync(path.join(tmpDir, "a-dir", "HELLO.TXT"), "hi");
  fs.writeFileSync(path.join(tmpDir, "a-bundle.zip"), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  fs.writeFileSync(path.join(tmpDir, "a-bundle.jsdos"), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("detectBundleSource", () => {
  it("detects a directory", () => {
    expect(detectBundleSource(path.join(tmpDir, "a-dir"))).toBe("directory");
  });
  it("detects a .zip by extension", () => {
    expect(detectBundleSource(path.join(tmpDir, "a-bundle.zip"))).toBe("zip");
  });
  it("detects a .jsdos by extension", () => {
    expect(detectBundleSource(path.join(tmpDir, "a-bundle.jsdos"))).toBe("jsdos");
  });
  it("throws on non-existent path", () => {
    expect(() => detectBundleSource("/nonexistent/path")).toThrow(/not found/i);
  });
  it("throws on unsupported extension", () => {
    const p = path.join(tmpDir, "a-bundle.tar");
    fs.writeFileSync(p, "");
    expect(() => detectBundleSource(p)).toThrow(/unsupported/i);
  });
});
