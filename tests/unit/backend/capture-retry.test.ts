import { describe, it, expect } from "vitest";
import * as fromPuppeteer from "puppeteer";
import { ConnectionClosedError, ProtocolError, TimeoutError } from "puppeteer";
// Typed only here, in puppeteer-core's own declarations. Production deliberately does not
// take this import: the path is internal and could move within ^25.x, which for shipped
// precompiled output would be a startup failure rather than a compile error.
import { TargetCloseError } from "puppeteer-core/internal/common/Errors.js";
import { captureWithRetry } from "../../../src/backend/jsdos";

// The retry policy for issue #28, tested here rather than through a browser. The
// failure it exists for could not be reproduced in about 1040 captures across four
// configurations, so a test that waits for a real "Internal error" would never run.
// What can be pinned down is the policy: which errors are retried, how often, and that
// the original error is not lost.
//
// The policy retries by exclusion: anything that is not a known-unrecoverable failure
// is treated as possibly transient. Both halves need covering, because both directions
// are harmful. Missing a transient loses the session, which is the bug. Retrying a
// timeout triples a delay that has already cost the 180s protocolTimeout.
const zeroDelay = 0;

function failingCapture(messages: string[], thenSucceed = true) {
  let call = 0;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const fn = async () => {
    const message = messages[call++];
    if (message !== undefined) throw new Error(message);
    if (!thenSucceed) {
      // A distinctive, non-retryable message. The previous wording was itself retried,
      // so an under-specified script could have made a test pass for the wrong reason.
      throw new Error("TEST BUG: capture script exhausted; not loaded");
    }
    return png;
  };
  return { fn, calls: () => call, png };
}

