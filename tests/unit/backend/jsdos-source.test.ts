import { describe, it, expect } from "vitest";
import * as path from "node:path";
import {
  resolveJsDosSource,
  describeJsDosSource,
  emulatorsDistDir,
} from "../../../src/backend/jsdos";

// Which js-dos build gets loaded used to fall through to a CDN that served a moving
// /latest/ carrying none of our emulator patches. The failure looked like a game bug
// rather than a config mistake, which is what made it expensive. The emulator is now a
// pinned dependency, so there is exactly one default and no silent alternative.

const none = () => false;
const only =
  (...good: string[]) =>
  (dir: string) =>
    good.includes(dir);
const pkg = (dir: string | null) => () => dir;

describe("resolveJsDosSource", () => {
  it("uses DOSMCP_JSDOS_DIR when it points at a real dist", () => {
    const src = resolveJsDosSource({ DOSMCP_JSDOS_DIR: "/built" }, only("/built"), pkg(null));
    expect(src).toEqual({ dir: "/built", origin: "env" });
  });

  it("throws rather than quietly using the package when DOSMCP_JSDOS_DIR is wrong", () => {
    expect(() => resolveJsDosSource({ DOSMCP_JSDOS_DIR: "/nope" }, none, pkg("/pkg"))).toThrow(
      /DOSMCP_JSDOS_DIR/
    );
  });

  it("ignores an empty or whitespace DOSMCP_JSDOS_DIR instead of throwing", () => {
    const src = resolveJsDosSource({ DOSMCP_JSDOS_DIR: "  " }, only("/pkg"), pkg("/pkg"));
    expect(src).toEqual({ dir: "/pkg", origin: "package" });
  });

  it("uses the emulators package when the variable is unset", () => {
    const src = resolveJsDosSource({}, only("/pkg"), pkg("/pkg"));
    expect(src).toEqual({ dir: "/pkg", origin: "package" });
  });

  it("prefers the explicit variable over the package", () => {
    const src = resolveJsDosSource(
      { DOSMCP_JSDOS_DIR: "/built" },
      only("/built", "/pkg"),
      pkg("/pkg")
    );
    expect(src).toEqual({ dir: "/built", origin: "env" });
  });

  it("throws naming the package when it cannot be resolved at all", () => {
    expect(() => resolveJsDosSource({}, none, pkg(null))).toThrow(/emulators/);
  });

  it("throws when the package resolves but carries no emulators.js", () => {
    expect(() => resolveJsDosSource({}, none, pkg("/pkg"))).toThrow(/emulators/);
  });
});

describe("emulatorsDistDir", () => {
  it("derives dist from the package.json path so pnpm and yarn layouts work", () => {
    expect(emulatorsDistDir(() => "/n/emulators/package.json")).toBe(
      path.join("/n", "emulators", "dist")
    );
  });

  it("returns null when the package is not installed", () => {
    expect(
      emulatorsDistDir(() => {
        throw new Error("Cannot find module");
      })
    ).toBeNull();
  });
});

describe("describeJsDosSource", () => {
  it("names the directory and why it was chosen", () => {
    expect(describeJsDosSource({ dir: "/built", origin: "env" })).toContain("/built");
    expect(describeJsDosSource({ dir: "/built", origin: "env" })).toContain("DOSMCP_JSDOS_DIR");
    expect(describeJsDosSource({ dir: "/pkg", origin: "package" })).toContain("/pkg");
    expect(describeJsDosSource({ dir: "/pkg", origin: "package" })).toContain("emulators");
  });
});
