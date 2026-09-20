import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { JsDosBackend } from "../../src/backend/jsdos";
import { readMemoryTool, searchMemoryTool } from "../../src/tools/memory";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMOKE_DIR = path.join(__dirname, "..", "..", "test-fixtures", "smoke");

/**
 * These assert against real DOS memory, not a mock.
 *
 * The BIOS data area is what memBase resolution keys on, so asserting on it
 * alone would be circular. The independent check is the keyboard buffer at
 * physical 0x41E: we choose the keys, so finding them there proves the address
 * mapping rather than just the fingerprint. BIOS stores two bytes per key,
 * ASCII then scan code, so the typed characters land on the even bytes.
 */
describe("js-dos integration — guest memory", () => {
  it("reads the BIOS data area and finds typed keys in the keyboard buffer", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-mem-"));
    fs.copyFileSync(path.join(SMOKE_DIR, "ECHO.COM"), path.join(tmp, "ECHO.COM"));
    const be = new JsDosBackend({ headless: true });
    try {
      await be.loadBundle({ source: tmp, autoexec: ["ECHO.COM"] });
      await be.wait(2500);
      const typed = "ZQXJWKV";
      await be.sendKeys(typed);
      await be.wait(800);

      // BDA video mode at 0x449 is 3 for 80x25 colour text.
      const mode: any = await readMemoryTool.handler(be, { address: 0x449, length: 1 });
      expect(Buffer.from(mode.bytes_base64, "base64")[0]).toBe(3);

      // Keyboard buffer: our own keys, at an address the fingerprint never touched.
      const kbd: any = await readMemoryTool.handler(be, { address: 0x41e, length: 32 });
      const raw = Buffer.from(kbd.bytes_base64, "base64");
      const ascii = Array.from(raw.filter((_, i) => i % 2 === 0))
        .map((b) => String.fromCharCode(b))
        .join("");
      expect(ascii).toContain(typed);

      // The same bytes must be findable by search, reported at the same address.
      const pattern = Buffer.from([0x5a, raw[1], 0x51, raw[3], 0x58]); // Z . Q . X
      const found: any = await searchMemoryTool.handler(be, {
        pattern_base64: pattern.toString("base64"),
        max_hits: 8,
      });
      expect(found.hits).toContain(0x41e);
      expect(found.scanned_bytes).toBeGreaterThan(0);

      // segment:offset must resolve to the same physical address.
      const viaSeg: any = await readMemoryTool.handler(be, {
        segment: 0x40,
        offset: 0x49,
        length: 1,
      });
      expect(viaSeg.address).toBe(0x449);
      expect(Buffer.from(viaSeg.bytes_base64, "base64")[0]).toBe(3);
    } finally {
      await be.shutdown();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 120000);
});
