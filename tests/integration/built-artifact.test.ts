import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { TargetCloseError } from "puppeteer-core/internal/common/Errors.js";

// Every other test imports from src/, so they verify the TypeScript source. Production
// runs dist/, and the difference is not academic: the capture classifier reads
// TargetCloseError off the puppeteer module namespace because the export is untyped, and
// that lookup already broke once. `import puppeteer, ...` binds the default export, a
// PuppeteerNode instance that does not carry named exports, so the class check was
// silently dead and no test noticed. A module-format change would break it the same way,
// equally silently.
//
// In the integration suite rather than the unit suite because that workflow runs
// `npm run build` first, so dist is guaranteed present. It needs no browser, so it costs
// almost nothing here.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "..", "dist", "backend", "jsdos.js");

describe("built artifact", () => {
  it("classifies a close error using the class, not only the message", async () => {
    expect(
      fs.existsSync(DIST),
      `${DIST} is missing. Run 'npm run build' before the integration suite.`,
    ).toBe(true);

    const { captureWithRetry } = await import(DIST);

    // Wording that matches no message pattern, with the name cleared, so the class check
    // is the only signal left. If the namespace lookup fails to resolve in the built
    // output, this error looks unremarkable and is retried instead of refused.
    const error = new TargetCloseError("wording nobody has used yet");
    Object.defineProperty(error, "name", { value: "SomethingElse" });

    let calls = 0;
    const capture = async () => {
      calls++;
      throw error;
    };

    await expect(captureWithRetry(capture, 3, 0)).rejects.toThrow("wording nobody has used yet");
    expect(calls, "the built output retried a close error, so its class check is dead").toBe(1);
  });
});
