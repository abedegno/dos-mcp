import { describe, it, expect } from "vitest";
import { _keyDefinitions } from "puppeteer-core";
import {
  CONTROL_KEYS,
  US_SHIFTED_BASE,
  deliverableAsKeystroke,
  shiftedBaseKey,
} from "../../../src/backend/jsdos";

// send_keys types with Puppeteer's key table, which has no entry for a character no
// US keyboard produces. type() then falls through to insertText, and the page bridge
// only forwards keydown, so the guest receives nothing and no error is raised.
//
// deliverableAsKeystroke encodes the rule "printable ASCII, plus the control
// characters CONTROL_KEYS names a key for". That rule is only correct if Puppeteer
// really does define every printable ASCII character, which is checked here rather
// than assumed. The measurement that prompted it found '\b', '\x1b' and '\x7f' being
// dropped after '\t' had already been fixed, so one fix at a time was not converging.
const definitions = _keyDefinitions as Record<string, unknown>;

describe("keystroke coverage", () => {
  it("can deliver every printable ASCII character", () => {
    const undeliverable: string[] = [];
    for (let code = 0x20; code <= 0x7e; code++) {
      const ch = String.fromCharCode(code);
      if (!deliverableAsKeystroke(ch)) undeliverable.push(ch);
    }
    expect(undeliverable, `printable ASCII rejected: ${undeliverable.join("")}`).toEqual([]);
  });

  it("has a real key behind every printable ASCII character", () => {
    // The rule above is only sound while this holds. A printable character with
    // neither its own definition nor a shifted base would be accepted by the rule and
    // then silently dropped by Puppeteer, which is the failure being prevented.
    const unreachable: string[] = [];
    for (let code = 0x20; code <= 0x7e; code++) {
      const ch = String.fromCharCode(code);
      const base = shiftedBaseKey(ch);
      const reachable = base !== null ? base in definitions : ch in definitions;
      if (!reachable) unreachable.push(ch);
    }
    expect(
      unreachable,
      `no Puppeteer key definition for: ${unreachable.join("")}`,
    ).toEqual([]);
  });

  it("names a real key for each control character it claims", () => {
    for (const [ch, keyName] of Object.entries(CONTROL_KEYS)) {
      expect(keyName in definitions, `${keyName} is not a Puppeteer key`).toBe(true);
      expect(deliverableAsKeystroke(ch)).toBe(true);
    }
  });

  it("maps the control characters that have an obvious single key", () => {
    // Spelled out so removing one fails rather than shrinking what is covered. Each
    // was silently dropped before, and each corresponds to one key a DOS program
    // expects to be able to read.
    expect(CONTROL_KEYS["\b"]).toBe("Backspace");
    expect(CONTROL_KEYS["\t"]).toBe("Tab");
    expect(CONTROL_KEYS["\x1b"]).toBe("Escape");
    expect(CONTROL_KEYS["\x7f"]).toBe("Delete");
  });

  it("treats newline and carriage return as deliverable", () => {
    // Puppeteer defines both as Enter, so they need no CONTROL_KEYS entry.
    expect("\n" in definitions).toBe(true);
    expect("\r" in definitions).toBe(true);
    expect(deliverableAsKeystroke("\n")).toBe(true);
    expect(deliverableAsKeystroke("\r")).toBe(true);
  });

  it("refuses NUL, which Puppeteer would turn into a Delete keypress", () => {
    // The nastiest case, and not a dropped character at all. Puppeteer aliases '\0' to
    // NumpadDecimal, keyCode 46, which the page maps to KBD_delete, so send_keys("\0")
    // pressed Delete in the guest: silent, and destructive rather than merely lost.
    expect(deliverableAsKeystroke("\0")).toBe(false);
    // It must never gain a CONTROL_KEYS entry, since that would make it deliverable
    // again and reintroduce exactly this.
    expect(Object.hasOwn(CONTROL_KEYS, "\0")).toBe(false);
  });

  it("refuses a non-breaking space, which reads as a space but is not one", () => {
    expect(deliverableAsKeystroke("\u00a0")).toBe(false);
    expect(deliverableAsKeystroke(" ")).toBe(true); // an ordinary space is fine
  });

  it("refuses what it cannot deliver, rather than dropping it", () => {
    // Remaining C0 controls need a Ctrl combination, which send_key_sequence covers.
    for (const ch of ["\x00", "\x03", "\x1a", "\v", "\f", "\x01"]) {
      expect(deliverableAsKeystroke(ch), `${JSON.stringify(ch)} claimed`).toBe(false);
    }
    // No US key produces these, whatever the guest's code page shows for the byte.
    for (const ch of ["é", "ü", "£", "°", " ", "字", "☺"]) {
      expect(deliverableAsKeystroke(ch), `${JSON.stringify(ch)} claimed`).toBe(false);
    }
  });

  it("keeps the shifted table inside what it can deliver", () => {
    for (const ch of Object.keys(US_SHIFTED_BASE)) {
      expect(deliverableAsKeystroke(ch), `shifted ${ch} rejected`).toBe(true);
    }
  });
});
