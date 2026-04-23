import { describe, it, expect, beforeEach } from "vitest";
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
