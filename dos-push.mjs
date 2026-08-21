#!/usr/bin/env node
// Copy a save from the host into a running dos-mcp session, without restarting it.
//
//   node dos-push.mjs <dir> [slot]
//
// Every file in <dir> is written into <slot> (default SAVE1) of the emulated filesystem.
// Reload the slot from the game's own menu afterwards to pick it up. Useful for bisecting
// a save the game rejects: edit bytes on the host, push, reload, repeat.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { attach, readDosFile, writeDosFile } from "./dos-attach.mjs";

const dir = process.argv[2];
const slot = process.argv[3] ?? "SAVE1";
if (!dir) {
  console.error("usage: node dos-push.mjs <dir> [slot]");
  process.exit(2);
}

if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`not a directory: ${dir}`);
  process.exit(2);
}

const files = readdirSync(dir).filter((f) => statSync(`${dir}/${f}`).isFile());
if (!files.length) {
  console.error(`nothing to push: ${dir} has no files`);
  process.exit(2);
}

const { page, done } = await attach();
try {
  for (const f of files) {
    const bytes = readFileSync(`${dir}/${f}`);
    await writeDosFile(page, `${slot}/${f}`, bytes);

    // A write into a slot the game has never created reports success and does nothing,
    // so read it back. A silent no-op here would quietly invalidate a bisection.
    const back = await readDosFile(page, `${slot}/${f}`);
    if (!back || back.length !== bytes.length) {
      throw new Error(
        `${slot}/${f} did not land (wrote ${bytes.length}, read back ` +
          `${back ? back.length : "nothing"}). Does ${slot} exist in the guest? ` +
          `Save to that slot once from inside the game first.`
      );
    }
    console.log(`  ${slot}/${f}  ${bytes.length}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  await done();
  process.exit(1);
} finally {
  await done();
}
console.log(`pushed ${files.length} file(s) from ${dir} into ${slot}`);
