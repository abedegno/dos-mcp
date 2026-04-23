import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeDosPath } from "../paths";

export interface MirrorSpec {
  host: string;
  dos: string; // DOS dir under which writes mirror to host
}

export class MirrorTracker {
  private mirrors: MirrorSpec[] = [];
  private dirty = new Map<string, Buffer>();

  addMirror(spec: MirrorSpec): void {
    this.mirrors.push({
      host: spec.host,
      dos: normalizeDosPath(spec.dos).replace(/\/$/, ""),
    });
  }

  /**
   * Record a virtual FS write. If the path falls under a mirror spec, it is
   * queued for flush. Otherwise it is ignored.
   */
  markDirty(dosPath: string, bytes: Buffer): void {
    const p = normalizeDosPath(dosPath);
    for (const m of this.mirrors) {
      if (p === m.dos || p.startsWith(m.dos + "/")) {
        this.dirty.set(p, bytes);
        return;
      }
    }
  }

  pendingCount(): number {
    return this.dirty.size;
  }

  async flush(): Promise<number> {
    let written = 0;
    for (const [dosPath, bytes] of this.dirty) {
      for (const m of this.mirrors) {
        if (dosPath === m.dos || dosPath.startsWith(m.dos + "/")) {
          const relative = dosPath.slice(m.dos.length).replace(/^\//, "");
          const hostFile = path.join(m.host, relative);
          fs.mkdirSync(path.dirname(hostFile), { recursive: true });
          fs.writeFileSync(hostFile, bytes);
          written++;
          break;
        }
      }
    }
    this.dirty.clear();
    return written;
  }
}
