import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { tools } from "../../../src/tools/index";

// The README drifted behind the tool registry twice without anything noticing:
// move_mouse_relative and click_at_cursor were added in #30 and click_at_cursor was
// then referenced by an example while never appearing in the tool tables, fs_stat was
// added and never documented at all, and the tool count sat at 16 while 19 were
// registered. A wrong tool list is worse than a short one, because the description an
// agent reads is how it decides what to call: #34 was exactly that, a documented
// syntax that did not exist.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const README = path.join(__dirname, "..", "..", "..", "README.md");

// Only the tool tables count. Searching the whole file would let a tool be "documented"
// by an incidental mention in the worked example, which is precisely what happened with
// click_at_cursor: the example used it while no table listed it.
function toolSection(readme: string): string {
  const start = readme.indexOf("## Tools");
  expect(start, "README has no '## Tools' section").toBeGreaterThan(-1);
  const after = readme.indexOf("\n## ", start + 1);
  return readme.slice(start, after === -1 ? undefined : after);
}

describe("README tool documentation", () => {
  it("documents every registered tool in the tool tables", () => {
    const section = toolSection(fs.readFileSync(README, "utf8"));
    // Matched as a table row starting with `name(, so prose inside the section does not
    // satisfy it either.
    const undocumented = tools
      .map(t => t.name)
      .filter(name => !new RegExp(`^\\|\\s*\`${name}\\(`, "m").test(section));
    expect(undocumented, `not in a README tool table: ${undocumented.join(", ")}`).toEqual([]);
  });

  it("states the number of tools that are actually registered", () => {
    const readme = fs.readFileSync(README, "utf8");
    const claimed = readme.match(/(\d+) tools/);
    expect(claimed, "README no longer states a tool count").not.toBeNull();
    expect(Number(claimed![1])).toBe(tools.length);
  });

  it("does not promise send_keys a token syntax it has never had", () => {
    // send_keys types literal text. The description used to advertise '{F5}{Enter}',
    // which typed those characters instead of pressing the keys, with no error. See
    // issue #34.
    const sendKeys = tools.find(t => t.name === "send_keys");
    expect(sendKeys, "send_keys is no longer registered").toBeDefined();
    expect(sendKeys!.description).not.toMatch(/\{(F\d+|Enter|Escape|Tab)\}/);
  });
});
