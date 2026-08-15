/**
 * JsDosBackend — Puppeteer + js-dos v8 implementation of the Backend interface.
 *
 * emulators package: 8.4.x. The CDN only ever serves /latest/ (there are no
 * versioned paths), so set DOSMCP_JSDOS_DIR to a locally built dist to pin it.
 * Do not restate a version here without checking: this header claimed 8.3.9
 * long after /latest/ had moved to 8.4.1, and 8.4.x changed sendMouseMotion
 * from canvas pixels to normalized 0..1, which silently broke the mouse bridge.
 *
 * API surface used:
 *   - emulators.dosboxDirect(init: InitFs, options?)  →  CommandInterface
 *     where InitFs = InitFileEntry[] = Array<{ path: string, contents: Uint8Array }>
 *   - ci.fsReadFile(path: string)      → Promise<Uint8Array>
 *   - ci.fsWriteFile(path: string, contents: Uint8Array) → Promise<void>
 *   - ci.fsDeleteFile(path: string)    → Promise<boolean>   (NOT fsDelete)
 *   - ci.fsTree()                      → Promise<FsNode>    (NOT fsReadDir)
 *     FsNode = { name: string, size: number|null, nodes: FsNode[]|null }
 *   - ci.exit()                        → Promise<void>
 *
 * Deviations from plan template:
 *   1. fsDelete → fsDeleteFile (real method name in the emulators package)
 *   2. fsReadDir → fsTree() + subtree walk  (no fsReadDir exists)
 *   3. InitFs supplied as InitFileEntry[] array, not a prebuilt zip; this
 *      avoids needing a runtime jszip import in the page.
 *   4. dosbox.conf path in bundle is ".jsdos/dosbox.conf" (confirmed from source).
 *   5. __dirname via path.dirname(fileURLToPath(import.meta.url)) — ES modules.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { Browser, Page } from "puppeteer";
import type {
  Backend,
  BackendStatus,
  FsEntry,
  FsStat,
  LoadBundleOptions,
  LoadBundleResult,
} from "./index.js";
import { detectBundleSource } from "../bundle/detect.js";
import { extractDirectory, extractZip } from "../bundle/extract.js";
import { MirrorTracker } from "../mirror/mirror.js";
import { dosPathToUnix } from "../paths.js";
import { startStaticServer, type StaticServer } from "./serve.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Relative deltas reach the engine as a native float and are then cast to int,
// so keep them well inside signed 16-bit rather than trusting the caller.
const MAX_RELATIVE_DELTA = 30000;
// A guest polls the mouse, so a click has to stay down long enough to be seen.
// 120ms spans just over two 55ms DOS timer ticks at 18.2Hz. There is no
// universally correct value: the engine ignores the wire timestamp and DOSBox
// tracks both button state and edge counters, so a game polling very slowly
// could still miss it. Treat this as a compatibility default, overridable.
const DEFAULT_CLICK_HOLD_MS = 120;
const MAX_CLICK_HOLD_MS = 10_000;

export interface JsDosBackendOptions {
  headless: boolean;
}

export class JsDosBackend implements Backend {
  private browser?: Browser;
  private page?: Page;
  private sessionId = "";
  private running = false;
  private mirror = new MirrorTracker();
  private lastError?: string;
  private staticServer?: StaticServer;
  private clickChain: Promise<void> = Promise.resolve();
  private buttonsDown = new Set<number>();

  constructor(private opts: JsDosBackendOptions) {}

  async loadBundle(options: LoadBundleOptions): Promise<LoadBundleResult> {
    // A failure partway through startup would otherwise leave the browser and the
    // static server allocated with no handle to reach them, and a surviving
    // Chromium keeps running the guest at ~100% CPU per renderer.
    try {
      return await this.loadBundleInner(options);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      await this.disposeResources();
      throw err;
    }
  }

  /** Drop the browser and static server without assuming a live page. */
  private async disposeResources(): Promise<void> {
    if (this.browser) {
      await this.closeBrowser(this.browser);
      this.browser = undefined;
    }
    this.page = undefined;
    if (this.staticServer) {
      try {
        await this.staticServer.close();
      } catch {
        // already down
      }
      this.staticServer = undefined;
    }
    this.running = false;
  }

  private async loadBundleInner(options: LoadBundleOptions): Promise<LoadBundleResult> {
    // 1. Build an in-memory DOS file tree from the source.
    const kind = detectBundleSource(options.source);
    const tree: Map<string, Buffer> =
      kind === "directory"
        ? await extractDirectory(options.source)
        : await extractZip(options.source);

    // 2. Register mirrors.
    if (options.mirror) {
      for (const m of options.mirror) this.mirror.addMirror(m);
    }

    // 3. Launch Chromium + load the js-dos host page.
    this.browser = await puppeteer.launch({
      headless: this.opts.headless,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        // dosboxDirect uses SharedArrayBuffer for sync Atomics across the WASM
        // worker.  The page is served with COOP/COEP so it is genuinely
        // cross-origin isolated, but keep the flag for older Chromium builds.
        "--enable-features=SharedArrayBuffer",
      ],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 640, height: 400 });

    // Serve the page over http so it can be cross-origin isolated. When
    // DOSMCP_JSDOS_DIR points at a locally built emulators dist, serve that too
    // and tell the page to load js-dos from there instead of the CDN, which only
    // ever offers a moving /latest/.
    const localDist = process.env.DOSMCP_JSDOS_DIR;
    const roots: Record<string, string> = { "/": __dirname };
    if (localDist) roots["/jsdos/"] = localDist;
    this.staticServer = await startStaticServer(roots, Boolean(localDist));

    const pageUrl = new URL("/jsdos-page.html", this.staticServer.origin);
    if (localDist) pageUrl.searchParams.set("jsdos", "/jsdos/");
    await this.page.goto(pageUrl.toString());

    // Wait until emulators.js has loaded and the load-event handler has set
    // window.__dosmcp.ready.  (emulators.js sets window.emulators synchronously
    // but we wait for the 'load' event in the page script to also set pathPrefix
    // before we start using the API.)
    await this.page.waitForFunction(
      () => Boolean((window as any).__dosmcp?.ready),
      { timeout: 30_000 }
    );

    // 4. Serialise the file tree for transfer over CDP.
    //    js-dos InitFs accepts InitFileEntry[]: Array<{path, contents: Uint8Array}>
    //    Path convention: relative unix path from the DOS root (no leading slash,
    //    no drive letter), e.g. "ECHO.COM" or "DATA/FILE.DAT".
    const fileEntries = Array.from(tree.entries()).map(([dosPath, bytes]) => {
      // dosPathToUnix produces "/ECHO.COM"; strip the leading slash.
      const unixRel = dosPathToUnix(dosPath).replace(/^\//, "");
      return {
        path: unixRel,
        contents_b64: bytes.toString("base64"),
      };
    });

    // Build dosbox.conf autoexec block if provided.
    const autoexecLines = options.autoexec ?? [];
    const dosboxConf =
      "[sdl]\nfullscreen=false\n\n[cpu]\ncycles=max\n\n[autoexec]\nmount c .\nc:\n" +
      autoexecLines.join("\n") +
      "\n";

    // 5. Push file tree + config into js-dos and start the emulator.
    await this.page.evaluate(
      async (files, confContent) => {
        const emulators = (window as any).__dosmcp.emulators;

        // Build InitFs as InitFileEntry array (path + Uint8Array contents).
        const initFs: Array<{ path: string; contents: Uint8Array }> = files.map(
          (f: { path: string; contents_b64: string }) => ({
            path: f.path,
            contents: Uint8Array.from(
              atob(f.contents_b64),
              (c: string) => c.charCodeAt(0)
            ),
          })
        );

        // Prepend the dosbox config at the expected bundle path.
        const encoder = new TextEncoder();
        initFs.unshift({
          path: ".jsdos/dosbox.conf",
          contents: encoder.encode(confContent),
        });

        const ci = await emulators.dosboxDirect(initFs);
        (window as any).__dosmcp.ci = ci;
      },
      fileEntries,
      dosboxConf
    );

    this.sessionId = `jsdos-${Date.now()}`;
    this.running = true;
    return { sessionId: this.sessionId, status: "ready" };
  }

  async shutdown(): Promise<void> {
    await this.mirror.flush();
    // Release anything still held, so a shutdown mid-click does not leave the
    // guest believing a button is down.
    if (this.page && this.buttonsDown.size > 0) {
      for (const b of [...this.buttonsDown]) {
        try {
          await this.page.evaluate((btn: number) => {
            const ci = (window as any).__dosmcp?.ci;
            if (ci) ci.sendMouseButton(btn, false);
          }, b);
        } catch {
          // page already closing
        }
      }
      this.buttonsDown.clear();
    }
    if (this.page) {
      try {
        await this.page.evaluate(async () => {
          const ci = (window as any).__dosmcp?.ci;
          if (ci && typeof ci.exit === "function") {
            await ci.exit();
          }
          (window as any).__dosmcp.ci = null;
        });
      } catch {
        // page may already be closing
      }
    }
    if (this.browser) await this.closeBrowser(this.browser);
    if (this.staticServer) {
      await this.staticServer.close();
      this.staticServer = undefined;
    }
    this.browser = undefined;
    this.page = undefined;
    this.running = false;
  }

  /**
   * Close the browser, and SIGKILL it if it will not go quietly. A graceful
   * close() can wedge, and giving up on the await is not enough: the whole point
   * is that a surviving Chromium keeps running the DOS guest at ~100% CPU per
   * renderer indefinitely, so it has to actually die.
   */
  private async closeBrowser(browser: Browser): Promise<void> {
    const proc = browser.process();
    try {
      await Promise.race([
        browser.close(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("browser close timed out")), 4000)
        ),
      ]);
    } catch (err) {
      try {
        proc?.kill("SIGKILL");
      } catch {
        // already gone
      }
      console.error("dos-mcp: forced browser kill:", err);
    }
  }

  async wait(ms: number): Promise<void> {
    await new Promise<void>(r => setTimeout(r, ms));
    await this.mirror.flush();
  }

  async sendKeys(text: string, keyDelayMs = 10): Promise<void> {
    if (!this.page) throw new Error("not loaded");
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      if (keyDelayMs > 0) await new Promise<void>(r => setTimeout(r, keyDelayMs));
    }
  }

  async sendKeySequence(keys: string[]): Promise<void> {
    if (!this.page) throw new Error("not loaded");
    for (const k of keys) {
      if (k.includes("+")) {
        const parts = k.split("+");
        const modifiers = parts.slice(0, -1);
        const key = parts[parts.length - 1];
        for (const mod of modifiers) await this.page.keyboard.down(mod as any);
        await this.page.keyboard.press(key as any);
        for (const mod of modifiers.reverse()) await this.page.keyboard.up(mod as any);
      } else {
        await this.page.keyboard.press(k as any);
      }
    }
  }

  async sendClick(x: number, y: number, button: "left" | "right" = "left"): Promise<void> {
    if (!this.page) throw new Error("not loaded");
    await this.page.mouse.click(x, y, { button });
  }

  async moveMouse(x: number, y: number): Promise<void> {
    if (!this.page) throw new Error("not loaded");
    await this.page.mouse.move(x, y);
  }

  async moveMouseRelative(dx: number, dy: number): Promise<void> {
    if (!this.page) throw new Error("not loaded");
    // Deltas are narrowed to a native float and then cast straight to int in the
    // engine's relative path, so an out-of-range value is an unsafe conversion.
    // Stay comfortably inside signed 16-bit and require whole mickeys.
    for (const [name, v] of [["dx", dx], ["dy", dy]] as const) {
      if (!Number.isInteger(v)) {
        throw new Error(`moveMouseRelative ${name} must be a whole number, got ${v}`);
      }
      if (Math.abs(v) > MAX_RELATIVE_DELTA) {
        throw new Error(
          `moveMouseRelative ${name} of ${v} exceeds +/-${MAX_RELATIVE_DELTA}`
        );
      }
    }
    // Goes straight to the engine rather than through a synthetic DOM event,
    // because a DOM mousemove only carries an absolute position and the bridge
    // would convert it back into a delta from wherever the pointer happened to
    // be. sendMouseRelativeMotion sets relative:true on the same wire message.
    await this.page.evaluate(
      (x: number, y: number) => {
        const ci = (window as any).__dosmcp?.ci;
        if (!ci) throw new Error("emulator not started");
        if (typeof ci.sendMouseRelativeMotion !== "function") {
          throw new Error("engine has no sendMouseRelativeMotion");
        }
        ci.sendMouseRelativeMotion(x, y);
      },
      dx,
      dy
    );
  }

  async clickAtCursor(
    button: "left" | "right" = "left",
    holdMs = DEFAULT_CLICK_HOLD_MS
  ): Promise<void> {
    if (!this.page) throw new Error("not loaded");
    if (!Number.isFinite(holdMs) || holdMs < 0 || holdMs > MAX_CLICK_HOLD_MS) {
      throw new Error(`clickAtCursor holdMs must be 0..${MAX_CLICK_HOLD_MS}, got ${holdMs}`);
    }
    const b = button === "right" ? 1 : 0;
    // Serialise clicks. Two overlapping calls would otherwise interleave their
    // down/up pairs and the guest would see a nonsensical button sequence.
    const run = this.clickChain.then(async () => {
      const press = (pressed: boolean) =>
        this.page!.evaluate(
          (btn: number, down: boolean) => {
            const ci = (window as any).__dosmcp?.ci;
            if (!ci) throw new Error("emulator not started");
            ci.sendMouseButton(btn, down);
          },
          b,
          pressed
        );
      // Hold the button down across real time. The guest polls the mouse, so a
      // press and release delivered in the same instant can be missed entirely:
      // both wire messages carry near-identical timestamps and the emulator
      // never ticks between them.
      await press(true);
      this.buttonsDown.add(b);
      try {
        await new Promise<void>((r) => setTimeout(r, holdMs));
      } finally {
        // Always attempt the release. Without this, a failure or a shutdown
        // during the hold leaves the guest believing the button is still down:
        // INT 33h fn 03 keeps reporting it pressed and fn 06 never sees a
        // release. Nothing can deliver it if the page is already gone, which is
        // why shutdown also releases anything still held.
        try {
          await press(false);
          this.buttonsDown.delete(b);
        } catch {
          // page or emulator already gone
        }
      }
    });
    this.clickChain = run.catch(() => undefined);
    return run;
  }


  async screenshot(format: "png" | "jpeg" = "png"): Promise<{ bytes: Buffer; mime: string }> {
    if (!this.page) throw new Error("not loaded");
    const raw = await this.page.screenshot({ type: format });
    return {
      bytes: Buffer.from(raw as Uint8Array),
      mime: format === "png" ? "image/png" : "image/jpeg",
    };
  }

  async getStatus(): Promise<BackendStatus> {
    return { running: this.running, dosTimeMs: 0, lastError: this.lastError };
  }

  async fsRead(dosPath: string): Promise<Buffer> {
    if (!this.page) throw new Error("not loaded");
    const unix = dosPathToUnix(dosPath);
    const b64 = await this.page.evaluate(async (p: string) => {
      const ci = (window as any).__dosmcp.ci;
      const bytes: Uint8Array = await ci.fsReadFile(p);
      // btoa requires a binary string — chunk to avoid call-stack overflow on large files
      let bin = "";
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
      }
      return btoa(bin);
    }, unix);
    return Buffer.from(b64, "base64");
  }

  async fsWrite(dosPath: string, bytes: Buffer): Promise<void> {
    if (!this.page) throw new Error("not loaded");
    const unix = dosPathToUnix(dosPath);
    const b64 = bytes.toString("base64");
    await this.page.evaluate(async (p: string, b: string) => {
      const ci = (window as any).__dosmcp.ci;
      const arr = Uint8Array.from(atob(b), (c: string) => c.charCodeAt(0));
      await ci.fsWriteFile(p, arr);
    }, unix, b64);
    this.mirror.markDirty(dosPath, bytes);
  }

  async fsList(dosPath: string): Promise<FsEntry[]> {
    if (!this.page) throw new Error("not loaded");
    const unix = dosPathToUnix(dosPath);

    // ci.fsTree() returns the whole FS. Serializing it back across the
    // Puppeteer bridge on every call was the source of fs_list timeouts on
    // large trees. Do the walk inside the browser and only return the direct
    // children of the requested node.
    return await this.page.evaluate(async (target: string) => {
      const ci = (window as any).__dosmcp.ci;
      const tree = await ci.fsTree();
      const segs = target.replace(/^\/+/, "").split("/").filter(Boolean);
      let cur: any = tree;
      for (const s of segs) {
        if (!cur?.nodes) return [];
        const c = cur.nodes.find((n: any) => n.name.toUpperCase() === s.toUpperCase());
        if (!c) return [];
        cur = c;
      }
      const children = cur.nodes ?? [];
      return children.map((n: any) => ({
        name: n.name,
        size: n.size ?? 0,
        isDir: Array.isArray(n.nodes),
      }));
    }, unix) as FsEntry[];
  }

  async fsStat(dosPath: string): Promise<FsStat | null> {
    if (!this.page) throw new Error("not loaded");
    const unix = dosPathToUnix(dosPath);
    return await this.page.evaluate(async (target: string) => {
      const ci = (window as any).__dosmcp.ci;
      const tree = await ci.fsTree();
      const segs = target.replace(/^\/+/, "").split("/").filter(Boolean);
      let cur: any = tree;
      for (const s of segs) {
        if (!cur?.nodes) return null;
        const c = cur.nodes.find((n: any) => n.name.toUpperCase() === s.toUpperCase());
        if (!c) return null;
        cur = c;
      }
      const isDir = Array.isArray(cur.nodes);
      return {
        name: cur.name ?? "",
        size: cur.size ?? 0,
        isDir,
        childCount: isDir ? (cur.nodes?.length ?? 0) : 0,
      };
    }, unix) as FsStat | null;
  }

  async fsDelete(dosPath: string): Promise<void> {
    if (!this.page) throw new Error("not loaded");
    const unix = dosPathToUnix(dosPath);
    // Real method name is fsDeleteFile (not fsDelete as the plan had).
    await this.page.evaluate(async (p: string) => {
      const ci = (window as any).__dosmcp.ci;
      await ci.fsDeleteFile(p);
    }, unix);
  }

  async fsSync(): Promise<{ mirrorsFlushed: number }> {
    const n = await this.mirror.flush();
    return { mirrorsFlushed: n };
  }
}
