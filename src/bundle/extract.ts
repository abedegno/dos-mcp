import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import yauzl from "yauzl";
import { normalizeDosPath } from "../paths";

const openZip = promisify<string, yauzl.Options, yauzl.ZipFile>(yauzl.open);

/**
 * Read a directory into an in-memory file tree keyed by canonical DOS path
 * (e.g. "C:/UW/DATA/LEV.ARK" -> Buffer).
 */
export async function extractDirectory(rootHostPath: string): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  const walk = (hostDir: string, dosPrefix: string) => {
    for (const entry of fs.readdirSync(hostDir, { withFileTypes: true })) {
      const hostChild = path.join(hostDir, entry.name);
      const dosChild = dosPrefix + "/" + entry.name;
      if (entry.isDirectory()) {
        walk(hostChild, dosChild);
      } else if (entry.isFile()) {
        out.set(normalizeDosPath(dosChild), fs.readFileSync(hostChild));
      }
    }
  };
  walk(rootHostPath, "C:");
  return out;
}

/**
 * Read a .zip or .jsdos file into an in-memory file tree.
 */
export async function extractZip(zipPath: string): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  const zip = await openZip(zipPath, { lazyEntries: true, autoClose: true });
  await new Promise<void>((resolve, reject) => {
    zip.on("entry", (entry: yauzl.Entry) => {
      if (entry.fileName.endsWith("/")) {
        zip.readEntry();
        return;
      }
      zip.openReadStream(entry, (err, readStream) => {
        if (err) return reject(err);
        const chunks: Buffer[] = [];
        readStream.on("data", (c: Buffer) => chunks.push(c));
        readStream.on("end", () => {
          out.set(normalizeDosPath("C:/" + entry.fileName), Buffer.concat(chunks));
          zip.readEntry();
        });
        readStream.on("error", reject);
      });
    });
    zip.on("end", () => resolve());
    zip.on("error", reject);
    zip.readEntry();
  });
  return out;
}
