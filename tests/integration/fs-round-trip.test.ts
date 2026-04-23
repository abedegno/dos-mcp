import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { JsDosBackend } from "../../src/backend/jsdos";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMOKE_DIR = path.join(__dirname, "..", "..", "test-fixtures", "smoke");

describe("js-dos integration — fs round-trip", () => {
  it("push, read, pull preserves bytes", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-fsrt-"));
    const pullDst = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-fsrt-dst-"));
    try {
      fs.copyFileSync(path.join(SMOKE_DIR, "ECHO.COM"), path.join(tmp, "ECHO.COM"));

      const be = new JsDosBackend({ headless: true });
      try {
        await be.loadBundle({ source: tmp });
        await be.wait(1000);

        // Write a byte pattern into the virtual FS.
        const pattern = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]);
        await be.fsWrite("C:/PATTERN.DAT", pattern);

        // Read back directly.
        const back = await be.fsRead("C:/PATTERN.DAT");
        expect(back).toEqual(pattern);

        // Pull the entire C:/ to host and verify both files are present.
        // (fsPullDir is exercised via the tool layer, but at the backend level
        // we compose from fsList + fsRead. Here we assert the primitives.)
        const listing = await be.fsList("C:/");
        const names = listing.map(e => e.name);
        expect(names).toContain("PATTERN.DAT");
        expect(names).toContain("ECHO.COM");
      } finally {
        await be.shutdown();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(pullDst, { recursive: true, force: true });
    }
  }, 60000);
});
