import { describe, it, expect } from "vitest";
import { normalizeDosPath, dosPathToUnix, splitDosPath } from "../../src/paths";

describe("normalizeDosPath", () => {
  it("converts C:/foo/bar.dat to C:/FOO/BAR.DAT (canonical form)", () => {
    expect(normalizeDosPath("C:/foo/bar.dat")).toBe("C:/FOO/BAR.DAT");
  });

  it("converts C:\\foo\\bar.dat to C:/FOO/BAR.DAT", () => {
    expect(normalizeDosPath("C:\\foo\\bar.dat")).toBe("C:/FOO/BAR.DAT");
  });

  it("uppercases drive letter and filenames (DOS case semantics)", () => {
    expect(normalizeDosPath("c:/foo")).toBe("C:/FOO");
  });

  it("adds C: prefix to absolute paths without a drive", () => {
    expect(normalizeDosPath("/foo/bar.dat")).toBe("C:/FOO/BAR.DAT");
  });

  it("uppercases filenames (DOS case semantics)", () => {
    expect(normalizeDosPath("C:/Foo/Bar.Dat")).toBe("C:/FOO/BAR.DAT");
  });

  it("collapses duplicate slashes", () => {
    expect(normalizeDosPath("C://foo///bar")).toBe("C:/FOO/BAR");
  });
});

describe("dosPathToUnix", () => {
  it("strips drive prefix and returns unix-style path", () => {
    expect(dosPathToUnix("C:/FOO/BAR.DAT")).toBe("/FOO/BAR.DAT");
  });
});

describe("splitDosPath", () => {
  it("returns drive + segments", () => {
    expect(splitDosPath("C:/FOO/BAR.DAT")).toEqual({
      drive: "C",
      segments: ["FOO", "BAR.DAT"],
    });
  });

  it("handles root", () => {
    expect(splitDosPath("C:/")).toEqual({ drive: "C", segments: [] });
  });
});
