import * as fs from "node:fs";
import * as path from "node:path";

export type BundleKind = "directory" | "zip" | "jsdos";

export function detectBundleSource(sourcePath: string): BundleKind {
  let stat;
  try {
    stat = fs.statSync(sourcePath);
  } catch {
    throw new Error(`bundle source not found: ${sourcePath}`);
  }
  if (stat.isDirectory()) return "directory";

  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === ".zip") return "zip";
  if (ext === ".jsdos") return "jsdos";

  throw new Error(`unsupported bundle format for ${sourcePath} (supported: directory, .zip, .jsdos)`);
}
