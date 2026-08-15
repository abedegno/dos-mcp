// Static file server for the js-dos host page and, optionally, a locally built
// emulators dist.
//
// Why this exists: the page was loaded over file://, which forced two
// compromises. SharedArrayBuffer needed the --enable-features=SharedArrayBuffer
// flag because a file:// page is never cross-origin isolated, and a local js-dos
// build could not be fetched at all because file:// fetches are blocked. Serving
// over http://127.0.0.1 with COOP/COEP gives real cross-origin isolation and lets
// the page load a pinned local build.
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { AddressInfo } from "node:net";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".map": "application/json; charset=utf-8",
};

export interface StaticServer {
  origin: string;
  close: () => Promise<void>;
}

/**
 * Real path where it exists, else the input unchanged. Returning the input for a
 * missing path is safe: the caller's containment check still runs against it, and
 * a non-existent file is rejected by the existsSync test anyway.
 */
function canonical(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Serve `roots` as a set of URL-prefix to directory mappings, e.g.
 * `{ "/": pageDir, "/jsdos/": distDir }`. Longest prefix wins.
 */
export async function startStaticServer(
  roots: Record<string, string>,
  isolate = false
): Promise<StaticServer> {
  // Canonicalize the roots up front so the containment check below compares real
  // paths. A purely lexical check is defeated by a symlink inside the root.
  const entries = Object.entries(roots)
    .map(([prefix, dir]) => [prefix, canonical(resolve(dir))] as const)
    .sort((a, b) => b[0].length - a[0].length);

  const server: Server = createServer((req, res) => {
    // Cross-origin isolation gives SharedArrayBuffer properly rather than via a
    // Chromium flag, but require-corp also blocks any cross-origin subresource
    // that does not opt in. The js-dos CDN does not, so only isolate when every
    // asset is served from here, i.e. when a local build is in use.
    if (isolate) {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      // Malformed percent-encoding, e.g. /%ZZ. Without this the URIError is
      // uncaught and takes the whole server down.
      res.statusCode = 400;
      res.end("bad request");
      return;
    }

    for (const [prefix, dir] of entries) {
      if (!pathname.startsWith(prefix)) continue;
      const rel = pathname.slice(prefix.length) || "index.html";
      // Contain the resolved path inside dir so a crafted path cannot escape.
      // canonical() resolves symlinks, so a link inside dir pointing outside it
      // fails this check rather than being followed.
      const target = canonical(resolve(join(dir, normalize("/" + rel))));
      if (target !== dir && !target.startsWith(dir + sep)) break;
      if (!existsSync(target) || !statSync(target).isFile()) continue;
      res.setHeader(
        "Content-Type",
        MIME[extname(target).toLowerCase()] ?? "application/octet-stream"
      );
      createReadStream(target).pipe(res);
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((ok, err) =>
        server.close((e) => (e ? err(e) : ok()))
      ),
  };
}
