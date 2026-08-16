import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { JsDosBackend } from "../../src/backend/jsdos";

// Regression test for issue #31: send_keys delivered the wrong key, or none, for
// characters needing Shift. Two distinct causes, both silent:
//
//   - Puppeteer gives a shifted character the same keyCode as its unshifted twin
//     without setting shiftKey, and the page bridge maps by keyCode alone, so '>'
//     arrived as '.' and ':' as ';'.
//   - Puppeteer resolves several single-character names to keypad keys: '+' is
//     NumpadAdd, which the page does not map at all, so '+' was dropped outright,
//     and '/' is NumpadDivide, so Shift+'/' produced '/' rather than '?'.
//
// Everything is asserted through the guest's filesystem rather than a screenshot.
// A screenshot cannot separate ':' from ';' at this resolution, and misreading
// exactly that pair is what hid the bug; a later screenshot then showed '?' as '/'
// and I nearly dismissed it as the same misreading, when it was a real second bug.
describe("js-dos integration — shifted characters", () => {
  it("delivers every shifted character a DOS filename can hold", async () => {
    // Names stay within 8.3. DOS uppercases them, so letter case is a separate
    // question, tested below.
    const directories = ["A!@#$%^", "B&()_{}", "C~D"];

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-shift-"));
    try {
      const be = new JsDosBackend({ headless: true });
      try {
        await be.loadBundle({ source: tmp });
        await be.wait(2000); // reach the C:\> prompt

        for (const name of directories) {
          await be.sendKeys(`MD ${name}\n`);
          await be.wait(700);
        }

        const names = (await be.fsList("C:/")).map(e => e.name.toUpperCase());
        for (const name of directories) {
          expect(names).toContain(name);
        }
      } finally {
        await be.shutdown();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000); // Chromium launch + js-dos boot

  it("delivers the characters DOS filenames cannot hold", async () => {
    // '*', '+' and '?' are illegal in a filename, so route them through ECHO. The
    // redirect doubles as the check for '>', ':' and '\': if any of those three were
    // wrong there would be no file to read at all.
    //
    // '<', '|' and '"' are left out. The first two are shell metacharacters and the
    // third opens a quoted string, which swallows the redirect. They are covered
    // instead by the table check in tests/unit/backend/shifted-base.test.ts.
    const payload = "x*y+z?w";

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-shift-echo-"));
    try {
      const be = new JsDosBackend({ headless: true });
      try {
        await be.loadBundle({ source: tmp });
        await be.wait(2000);

        await be.sendKeys(`ECHO ${payload} > C:\\T.TXT\n`);
        await be.wait(1200);

        const written = await be.fsRead("C:/T.TXT");
        expect(written.toString("ascii").trim()).toBe(payload);
      } finally {
        await be.shutdown();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000);

  it("leaves Shift unlatched, so the next character is unshifted", async () => {
    // Shift is held around one character at a time. If a release were missed the
    // guest would keep applying it, so type a shifted character followed by the
    // unshifted character on the same physical key: '!' then '1'.
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
