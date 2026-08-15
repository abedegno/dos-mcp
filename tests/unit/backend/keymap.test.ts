import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

// The DOM-to-guest key map lives inside the page HTML and so was never covered by
// a test. Issue #27 was filed against it on a guess that it mishandled extended
// keys; it does not, but nothing here would have contradicted the guess either.
//
// The expected values below are GLFW keycodes, written as literals on purpose.
// Asserting against the page's own KBD_down constant would be tautological and
// would still pass if the constant were renumbered. These are the values the
// emulator's KBD_KEYS enum uses (native/dosbox/include/keyboard.h), which is what
// travels over the wire to the worker.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(__dirname, "..", "..", "..", "src", "backend", "jsdos-page.html");

// Pull one `const <name> ... ;` declaration out of the page and return its source.
// Brace-aware so the object literal is captured whole rather than stopping at the
// first semicolon inside it.
function extractDeclaration(html: string, name: string): string {
  const start = html.indexOf(`const ${name}`);
  if (start < 0) throw new Error(`no 'const ${name}' declaration in jsdos-page.html`);
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === ";" && depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`'const ${name}' declaration is unterminated`);
}

function loadKeyMap(): Record<number, number> {
  const html = fs.readFileSync(PAGE, "utf8");
  const constants = extractDeclaration(html, "KBD_esc");
  const map = extractDeclaration(html, "domKeyToDosKeyCodes");
  const loaded = new Function(`${constants}\n${map}\nreturn domKeyToDosKeyCodes;`)();
  // extractDeclaration counts brackets and stops at a depth-zero semicolon. It is
  // not aware of strings or comments, so an added comment containing a brace could
  // truncate the object and leave a map that parses but is short. Fail here with the
  // reason, rather than letting a later assertion report a missing key and send the
  // reader looking at the map instead of at this scanner.
  const count = Object.keys(loaded).length;
  if (count < 50) {
    throw new Error(
      `extracted only ${count} key mappings from jsdos-page.html, so the declaration ` +
        `scanner mis-terminated rather than the map itself being wrong`,
    );
  }
  return loaded;
}

describe("jsdos-page DOM-to-guest key map", () => {
  it("maps the four arrow keys to their GLFW keycodes", () => {
    const map = loadKeyMap();
    expect(map[37]).toBe(263); // ArrowLeft  -> KBD_left
    expect(map[38]).toBe(265); // ArrowUp    -> KBD_up
    expect(map[39]).toBe(262); // ArrowRight -> KBD_right
    expect(map[40]).toBe(264); // ArrowDown  -> KBD_down
  });

  it("maps the keys used to drive DOS menus", () => {
    const map = loadKeyMap();
    expect(map[27]).toBe(256); // Escape -> KBD_esc
    expect(map[13]).toBe(257); // Enter  -> KBD_enter
    expect(map[36]).toBe(268); // Home   -> KBD_home
    expect(map[35]).toBe(269); // End    -> KBD_end
    expect(map[112]).toBe(290); // F1    -> KBD_f1
  });

  it("keeps the navigation keys distinct from one another", () => {
    // Not a whole-map uniqueness check: some DOM codes are legitimate aliases,
    // because browsers disagree on the legacy keyCode for punctuation. 59 and 186
    // are both ';' (Gecko and Chrome), and 173 and 189 are both '-'. What must
    // hold is that no navigation key collides with another, since that would send
    // the wrong key to the guest.
    const map = loadKeyMap();
    const navigation = [37, 38, 39, 40, 27, 13, 35, 36, 33, 34];
    const seen = new Map<number, number>();
    for (const domKey of navigation) {
      const dosKey = map[domKey];
      expect(dosKey, `DOM key ${domKey} is not mapped`).toBeGreaterThan(0);
      const previous = seen.get(dosKey);
      expect(previous, `DOM keys ${previous} and ${domKey} both map to ${dosKey}`).toBeUndefined();
      seen.set(dosKey, domKey);
    }
  });
});
