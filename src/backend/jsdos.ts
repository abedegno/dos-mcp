/**
 * JsDosBackend — Puppeteer + js-dos v8 implementation of the Backend interface.
 *
 * js-dos version: 8.3.x  CDN: https://v8.js-dos.com/latest/js-dos.js
 * emulators package: 8.3.9  (https://github.com/caiiiycuk/emulators)
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

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { Browser, Page } from "puppeteer";
import type {
  Backend,
  BackendStatus,
  FsEntry,
  LoadBundleOptions,
  LoadBundleResult,
} from "./index.js";
import { detectBundleSource } from "../bundle/detect.js";
import { extractDirectory, extractZip } from "../bundle/extract.js";
import { MirrorTracker } from "../mirror/mirror.js";
import { dosPathToUnix } from "../paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface JsDosBackendOptions {
  headless: boolean;
}

/** Represents a js-dos FsNode from ci.fsTree() */
interface FsNode {
  name: string;
  size: number | null;
  nodes: FsNode[] | null;
}

/**
 * Walk an FsNode tree to find the subtree rooted at `unixPath`.
 * The root node itself has name "" (empty) or the drive name;
 * we match path segments one at a time.
 */
function findNode(root: FsNode, unixPath: string): FsNode | null {
  // Normalise: strip leading slash, split
  const segments = unixPath.replace(/^\/+/, "").split("/").filter(Boolean);
  let current: FsNode = root;
  for (const seg of segments) {
    if (!current.nodes) return null;
    const child = current.nodes.find(
      n => n.name.toUpperCase() === seg.toUpperCase()
    );
    if (!child) return null;
    current = child;
  }
  return current;
}

export class JsDosBackend implements Backend {
  private browser?: Browser;
  private page?: Page;
  private sessionId = "";
  private running = false;
  private mirror = new MirrorTracker();
  private lastError?: string;

  constructor(private opts: JsDosBackendOptions) {}

  async loadBundle(options: LoadBundleOptions): Promise<LoadBundleResult> {
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
        // worker.  Without this flag headless Chromium may disable SAB on
        // non-cross-origin-isolated pages (i.e. file:// URLs).
        "--enable-features=SharedArrayBuffer",
      ],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 640, height: 400 });

    const htmlPath = path.join(__dirname, "jsdos-page.html");
    await this.page.goto("file://" + htmlPath);

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
    if (this.browser) await this.browser.close();
    this.running = false;
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

    // ci.fsTree() returns the full tree; walk to the requested node.
    // Plan used ci.fsReadDir(p) which does not exist in the real API.
    const tree = await this.page.evaluate(async () => {
      const ci = (window as any).__dosmcp.ci;
      return await ci.fsTree();
    }) as FsNode;

    const node = findNode(tree, unix);
    if (!node) return [];

    const children = node.nodes ?? [];
    return children.map(n => ({
      name: n.name,
      size: n.size ?? 0,
      isDir: Array.isArray(n.nodes),
    }));
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
