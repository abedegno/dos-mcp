import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { US_SHIFTED_BASE, shiftedBaseKey } from "../../../src/backend/jsdos";

// US_SHIFTED_BASE names, for each character needing Shift, the physical key that
// produces it. Getting an entry wrong is silent: the guest receives some other
// character, or nothing. Both happened. An earlier version of this table used
// single-character key names, where Puppeteer resolves '-' to NumpadSubtract and
// '/' to NumpadDivide, so '_' was dropped entirely and '?' arrived as '/'.
//
// Puppeteer's own layout annotates each main-row key with the shifted character it
// produces, e.g. Minus carries shiftKey: '_'. That is the same relationship this
// table encodes, in reverse, so it can be checked rather than trusted.
function puppeteerShiftedToCode(): Map<string, string> {
  const require = createRequire(import.meta.url);
  const root = path.dirname(require.resolve("puppeteer-core/package.json"));
  const candidates = [
    path.join(root, "lib", "esm", "puppeteer", "common", "USKeyboardLayout.js"),
    path.join(root, "lib", "cjs", "puppeteer", "common", "USKeyboardLayout.js"),
  ];
  const layoutPath = candidates.find(p => fs.existsSync(p));
  if (!layoutPath) {
    throw new Error(
      `USKeyboardLayout.js not found under ${root}. Puppeteer moved it; update the ` +
        `candidate paths here rather than deleting this check.`,
    );
  }

  const source = fs.readFileSync(layoutPath, "utf8");
  // Entries look like:
  //   Minus: { keyCode: 189, code: 'Minus', shiftKey: '_', key: '-' },
  const entry = /^\s*([A-Za-z][A-Za-z0-9]*):\s*\{[^}]*?shiftKey:\s*'((?:[^'\\]|\\.)+)'/gm;
  const shiftedToCode = new Map<string, string>();
  for (const match of source.matchAll(entry)) {
    const code = match[1];
    const shifted = match[2].replace(/\\(.)/g, "$1"); // unescape, e.g. \\ -> \
    // Keep the first: the code-named block is the authoritative one, and later
    // single-character aliases reuse the same shifted characters.
    if (!shiftedToCode.has(shifted)) shiftedToCode.set(shifted, code);
  }
  if (shiftedToCode.size < 20) {
    throw new Error(`parsed only ${shiftedToCode.size} shiftKey entries, so the regex is wrong`);
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
