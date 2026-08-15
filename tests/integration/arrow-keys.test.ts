import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { JsDosBackend } from "../../src/backend/jsdos";

// Regression test for issue #27, which claimed arrow keys were not delivered to
// the guest while Escape and Enter were. They are delivered. The claim came from
// watching Ultima Underworld's main menu not react and inferring a transport
// failure from the absence of a visible change, which is not evidence: UW simply
// does not act on arrows there.
//
// Proving delivery needs a guest that demonstrably reacts to an arrow, so this
// uses DOSBox's own shell line editor (shell_misc.cpp handles 0x4B LEFT) and has
// the guest record its answer in the filesystem. Reading the result back, rather
// than diffing a screenshot, is what makes the outcome unambiguous.
//
// Left arrow is an extended key, so DOSBox emits 0xE0 0x4B for it. Sending several
// in a row also exercises the keyMatrix deduplication in Protocol.addKey(), which
// drops a press when the key is already marked down: a missed release would latch
// the arrow and silently swallow every press after the first.
describe("js-dos integration — arrow key delivery", () => {
  it("left arrow moves the DOS shell cursor, proving arrows reach the guest", async () => {
    // Make a directory whose name is missing one character, walk back over the
    // tail with the left arrow, and insert it. The number of presses and the
    // expected name are both derived from the strings, so a miscount cannot make
    // this pass. Either outcome stays within 8.3, so the wrong name is still
    // created rather than rejected, which keeps the two cases distinguishable.
    //
    // Deliberately no shifted character anywhere, so this tests arrow delivery
    // alone and does not depend on the separate shifted-character handling in #31.
    // DOS stores directory names uppercase whatever case is typed.
    const head = "MD AB";
    const tail = "DEFGH";
    const missing = "C";
    const expected = "ABCDEFGH"; // AB + C + DEFGH, if the arrows arrive
    const ifArrowsDropped = "ABDEFGHC"; // the character lands at the end instead

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-arrow-"));
    try {
      const be = new JsDosBackend({ headless: true });
      try {
        await be.loadBundle({ source: tmp });
        await be.wait(2000); // reach the C:\> prompt

        await be.sendKeys(head + tail);
        await be.sendKeySequence(new Array(tail.length).fill("ArrowLeft"));
        await be.sendKeys(missing);
        await be.sendKeys("\n");
        await be.wait(1000);

        const names = (await be.fsList("C:/")).map(e => e.name.toUpperCase());
        expect(names).toContain(expected);
        expect(names).not.toContain(ifArrowsDropped);
      } finally {
        await be.shutdown();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000); // Chromium launch + js-dos boot
});
