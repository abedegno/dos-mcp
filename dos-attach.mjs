// Attach to the Chromium that a running dos-mcp session already owns.
//
// The emulated DOS filesystem lives only inside that browser. Restarting the server
// rebuilds it from the host directory, which destroys anything DOS itself wrote, so
// reading a DOS-written save means attaching to the live process rather than relaunching.
//
// Puppeteer starts Chromium with --remote-debugging-port=0, so the port is ephemeral and
// has to be read from DevToolsActivePort inside its user data directory.
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

export function findDebugPort() {
  const line = execSync(
    "ps ax -o command= | grep -o -- '--user-data-dir=[^ ]*puppeteer_dev_chrome_profile[^ ]*' | head -1"
  )
    .toString()
    .trim();
  if (!line) throw new Error("no running dos-mcp browser found");
  const dir = line.split("=")[1];
  return readFileSync(`${dir}/DevToolsActivePort`, "utf8").split("\n")[0].trim();
}

/** Returns the js-dos page, plus a disconnect that leaves the session running. */
export async function attach() {
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${findDebugPort()}`,
    defaultViewport: null,
  });
  const page = (await browser.pages()).find((p) => p.url().includes("jsdos-page.html"));
  if (!page) {
    await browser.disconnect();
    throw new Error("connected, but no js-dos page in that browser");
  }
  return { browser, page, done: () => browser.disconnect() };
}

/** Read a file out of the emulated DOS filesystem. Returns null when absent. */
export async function readDosFile(page, dosPath) {
  const b64 = await page.evaluate(async (p) => {
    try {
      const bytes = await window.__dosmcp.ci.fsReadFile(p);
      let bin = "";
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
      }
      return btoa(bin);
    } catch {
      return null;
    }
  }, dosPath);
  return b64 === null ? null : Buffer.from(b64, "base64");
}

/** Write a file into the emulated DOS filesystem. */
export async function writeDosFile(page, dosPath, bytes) {
  const err = await page.evaluate(
    async (p, b64) => {
      try {
        await window.__dosmcp.ci.fsWriteFile(
          p,
          Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        );
        return null;
      } catch (e) {
        return String(e);
      }
    },
    dosPath,
    bytes.toString("base64")
  );
  if (err) throw new Error(`writing ${dosPath}: ${err}`);
}

/** Slot files are at the root of the mount, e.g. SAVE1/LEV.ARK, not C:\\GAME\\SAVE1. */
export const SAVE_FILES = ["LEV.ARK", "PLAYER.DAT", "BGLOBALS.DAT", "SCD.ARK", "DESC"];
export const SAVE_SLOTS = ["SAVE0", "SAVE1", "SAVE2", "SAVE3", "SAVE4"];
