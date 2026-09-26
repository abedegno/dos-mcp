import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { JsDosBackend } from "../../src/backend/jsdos";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMOKE_DIR = path.join(__dirname, "..", "..", "test-fixtures", "smoke");

// Real pointer lock needs a person clicking a visible window, so these fake the captured
// state by overriding document.pointerLockElement and record what the page sends to the
// emulator. That covers the page's own logic: the switch, the capture-phase interception,
// the relative motion and its scaling, and the minimum hold on a click.
async function withBackend(
  opts: { pointerLock?: boolean },
  fn: (be: JsDosBackend) => Promise<void>
): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-lock-"));
  fs.copyFileSync(path.join(SMOKE_DIR, "ECHO.COM"), path.join(tmp, "ECHO.COM"));
  const be = new JsDosBackend({ headless: true, ...opts });
  try {
    await be.loadBundle({ source: tmp, autoexec: ["ECHO.COM"] });
    await be.wait(1000);
    await fn(be);
  } finally {
    await be.shutdown();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Wraps the emulator's mouse calls so the test can see them, and pretends the canvas holds
// the pointer lock.
const INSTRUMENT = () => {
  const d = (window as any).__dosmcp;
  const ci = d.ci;
  d.calls = [];
  const rel = ci.sendMouseRelativeMotion.bind(ci);
  const btn = ci.sendMouseButton.bind(ci);
  const abs = ci.sendMouseMotion.bind(ci);
  ci.sendMouseRelativeMotion = (x: number, y: number) => { d.calls.push(["rel", x, y, performance.now()]); rel(x, y); };
  ci.sendMouseButton = (b: number, p: boolean) => { d.calls.push(["btn", b, p, performance.now()]); btn(b, p); };
  ci.sendMouseMotion = (x: number, y: number) => { d.calls.push(["abs", x, y, performance.now()]); abs(x, y); };
  const canvas = document.querySelector("canvas");
  Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => canvas });
};

describe("attended pointer lock", () => {
  it("is off for a headless session unless asked for", async () => {
    await withBackend({}, async (be) => {
      const on = await (be as any).page.evaluate(() => (window as any).__dosmcp.pointerLock);
      expect(on).toBe(false);
    });
  }, 60000);

  it("sends relative motion scaled to the game and holds a quick click", async () => {
    await withBackend({ pointerLock: true }, async (be) => {
      const page = (be as any).page;
      expect(await page.evaluate(() => (window as any).__dosmcp.pointerLock)).toBe(true);
      await page.evaluate(INSTRUMENT);
      const calls = await page.evaluate(async () => {
        const canvas = document.querySelector("canvas")!;
        canvas.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, movementX: 10, movementY: -4 }));
        canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2 }));
        canvas.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 2 }));
        await new Promise((r) => setTimeout(r, 300));
        const r = canvas.getBoundingClientRect();
        return { calls: (window as any).__dosmcp.calls, kx: canvas.width / r.width, ky: canvas.height / r.height };
      });
      const kinds = calls.calls.map((c: any[]) => c[0]);
      // Nothing reaches the absolute bridge while captured.
      expect(kinds).not.toContain("abs");
      const rel = calls.calls.find((c: any[]) => c[0] === "rel");
      expect(rel[1]).toBeCloseTo(10 * calls.kx);
      expect(rel[2]).toBeCloseTo(-4 * calls.ky);
      const presses = calls.calls.filter((c: any[]) => c[0] === "btn");
      expect(presses.map((c: any[]) => [c[1], c[2]])).toEqual([[1, true], [1, false]]);
      // The release waits until the press has been held for 150ms.
      expect(presses[1][3] - presses[0][3]).toBeGreaterThanOrEqual(140);
    });
  }, 60000);
});

describe("mouse_button on the real backend", () => {
  it("presses and releases through the emulator and tracks what is held", async () => {
    await withBackend({}, async (be) => {
      const page = (be as any).page;
      await page.evaluate(INSTRUMENT);
      await be.setMouseButton("right", true);
      expect([...(be as any).buttonsDown]).toEqual([1]);
      await be.setMouseButton("right", false);
      expect([...(be as any).buttonsDown]).toEqual([]);
      const presses = await page.evaluate(() =>
        (window as any).__dosmcp.calls.filter((c: any[]) => c[0] === "btn").map((c: any[]) => [c[1], c[2]])
      );
      expect(presses).toEqual([[1, true], [1, false]]);
    });
  }, 60000);
});
