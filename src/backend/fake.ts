import { Backend, LoadBundleOptions, LoadBundleResult, BackendStatus, FsEntry } from "./index";
import { normalizeDosPath, splitDosPath } from "../paths";

/**
 * In-memory fake backend for unit tests.
 * Stores files in a Map, records input events for assertions.
 */
export class FakeBackend implements Backend {
  private files: Map<string, Buffer> = new Map();
  private running = false;
  private sessionCounter = 0;
  public recordedKeys: string[] = [];
  public recordedKeySequences: string[][] = [];
  public recordedClicks: Array<{ x: number; y: number; button: string }> = [];
  public recordedMoves: Array<{ x: number; y: number }> = [];

  async loadBundle(_options: LoadBundleOptions): Promise<LoadBundleResult> {
    this.running = true;
    this.sessionCounter++;
    return {
      sessionId: `fake-${this.sessionCounter}`,
      status: "ready",
    };
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async sendKeys(text: string, keyDelayMs?: number): Promise<void> {
    this.recordedKeys.push(text);
  }

  async sendKeySequence(keys: string[]): Promise<void> {
    this.recordedKeySequences.push(keys);
  }

  async sendClick(x: number, y: number, button: "left" | "right" = "left"): Promise<void> {
    this.recordedClicks.push({ x, y, button });
  }

  async moveMouse(x: number, y: number): Promise<void> {
    this.recordedMoves.push({ x, y });
  }

  async screenshot(format: "png" | "jpeg" = "png"): Promise<{ bytes: Buffer; mime: string }> {
    // Return a 4-byte fake PNG header
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const mime = format === "png" ? "image/png" : "image/jpeg";
    return { bytes, mime };
  }

  async getStatus(): Promise<BackendStatus> {
    return {
      running: this.running,
      dosTimeMs: 0,
    };
  }

  async fsRead(dosPath: string): Promise<Buffer> {
    const canonical = normalizeDosPath(dosPath);
    const data = this.files.get(canonical);
    if (!data) {
      throw new Error(`file not found: ${canonical}`);
    }
    return data;
  }

  async fsWrite(dosPath: string, bytes: Buffer): Promise<void> {
    const canonical = normalizeDosPath(dosPath);
    this.files.set(canonical, bytes);
  }

  async fsList(dosPath: string): Promise<FsEntry[]> {
    const canonical = normalizeDosPath(dosPath);
    const { drive, segments } = splitDosPath(canonical);

    // Collect all files at the listed directory
    const prefix = canonical.endsWith("/") ? canonical : canonical + "/";
    const entries = new Map<string, FsEntry>();

    for (const [path, data] of this.files.entries()) {
      if (!path.startsWith(prefix)) continue;

      // Extract the relative path after the prefix
      const relative = path.slice(prefix.length);
      if (!relative) continue;

      const parts = relative.split("/");

      if (parts.length === 1) {
        // File at the listed directory
        entries.set(parts[0], {
          name: parts[0],
          size: data.length,
          isDir: false,
        });
      } else if (parts.length > 1) {
        // Subdirectory one level deeper
        const dirName = parts[0];
        if (!entries.has(dirName)) {
          entries.set(dirName, {
            name: dirName,
            size: 0,
            isDir: true,
          });
        }
      }
    }

    return Array.from(entries.values());
  }

  async fsDelete(dosPath: string): Promise<void> {
    const canonical = normalizeDosPath(dosPath);
    this.files.delete(canonical);
  }

  async fsSync(): Promise<{ mirrorsFlushed: number }> {
    return { mirrorsFlushed: 0 };
  }
}
