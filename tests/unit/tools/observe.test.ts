import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeBackend } from "../../../src/backend/fake";
import { screenshotTool, getStatusTool } from "../../../src/tools/observe";

describe("observe tools", () => {
  let be: FakeBackend;
  beforeEach(async () => {
    be = new FakeBackend();
    await be.loadBundle({ source: "/tmp/fake" });
  });

  it("screenshot returns base64 bytes and mime", async () => {
    const r: any = await screenshotTool.handler(be, {});
    expect(typeof r.image_base64).toBe("string");
    expect(r.image_base64.length).toBeGreaterThan(0);
    expect(r.mime).toBe("image/png");
  });

  it("screenshot writes to host_path when set and omits base64", async () => {
    const out = join(tmpdir(), `dos-mcp-screenshot-test-${Date.now()}.png`);
    try {
      const r: any = await screenshotTool.handler(be, { host_path: out });
      expect(r.path).toBe(out);
      expect(r.image_base64).toBeUndefined();
      expect(r.bytes).toBeGreaterThan(0);
      expect(existsSync(out)).toBe(true);
      expect(readFileSync(out).length).toBe(r.bytes);
    } finally {
      if (existsSync(out)) unlinkSync(out);
    }
  });

  it("get_status before shutdown reports running true", async () => {
    const r: any = await getStatusTool.handler(be, {});
    expect(r.running).toBe(true);
  });

  it("get_status after shutdown reports running false", async () => {
    await be.shutdown();
    const r: any = await getStatusTool.handler(be, {});
    expect(r.running).toBe(false);
  });
});
