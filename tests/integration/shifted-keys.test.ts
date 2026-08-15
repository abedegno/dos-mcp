import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { JsDosBackend } from "../../src/backend/jsdos";

// Regression test for issue #31: send_keys delivered the unshifted key for any
// character needing Shift, so '>' arrived as '.' and ':' as ';'. Puppeteer gives a
// shifted character the same keyCode as its unshifted twin without setting
// shiftKey, and the page bridge maps by keyCode alone.
//
// Asserted through the guest's filesystem rather than a screenshot, because a
// screenshot cannot separate ':' from ';' reliably at this resolution. Misreading
// exactly that pair on a screenshot is what hid this bug in the first place.
describe("js-dos integration — shifted characters", () => {
  it("types a shifted character, not its unshifted twin", async () => {
    // '!' is Shift+1 and is legal in a DOS filename, so the directory name records
    // which key the guest actually received. DOS uppercases names, so this cannot
    // be confused with the separate question of letter case.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-shift-"));
    try {
      const be = new JsDosBackend({ headless: true });
      try {
        await be.loadBundle({ source: tmp });
        await be.wait(2000); // reach the C:\> prompt

        await be.sendKeys("MD A!B\n");
        await be.wait(1000);

        const names = (await be.fsList("C:/")).map(e => e.name.toUpperCase());
        expect(names).toContain("A!B");
        expect(names).not.toContain("A1B"); // what the unshifted '1' produced
      } finally {
        await be.shutdown();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000); // Chromium launch + js-dos boot

  it("leaves Shift unlatched, so the next character is unshifted", async () => {
    // The fix holds Shift around one character at a time. If a release were missed
    // the guest would keep applying Shift, so check a shifted character followed by
    // an unshifted one that shares its key: '!' then '1' on the same physical key.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-shift-latch-"));
    try {
      const be = new JsDosBackend({ headless: true });
      try {
        await be.loadBundle({ source: tmp });
        await be.wait(2000);

        await be.sendKeys("MD C!1D\n");
        await be.wait(1000);

        const names = (await be.fsList("C:/")).map(e => e.name.toUpperCase());
        expect(names).toContain("C!1D");
        expect(names).not.toContain("C!!D"); // Shift stayed down
      } finally {
        await be.shutdown();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000);
});