describe("captureWithRetry, against Puppeteer's own error classes", () => {
  // The policy classifies structurally where it can, so it has to be tested with the
  // real classes and not only with plain Errors carrying the right words.
  function throwing(error: unknown) {
    let calls = 0;
    return {
      fn: async () => {
        calls++;
        throw error;
      },
      calls: () => calls,
    };
  }

  it("refuses a closed connection identified only by its class", async () => {
    // Isolates the ConnectionClosedError branch. Its usual message, "Connection closed",
    // is also matched by /connection closed/i, so with that wording the branch could be
    // deleted and every test would still pass. Mutation testing showed exactly that, so
    // the wording here matches no pattern and only the class remains.
    const error = new ConnectionClosedError("wording nobody has used yet");
    Object.defineProperty(error, "name", { value: "SomethingElse" });
    let calls = 0;
    const fn = async () => {
      calls++;
      throw error;
    };
    await expect(captureWithRetry(fn, 3, 0)).rejects.toThrow("wording nobody has used yet");
    expect(calls, "retried despite being a ConnectionClosedError").toBe(1);
  });

  it("does not retry a closed connection or a timeout", async () => {
    for (const error of [
      new ConnectionClosedError("Connection closed"),
      new TimeoutError("waiting for something"),
    ]) {
      const { fn, calls } = throwing(error);
      await expect(captureWithRetry(fn, 3, 0)).rejects.toThrow(error.message);
      expect(calls(), `retried ${error.constructor.name}`).toBe(1);
    }
  });

  it("does not retry TargetCloseError, whatever it says", async () => {
    // Worded three ways Puppeteer actually uses, including one no message pattern
    // would catch, which is the point of classifying by class rather than by text.
    for (const message of ["Page closed!", "Session with given id not found", "wording nobody has used yet"]) {
      const { fn, calls } = throwing(new TargetCloseError(message));
      await expect(captureWithRetry(fn, 3, 0)).rejects.toThrow(message);
      expect(calls(), `retried TargetCloseError("${message}")`).toBe(1);
    }
  });

  it("refuses a TargetCloseError whose name has been overwritten", async () => {
    // Isolates the instanceof branch. The two checks are redundant by design, so with the
    // name intact either one alone would pass and neither is individually proven. Clearing
    // the name leaves only the class to go on.
    // Wording chosen to match no message pattern, and the name cleared, so the class is
    // the only remaining signal. An earlier version of this test used "Page closed!",
    // which /page closed/i caught, so it passed with the instanceof branch deleted and
    // isolated nothing.
    const error = new TargetCloseError("wording nobody has used yet");
    Object.defineProperty(error, "name", { value: "SomethingElse" });
    let calls = 0;
    const fn = async () => {
      calls++;
      throw error;
    };
    await expect(captureWithRetry(fn, 3, 0)).rejects.toThrow("wording nobody has used yet");
    expect(calls, "retried despite being a TargetCloseError").toBe(1);
  });

  it("still finds TargetCloseError on the puppeteer module at runtime", () => {
    // What production actually depends on. It reads the constructor off the "puppeteer"
    // namespace, because the export exists at runtime but not in the type declarations. If
    // that export is ever withdrawn, instanceof silently stops matching and only the name
    // check remains, so assert it rather than trusting it.
    const fromRuntime = (fromPuppeteer as unknown as Record<string, unknown>).TargetCloseError;
    expect(typeof fromRuntime).toBe("function");
    // And it is the same class the typed declarations describe, so the tests above are
    // exercising the class production will actually see.
    expect(fromRuntime).toBe(TargetCloseError);
  });

  it("recognises TargetCloseError by class and by name", () => {
    // The implementation tests instanceof first and error.name second. The name check is
    // not redundant: two copies of puppeteer-core in a tree give two distinct class
    // objects and instanceof fails against the copy the backend did not import. Both
    // signals are asserted so neither can rot unnoticed.
    const error = new TargetCloseError("x");
    expect(error.name).toBe("TargetCloseError");
    expect(error).toBeInstanceOf(ProtocolError);
  });

  it("refuses a plain Error whose name is exactly TargetCloseError", async () => {
    // Isolates the name branch, which mutation testing showed was masked. Real
    // TargetCloseError instances are caught by the class check first, and the look-alike
    // test below covers only the negative, so nothing exercised this positive path. It
    // exists for a withdrawn runtime export or duplicate puppeteer-core copies, where the
    // class check cannot match and the error is not a real TargetCloseError object.
    const error = new Error("wording nobody has used yet");
    error.name = "TargetCloseError";
    let calls = 0;
    const fn = async () => {
      calls++;
      throw error;
    };
    await expect(captureWithRetry(fn, 3, 0)).rejects.toThrow("wording nobody has used yet");
    expect(calls, "retried an error named TargetCloseError").toBe(1);
  });

  it("refuses a look-alike that only carries the name", async () => {
    // The name fallback must not become a way for an unrelated error to be treated as
    // fatal. Only this exact name qualifies.
    const impostor = new Error("Protocol error (Page.captureScreenshot): Internal error");
    impostor.name = "TargetCloselike";
    let calls = 0;
    const png = new Uint8Array([1]);
    const fn = async () => {
      if (++calls === 1) throw impostor;
      return png;
    };
    await expect(captureWithRetry(fn, 3, 0)).resolves.toBe(png);
    expect(calls).toBe(2); // retried, not refused
  });

  it("retries a plain ProtocolError, which is the case this exists for", async () => {
    // The reported failure arrives as a ProtocolError that is neither closed nor timed
    // out, so it must not be swept up by the structural exclusions.
    const error = new ProtocolError("Protocol error (Page.captureScreenshot): Internal error");
    let calls = 0;
    const png = new Uint8Array([1]);
    const fn = async () => {
      if (++calls === 1) throw error;
      return png;
    };
    await expect(captureWithRetry(fn, 3, 0)).resolves.toBe(png);
    expect(calls).toBe(2);
  });

  it("rejects a nonsensical attempt count instead of falling through the loop", async () => {
    for (const attempts of [0, -1, 1.5, NaN]) {
      const { fn, calls } = throwing(new Error("never reached"));
      await expect(captureWithRetry(fn, attempts, 0)).rejects.toThrow(/at least one attempt/);
      expect(calls(), `ran the capture for attempts=${attempts}`).toBe(0);
    }
  });
});

