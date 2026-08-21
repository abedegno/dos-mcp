import { describe, it, expect } from "vitest";
import {
  resolveJsDosSource,
  describeJsDosSource,
  jsDosSearchPaths,
} from "../../../src/backend/jsdos";

// Which js-dos build gets loaded was previously decided by a single unchecked env var,
// and an unset one fell through to the CDN without a word. The CDN serves a moving
// /latest/, so that silently swaps the emulator underneath the input bridge and drops
// any local emulator patches. The failure looks like a game bug, not a config mistake,
// which is what made it expensive.

const root = "/repo/dos-mcp";
const none = () => false;
const only = (...good: string[]) => (dir: string) => good.includes(dir);

describe("resolveJsDosSource", () => {
  it("uses DOSMCP_JSDOS_DIR when it points at a real dist", () => {
    const src = resolveJsDosSource({ DOSMCP_JSDOS_DIR: "/built" }, root, only("/built"));
    expect(src).toEqual({ dir: "/built", origin: "env" });
  });

  it("throws rather than quietly using the CDN when DOSMCP_JSDOS_DIR is wrong", () => {
    // The silent downgrade this replaces: a typo used to cost a whole debugging session.
    expect(() => resolveJsDosSource({ DOSMCP_JSDOS_DIR: "/typo" }, root, none)).toThrow(
      /no emulators\.js there/
    );
  });

  it("ignores an empty or whitespace DOSMCP_JSDOS_DIR instead of throwing", () => {
    expect(resolveJsDosSource({ DOSMCP_JSDOS_DIR: "  " }, root, none).origin).toBe("cdn");
  });

  it("finds a build in a conventional location when the variable is unset", () => {
    const sibling = jsDosSearchPaths(root)[1];
    const src = resolveJsDosSource({}, root, only(sibling));
    expect(src).toMatchObject({ dir: sibling, origin: "auto" });
  });

  it("prefers the explicit variable over an auto-detected build", () => {
    const sibling = jsDosSearchPaths(root)[1];
    const src = resolveJsDosSource({ DOSMCP_JSDOS_DIR: "/built" }, root, only("/built", sibling));
    expect(src.dir).toBe("/built");
    expect(src.origin).toBe("env");
  });

  it("prefers an in-repo build over a sibling one", () => {
    const [inRepo, sibling] = jsDosSearchPaths(root);
    const src = resolveJsDosSource({}, root, only(inRepo, sibling));
    expect(src.dir).toBe(inRepo);
  });

  it("falls back to the CDN only when nothing is found, and says where it looked", () => {
    const src = resolveJsDosSource({}, root, none);
    expect(src).toEqual({ dir: null, origin: "cdn", searched: jsDosSearchPaths(root) });
  });

  it("searches inside the repo and beside it", () => {
    expect(jsDosSearchPaths(root)).toEqual([
      "/repo/dos-mcp/jsdos-dist",
      "/repo/emulators-dist",
      "/repo/emulators/dist",
    ]);
  });
});

describe("describeJsDosSource", () => {
  it("names the directory and why it was chosen", () => {
    expect(describeJsDosSource({ dir: "/built", origin: "env" })).toContain("/built");
    expect(describeJsDosSource({ dir: "/built", origin: "env" })).toContain("DOSMCP_JSDOS_DIR");
    expect(
      describeJsDosSource({ dir: "/found", origin: "auto", searched: [] })
    ).toContain("automatically");
  });

  it("warns on the CDN path and lists where it looked", () => {
    const msg = describeJsDosSource({ dir: null, origin: "cdn", searched: ["/a", "/b"] });
    expect(msg).toMatch(/moving \/latest\//);
    expect(msg).toContain("DOSMCP_JSDOS_DIR");
    expect(msg).toContain("/a, /b");
  });
});
