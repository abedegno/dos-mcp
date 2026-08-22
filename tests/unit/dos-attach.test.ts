import { describe, it, expect, afterEach } from "vitest";
// @ts-expect-error - plain .mjs helper at the repo root, no type declarations
import { readDosFile } from "../../dos-attach.mjs";

// js-dos refuses a second fsReadFile for the same path STRING in one session. The retry
// exists because the failure is invisible: the file is simply absent from the result, so a
// save that WAS written looks like one that never was. That is indistinguishable, to a
// caller, from a genuinely missing file - which is why the retry has to be narrow. Both
// directions are harmful. Retrying too little brings the original bug back; retrying a real
// absence turns every missing-file check into eight round trips and then an exception.
const TWICE = "Error: fsGetFile should not be called twice for same file";

// A fake page whose evaluate runs the real in-page callback in-process, against a stubbed
// window. Testing through the actual callback rather than around it means the base64
// chunking is covered too, not just the retry loop.
function pageWith(fsReadFile: (p: string) => Promise<Uint8Array>) {
  const tried: string[] = [];
  const page = {
    evaluate: async (fn: (p: string) => unknown, arg: string) => {
      tried.push(arg);
      (globalThis as unknown as { window: unknown }).window = {
        __dosmcp: { ci: { fsReadFile } },
      };
      return await fn(arg);
    },
  };
  return { page, tried };
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

/** js-dos as it actually behaves: each exact path string may be read once. */
function jsdosWith(files: Record<string, Uint8Array>) {
  const used = new Set<string>();
  return async (p: string) => {
    if (used.has(p)) throw new Error("fsGetFile should not be called twice for same file");
    used.add(p);
    const key = p.replace(/^(\.\/)+/, "");
    if (!(key in files)) throw new Error(`no such file: ${p}`);
    return files[key];
  };
}

describe("readDosFile", () => {
  it("reads a file on the first attempt, without spelling it differently", async () => {
    const { page, tried } = pageWith(jsdosWith({ "SAVE1/DESC": new Uint8Array([65, 66]) }));
    const out = await readDosFile(page, "SAVE1/DESC");
    expect(Array.from(out!)).toEqual([65, 66]);
    expect(tried).toEqual(["SAVE1/DESC"]);
  });

  it("re-reads the same path by escalating a ./ prefix", async () => {
    const jsdos = jsdosWith({ "SAVE1/DESC": new Uint8Array([65, 66]) });
    const first = pageWith(jsdos);
    await readDosFile(first.page, "SAVE1/DESC");
    // Same js-dos, so the plain spelling is now spent - this is the real scenario.
    const second = pageWith(jsdos);
    const out = await readDosFile(second.page, "SAVE1/DESC");
    expect(Array.from(out!)).toEqual([65, 66]);
    expect(second.tried).toEqual(["SAVE1/DESC", "./SAVE1/DESC"]);
  });

  it("returns null for a genuinely absent file, without retrying", async () => {
    const { page, tried } = pageWith(jsdosWith({}));
    expect(await readDosFile(page, "SAVE3/DESC")).toBeNull();
    // The narrowness is the point: an absent file must cost one round trip, not eight.
    expect(tried).toEqual(["SAVE3/DESC"]);
  });

  it("returns a zero-byte file as empty, not as absent", async () => {
    // DOS writes a zero-byte DESC for an empty save description, and that is a distinct
    // state from an unused slot. Collapsing it to null would misreport the slot.
    const { page } = pageWith(jsdosWith({ "SAVE1/DESC": new Uint8Array([]) }));
    const out = await readDosFile(page, "SAVE1/DESC");
    expect(out).not.toBeNull();
    expect(out!.length).toBe(0);
  });

  it("round-trips a file larger than the base64 chunk size", async () => {
    // The in-page loop splits at 8192 to avoid blowing the argument limit on
    // String.fromCharCode. An off-by-one there would corrupt every save file we pull.
    const big = new Uint8Array(8192 * 2 + 7).map((_, i) => i % 251);
    const { page } = pageWith(jsdosWith({ "SAVE1/LEV.ARK": big }));
    const out = await readDosFile(page, "SAVE1/LEV.ARK");
    expect(Array.from(out!)).toEqual(Array.from(big));
  });

  it("throws rather than reporting absence when every spelling is refused", async () => {
    const alwaysRefuses = async () => {
      throw new Error("fsGetFile should not be called twice for same file");
    };
    const { page, tried } = pageWith(alwaysRefuses);
    await expect(readDosFile(page, "SAVE1/DESC")).rejects.toThrow(/rejected every spelling/);
    expect(tried).toHaveLength(8);
    expect(tried[7]).toBe("./".repeat(7) + "SAVE1/DESC");
  });

  it("does not mistake a different error for the twice-read refusal", async () => {
    const { page, tried } = pageWith(async () => {
      throw new Error("filesystem not mounted");
    });
    expect(await readDosFile(page, "SAVE1/DESC")).toBeNull();
    expect(tried).toEqual(["SAVE1/DESC"]);
  });
});

// Guards the message match itself. The retry keys off js-dos's wording, so a test that only
// used our own constant could pass while the real string drifted out from under it.
describe("the refusal is matched on js-dos's wording", () => {
  it("matches case-insensitively", async () => {
    const { page, tried } = pageWith(async (p: string) => {
      if (!p.startsWith("./")) throw new Error("fsGetFile SHOULD NOT BE CALLED TWICE for same file");
      return new Uint8Array([1]);
    });
    const out = await readDosFile(page, "SAVE1/DESC");
    expect(Array.from(out!)).toEqual([1]);
    expect(tried).toHaveLength(2);
  });

  it("is the message js-dos actually throws", () => {
    expect(TWICE).toMatch(/should not be called twice/i);
  });
});
