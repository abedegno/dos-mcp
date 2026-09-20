import { describe, it, expect } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");

/**
 * Everything else in this suite tests the repository. This tests the package a
 * stranger receives: pack it, install the tarball into an empty project, and talk
 * to the installed binary over stdio.
 *
 * PUPPETEER_SKIP_DOWNLOAD is set for the consumer install because Puppeteer would
 * otherwise fetch about 560 MB of Chrome. Nothing here launches a browser, so the
 * download would be pure cost.
 */
describe("published package", () => {
  it("installs from a tarball and answers an MCP initialize", async () => {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "dos-mcp-pack-"));
    try {
      const packed = execFileSync("npm", ["pack", "--pack-destination", staging], {
        cwd: REPO,
        encoding: "utf8",
      });
      const tarball = path.join(staging, packed.trim().split("\n").pop()!.trim());
      expect(fs.existsSync(tarball)).toBe(true);

      const consumer = path.join(staging, "consumer");
      fs.mkdirSync(consumer);
      fs.writeFileSync(
        path.join(consumer, "package.json"),
        JSON.stringify({ name: "consumer", version: "1.0.0", private: true })
      );
      execFileSync("npm", ["install", "--no-audit", "--no-fund", tarball], {
        cwd: consumer,
        stdio: "ignore",
        env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "true" },
      });

      // The emulator must travel with the package. This is the regression that would
      // silently reintroduce "build a fork yourself".
      const emulators = path.join(consumer, "node_modules", "emulators", "dist", "emulators.js");
      expect(fs.existsSync(emulators)).toBe(true);

      const binLink = path.join(consumer, "node_modules", ".bin", "dos-mcp");
      expect(fs.existsSync(binLink)).toBe(true);

      // resolveJsDosSource() is the one thing this branch changed, and initialize
      // never reaches connect(), so it is never exercised by the JSON-RPC exchange
      // below. Prove separately, in the installed layout, that it resolves to the
      // package rather than silently falling through to nothing.
      const probe = path.join(consumer, "probe.mjs");
      fs.writeFileSync(
        probe,
        `import { resolveJsDosSource } from "dos-mcp/dist/backend/jsdos.js";\n` +
          `const src = resolveJsDosSource();\n` +
          `console.log(JSON.stringify(src));\n`
      );
      const probeOut = execFileSync(process.execPath, [probe], { cwd: consumer, encoding: "utf8" });
      const resolved = JSON.parse(probeOut.trim());
      expect(resolved.origin).toBe("package");
      expect(resolved.dir).toContain("emulators");

      const child = spawn(binLink, [], { stdio: ["pipe", "pipe", "pipe"] });
      try {
        const reply = await new Promise<string>((resolve, reject) => {
          let out = "";
          let err = "";
          const timer = setTimeout(
            () => reject(new Error(`no response in 30s.\nstdout: ${out}\nstderr: ${err}`)),
            30_000
          );
          child.stdout.on("data", d => {
            out += String(d);
            if (out.includes('"result"')) {
              clearTimeout(timer);
              resolve(out);
            }
          });
          child.stderr.on("data", d => (err += String(d)));
          child.on("error", e => {
            clearTimeout(timer);
            reject(e);
          });
          child.stdin.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "acceptance", version: "0" },
              },
            }) + "\n"
          );
        });
        expect(reply).toContain('"result"');
        expect(reply).toContain('"serverInfo"');
      } finally {
        child.kill("SIGTERM");
      }
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }, 300_000);
});
