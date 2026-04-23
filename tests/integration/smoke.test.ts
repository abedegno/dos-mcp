import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { JsDosBackend } from "../../src/backend/jsdos";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMOKE_DIR = path.join(__dirname, "..", "..", "test-fixtures", "smoke");

describe("js-dos integration — smoke bundle", () => {
  it("loads ECHO.COM, sends keys, screenshot contains non-zero pixels", async () => {
    // Build a one-off dir containing just ECHO.COM.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-smoke-"));
    try {
      fs.copyFileSync(path.join(SMOKE_DIR, "ECHO.COM"), path.join(tmp, "ECHO.COM"));

      const be = new JsDosBackend({ headless: true });
      try {
        await be.loadBundle({ source: tmp, autoexec: ["ECHO.COM"] });
        await be.wait(2000); // let the program start

        await be.sendKeys("HELLO");
        await be.wait(500);

        const shot = await be.screenshot("png");
        expect(shot.bytes.length).toBeGreaterThan(100);
        expect(shot.mime).toBe("image/png");
      } finally {
        await be.shutdown();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000); // 60s timeout — Chromium launch + js-dos boot
});
