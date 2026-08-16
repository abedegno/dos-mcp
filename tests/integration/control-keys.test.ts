import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { JsDosBackend } from "../../src/backend/jsdos";

// send_keys("\t") did nothing at all. Puppeteer's key table maps '\n' and '\r' to
// Enter but has no entry for '\t', so it fell through to insertText, which the page's
// keydown bridge never sees. Found while correcting the tool description in #34,
// which had claimed a token syntax that does not exist.
//
// Tab is observed through DOSBox's shell filename completion, because that leaves a
// result in the filesystem. Typing a literal tab at the prompt is not an option: the
// shell consumes it as a completion request rather than inserting it, so there is no
// echoed character to look for.
describe("js-dos integration — control characters", () => {
  it("sends a tab, which the DOS shell uses to complete a name", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-tab-"));
    try {
      const be = new JsDosBackend({ headless: true });
      try {
        await be.loadBundle({ source: tmp });
        await be.wait(2000); // reach the C:\> prompt

        // A directory whose name no prefix but ABC can complete to.
        await be.sendKeys("MD ABCDEFGH\n");
        await be.wait(700);

        // If the tab arrives, the shell completes ABC to ABCDEFGH and the CD
        // succeeds. If it is dropped, the line reads "CD ABC", which does not exist,
        // and the shell stays in the root.
        await be.sendKeys("CD ABC\t\n");
        await be.wait(900);

        // Prove where the shell ended up by creating a directory and seeing which
        // parent holds it. Reading the filesystem avoids judging a screenshot.
        await be.sendKeys("MD INSIDE\n");
        await be.wait(900);

        const inTarget = (await be.fsList("C:/ABCDEFGH")).map(e => e.name.toUpperCase());
        const inRoot = (await be.fsList("C:/")).map(e => e.name.toUpperCase());
        expect(inTarget).toContain("INSIDE");
        expect(inRoot).not.toContain("INSIDE");
      } finally {
        await be.shutdown();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000); // Chromium launch + js-dos boot

  it("sends a backspace, which the DOS shell uses to erase", async () => {
    // Typed name is one character too long; the backspace removes it. If the
    // backspace were dropped the shell would create WRONGNAM, which is a legal 8.3
    // name, so both outcomes exist and the two assertions distinguish them.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-bs-"));
    try {
      const be = new JsDosBackend({ headless: true });
      try {
        await be.loadBundle({ source: tmp });
        await be.wait(2000);

        await be.sendKeys("MD WRONGNAM\b\n");
        await be.wait(900);

        const names = (await be.fsList("C:/")).map(e => e.name.toUpperCase());
        expect(names).toContain("WRONGNA");
        expect(names).not.toContain("WRONGNAM");
      } finally {
        await be.shutdown();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000);

  it("refuses a character it cannot deliver, instead of dropping it", async () => {
    // The whole string is checked before anything is typed, so a rejected call must
    // leave the prompt untouched rather than half a command sitting on it.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-reject-"));
    try {
      const be = new JsDosBackend({ headless: true });
      try {
        await be.loadBundle({ source: tmp });
        await be.wait(2000);

        await expect(be.sendKeys("MD CAF\u00c9\n")).rejects.toThrow(/cannot type/);
        await be.wait(400);

        // Nothing typed, so submitting now runs only what follows.
        await be.sendKeys("MD CLEAN\n");
        await be.wait(900);

        const names = (await be.fsList("C:/")).map(e => e.name.toUpperCase());
        expect(names).toContain("CLEAN");
        expect(names.some(n => n.startsWith("MD"))).toBe(false);
      } finally {
        await be.shutdown();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000);

  it("sends a newline as Enter", async () => {
    // Covered incidentally by every other test that ends a command with a newline, but
    // asserted here so the pair '\n' and '\t' is stated in one place.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-newline-"));
    try {
      const be = new JsDosBackend({ headless: true });
      try {
        await be.loadBundle({ source: tmp });
        await be.wait(2000);

        await be.sendKeys("MD ENTEROK\n");
        await be.wait(900);

        const names = (await be.fsList("C:/")).map(e => e.name.toUpperCase());
        expect(names).toContain("ENTEROK"); // the command was submitted
      } finally {
        await be.shutdown();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000);
});
