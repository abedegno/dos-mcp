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
  screenshot(format?: "png" | "jpeg"): Promise<{ bytes: Buffer; mime: string }>;
  getStatus(): Promise<BackendStatus>;
  fsRead(dosPath: string): Promise<Buffer>;
  fsWrite(dosPath: string, bytes: Buffer): Promise<void>;
  fsList(dosPath: string): Promise<FsEntry[]>;
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
