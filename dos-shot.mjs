#!/usr/bin/env node
// Screenshot a running dos-mcp session, and tell whether the guest is still drawing.
//
//   node dos-shot.mjs [out.png]
//
// Two frames are taken a beat apart. DOSBox only pushes a frame when the screen actually
// changes, so identical frames mean idle or hung, not necessarily broken. To tell those
// apart, this also asks the emulator for its filesystem: an answer means the worker is
// still servicing messages, so a guest that ignores all input is hung on its own account
// rather than dead underneath.
import { attach } from "./dos-attach.mjs";
import { readFileSync } from "node:fs";

const out = process.argv[2] ?? "dos-shot.png";
const { page, done } = await attach();
try {
  await page.screenshot({ path: out });
  const first = readFileSync(out);
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: out });
  const second = readFileSync(out);

  const alive = await page.evaluate(async () => {
    try {
      return await Promise.race([
        window.__dosmcp.ci.fsTree().then(() => true),
        new Promise((res) => setTimeout(() => res(false), 5000)),
      ]);
    } catch {
      return false;
    }
  });

  console.log(`wrote ${out} (${second.length} bytes)`);
  console.log(first.equals(second) ? "frames identical: idle or hung" : "frames differ: still drawing");
  console.log(alive ? "emulator is servicing messages" : "emulator did not answer: worker is stuck");
} finally {
  await done();
}