describe("captureWithRetry", () => {
  it("returns the first successful capture without retrying", async () => {
    const { fn, calls, png } = failingCapture([]);
    await expect(captureWithRetry(fn, 3, zeroDelay)).resolves.toBe(png);
    expect(calls()).toBe(1);
  });

  it("retries an Internal error and returns a later success", async () => {
    const { fn, calls, png } = failingCapture([
      "Protocol error (Page.captureScreenshot): Internal error",
    ]);
    await expect(captureWithRetry(fn, 3, zeroDelay)).resolves.toBe(png);
    expect(calls()).toBe(2);
  });

  it("keeps retrying up to the attempt limit", async () => {
    const { fn, calls, png } = failingCapture([
      "Protocol error (Page.captureScreenshot): Internal error",
      "Protocol error (Page.captureScreenshot): Internal error",
    ]);
    await expect(captureWithRetry(fn, 3, zeroDelay)).resolves.toBe(png);
    expect(calls()).toBe(3);
  });

  it("gives up after the limit, reporting the attempts and keeping the cause", async () => {
    const original = "Protocol error (Page.captureScreenshot): Internal error";
    const { fn, calls } = failingCapture([original, original, original], false);
    await expect(captureWithRetry(fn, 3, zeroDelay)).rejects.toThrow(/after 3 attempts/);
    expect(calls()).toBe(3);

    // The original error must survive, or a genuine change in the failure would be
    // hidden behind our own wrapper message.
    try {
      const again = failingCapture([original, original, original], false);
      await captureWithRetry(again.fn, 3, zeroDelay);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain(original);
      expect(((error as Error).cause as Error).message).toBe(original);
    }
  });

  it("does not retry a failure that cannot recover", async () => {
    // The exclusions, and why each one is excluded. A timeout has already cost the
    // 180s protocolTimeout before it is seen, so retrying triples that; a closed
    // target or session will never come back.
    for (const message of [
      "Page.captureScreenshot timed out. Increase the 'protocolTimeout' setting",
      "Protocol error (Page.captureScreenshot): Target closed",
      "Session closed. Most likely the page has been closed.",
      "Connection closed",
      "Requesting main frame too early! Frame is detached",
      "not loaded",
    ]) {
      const { fn, calls } = failingCapture([message, message, message], false);
      await expect(captureWithRetry(fn, 3, zeroDelay)).rejects.toThrow(message);
      expect(calls(), `retried "${message}"`).toBe(1);
    }
  });

  it("retries a capture failure it has not seen before", async () => {
    // Retrying by exclusion, not by matching one known message. CDP refuses a capture
    // in more than one way: "Unable to capture screenshot" was observed alongside
    // "Internal error" while investigating #28, and an allow-list keyed on the
    // reported message would have let the sibling through.
    for (const message of [
      "Protocol error (Page.captureScreenshot): Unable to capture screenshot",
      "Protocol error (Page.captureScreenshot): Some future wording",
    ]) {
      const { fn, calls, png } = failingCapture([message]);
      await expect(captureWithRetry(fn, 3, zeroDelay)).resolves.toBe(png);
      expect(calls(), `did not retry "${message}"`).toBe(2);
    }
  });

  it("matches an exclusion whatever its case", async () => {
    const { fn, calls } = failingCapture(["TIMED OUT waiting for capture"], false);
    await expect(captureWithRetry(fn, 3, zeroDelay)).rejects.toThrow(/TIMED OUT/);
    expect(calls()).toBe(1);
  });

  it("honours a single-attempt policy by not retrying at all", async () => {
    const { fn, calls } = failingCapture(["Internal error"], false);
    // Singular: the message says "1 attempt", not "1 attempts".
    await expect(captureWithRetry(fn, 1, zeroDelay)).rejects.toThrow(/after 1 attempt:/);
    expect(calls()).toBe(1);
  });

  it("passes through a thrown non-Error without crashing on .message", async () => {
    const fn = async () => {
      throw "Internal error, as a bare string";
    };
    await expect(captureWithRetry(fn, 2, zeroDelay)).rejects.toThrow(/after 2 attempts/);
  });
});
