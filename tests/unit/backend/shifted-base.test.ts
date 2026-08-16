import { describe, it, expect } from "vitest";
import { _keyDefinitions } from "puppeteer-core";
import { US_SHIFTED_BASE, shiftedBaseKey } from "../../../src/backend/jsdos";

// US_SHIFTED_BASE names, for each character needing Shift, the physical key that
// produces it. Getting an entry wrong is silent: the guest receives some other
// character, or nothing. Both happened. An earlier version of this table used
// single-character key names, where Puppeteer resolves '-' to NumpadSubtract and
// '/' to NumpadDivide, so '_' was dropped entirely and '?' arrived as '/'.
//
// Puppeteer's own key table annotates each key with the shifted character it
// produces, e.g. Minus carries shiftKey: '_'. That is the relationship this table
// encodes, in reverse, so it can be checked rather than trusted.
//
// _keyDefinitions is imported rather than parsed out of Puppeteer's source on disk.
// An earlier version of this test read lib/esm/.../USKeyboardLayout.js, which broke
// on the 25.x bump: that release went ESM-only and replaced lib/esm and lib/cjs with
// lib/puppeteer, even though the definitions themselves were unchanged. The export
// is underscore-prefixed, so treat it as internal and fail loudly if it goes away,
// rather than quietly checking nothing.
function puppeteerShiftedToCode(): Map<string, string> {
  const definitions = _keyDefinitions as Record<
    string,
    { code?: string; shiftKey?: string } | undefined
  >;
  if (!definitions || typeof definitions !== "object") {
    throw new Error(
      "puppeteer-core no longer exports _keyDefinitions. Find where the key " +
        "definitions live now rather than deleting this check.",
    );
  }

  // Keep only entries naming a physical key, identified by the entry's own name
  // matching its code. Puppeteer also holds single-character aliases such as
  // '-' -> { code: 'NumpadSubtract' }, and those are exactly the keypad entries
  // that caused the original bug, so they must not be treated as the authority.
  const shiftedToCode = new Map<string, string>();
  for (const [name, definition] of Object.entries(definitions)) {
    if (!definition || definition.code !== name) continue;
    if (typeof definition.shiftKey !== "string") continue;
    shiftedToCode.set(definition.shiftKey, name);
  }
  if (shiftedToCode.size < 20) {
    throw new Error(
      `found only ${shiftedToCode.size} keys annotated with a shifted character, ` +
        `so the shape of _keyDefinitions changed`,
    );
  }
  return shiftedToCode;
}

describe("US_SHIFTED_BASE", () => {
  it("names the key Puppeteer says produces each shifted character", () => {
    const expected = puppeteerShiftedToCode();
    for (const [shifted, code] of Object.entries(US_SHIFTED_BASE)) {
      expect(expected.get(shifted), `no Puppeteer key produces '${shifted}'`).toBeDefined();
      expect(code, `'${shifted}' should come from ${expected.get(shifted)}, not ${code}`)
        .toBe(expected.get(shifted));
    }
  });

  it("covers every shifted character on a US layout", () => {
    // Spelled out rather than derived from the table, so a missing entry fails
    // instead of shrinking what the test checks.
    for (const ch of '~!@#$%^&*()_+{}|:"<>?') {
      expect(US_SHIFTED_BASE[ch], `'${ch}' has no entry`).toBeDefined();
    }
    expect(Object.keys(US_SHIFTED_BASE)).toHaveLength(21);
  });

  it("shifts ASCII uppercase and leaves everything else alone", () => {
    expect(shiftedBaseKey("A")).toBe("a");
    expect(shiftedBaseKey("Z")).toBe("z");
    expect(shiftedBaseKey("a")).toBeNull();
    expect(shiftedBaseKey("1")).toBeNull();
    expect(shiftedBaseKey(" ")).toBeNull();
    expect(shiftedBaseKey("-")).toBeNull();
    // Cased characters outside ASCII have no entry in Puppeteer's key table and
    // fall through to insertText, which the page's keydown bridge never sees.
    // Holding Shift around one would emit a stray Shift the guest cannot use.
    expect(shiftedBaseKey("İ")).toBeNull();
    expect(shiftedBaseKey("Ä")).toBeNull();
    expect(shiftedBaseKey("字")).toBeNull();
  });
});
