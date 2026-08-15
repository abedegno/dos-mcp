/**
 * Abstract emulator backend. Implementations:
 *   - src/backend/jsdos.ts       Puppeteer + js-dos (production)
 *   - src/backend/fake.ts        in-memory fake (unit tests)
 *
 * Every MCP tool call translates to one or more Backend method calls.
 * Keeping this interface stable lets us swap the underlying emulator later
 * (e.g. DOSBox-X in Phase 3) without changing the tool layer.
 */
export interface Backend {
  loadBundle(options: LoadBundleOptions): Promise<LoadBundleResult>;
  shutdown(): Promise<void>;
  wait(ms: number): Promise<void>;
  sendKeys(text: string, keyDelayMs?: number): Promise<void>;
  sendKeySequence(keys: string[]): Promise<void>;
  sendClick(x: number, y: number, button?: "left" | "right"): Promise<void>;
  moveMouse(x: number, y: number): Promise<void>;
  /**
   * Move by a relative delta rather than to an absolute position.
   *
   * Needed because many DOS games read INT 33h fn 0x0B (relative mickeys) and
   * accumulate those deltas into their own cursor tracker, ignoring the absolute
   * position fn 0x03 reports. Ultima Underworld is one. For such a game an
   * absolute move is only ever seen as the delta it implies, so absolute
   * positioning cannot place the cursor: where it ends up depends on where the
   * game already thought it was.
   *
   * Deltas let you position deterministically: send a large negative delta to
   * clamp the cursor into a corner, then one delta to the target.
   */
  moveMouseRelative(dx: number, dy: number): Promise<void>;
  /**
   * Press and release a button without moving first. sendClick moves to its
   * coordinates before clicking, which destroys a position established by
   * deltas.
   */
  clickAtCursor(button?: "left" | "right", holdMs?: number): Promise<void>;
  screenshot(format?: "png" | "jpeg"): Promise<{ bytes: Buffer; mime: string }>;
  getStatus(): Promise<BackendStatus>;
  fsRead(dosPath: string): Promise<Buffer>;
  fsWrite(dosPath: string, bytes: Buffer): Promise<void>;
  fsList(dosPath: string): Promise<FsEntry[]>;
  fsStat(dosPath: string): Promise<FsStat | null>;
  fsDelete(dosPath: string): Promise<void>;
  fsSync(): Promise<{ mirrorsFlushed: number }>;
}

export interface LoadBundleOptions {
  source: string;
  autoexec?: string[];
  mirror?: { host: string; dos: string }[];
}

export interface LoadBundleResult {
  sessionId: string;
  status: "ready" | "running";
}

export interface BackendStatus {
  running: boolean;
  dosTimeMs: number;
  lastError?: string;
}

export interface FsEntry {
  name: string;
  size: number;
  isDir: boolean;
}

export interface FsStat {
  name: string;
  size: number;
  isDir: boolean;
  childCount: number;
}
