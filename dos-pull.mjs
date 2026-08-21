#!/usr/bin/env node
// Copy save slots out of a running dos-mcp session to the host.
//
//   node dos-pull.mjs <label> [outDir]
//
// Writes <outDir>/<label>/SAVE1/... . outDir defaults to ./dos-saves, or DOS_SAVES_DIR.
// Use this rather than restarting: a restart rebuilds the emulated filesystem from disk
// and loses whatever DOS wrote.
import { mkdirSync, writeFileSync } from "node:fs";
import { attach, readDosFile, SAVE_FILES, SAVE_SLOTS } from "./dos-attach.mjs";

const label = process.argv[2];
if (!label) {
  console.error("usage: node dos-pull.mjs <label> [outDir]");
  process.exit(2);
}
const outRoot = process.argv[3] ?? process.env.DOS_SAVES_DIR ?? "dos-saves";
const out = `${outRoot}/${label}`;

const { page, done } = await attach();
let pulled = 0;
try {
  for (const slot of SAVE_SLOTS) {
    for (const file of SAVE_FILES) {
      const bytes = await readDosFile(page, `${slot}/${file}`);
      if (!bytes) continue;
      mkdirSync(`${out}/${slot}`, { recursive: true });
      writeFileSync(`${out}/${slot}/${file}`, bytes);
      console.log(`  ${slot}/${file}  ${bytes.length}`);
      pulled++;
    }
  }
} finally {
  await done();
}
console.log(pulled ? `pulled ${pulled} file(s) -> ${out}` : "no save files found");
