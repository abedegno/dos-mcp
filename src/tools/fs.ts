import * as fs from "node:fs";
import * as path from "node:path";
import type { Backend } from "../backend";
import type { ToolDef } from "./index";
import { normalizeDosPath } from "../paths";

function requireString(v: unknown, name: string): string {
  if (typeof v !== "string") throw new Error(`${name} (string) required`);
  return v;
}

export const fsReadTool: ToolDef = {
  name: "fs_read",
  description: "Read a file from the virtual DOS FS.",
  inputSchema: {
    type: "object",
    required: ["dos_path"],
    properties: { dos_path: { type: "string" } },
  },
  async handler(backend: Backend, args: unknown) {
    const p = requireString((args as any).dos_path, "dos_path");
    const buf = await backend.fsRead(p);
    return { bytes_base64: buf.toString("base64"), size: buf.length };
  },
};

export const fsWriteTool: ToolDef = {
  name: "fs_write",
  description: "Write a file to the virtual DOS FS.",
  inputSchema: {
    type: "object",
    required: ["dos_path", "bytes_base64"],
    properties: {
      dos_path: { type: "string" },
      bytes_base64: { type: "string" },
    },
  },
  async handler(backend: Backend, args: unknown) {
    const a = args as { dos_path?: unknown; bytes_base64?: unknown };
    const p = requireString(a.dos_path, "dos_path");
    const b = requireString(a.bytes_base64, "bytes_base64");
    await backend.fsWrite(p, Buffer.from(b, "base64"));
    return { ok: true };
  },
};

export const fsListTool: ToolDef = {
  name: "fs_list",
  description: "List a directory in the virtual DOS FS.",
  inputSchema: {
    type: "object",
    required: ["dos_path"],
    properties: { dos_path: { type: "string" } },
  },
  async handler(backend: Backend, args: unknown) {
    const p = requireString((args as any).dos_path, "dos_path");
    const entries = await backend.fsList(p);
    return entries.map(e => ({ name: e.name, size: e.size, is_dir: e.isDir }));
  },
};

export const fsDeleteTool: ToolDef = {
  name: "fs_delete",
  description: "Delete a file or empty dir from the virtual DOS FS.",
  inputSchema: {
    type: "object",
    required: ["dos_path"],
    properties: { dos_path: { type: "string" } },
  },
  async handler(backend: Backend, args: unknown) {
    const p = requireString((args as any).dos_path, "dos_path");
    await backend.fsDelete(p);
    return { ok: true };
  },
};

/** Recursively copy a host dir into the virtual DOS FS via backend.fsWrite. */
export const fsPushDirTool: ToolDef = {
  name: "fs_push_dir",
  description: "Recursively copy a host directory into the virtual DOS FS.",
  inputSchema: {
    type: "object",
    required: ["host_path", "dos_path"],
    properties: {
      host_path: { type: "string" },
      dos_path: { type: "string" },
    },
  },
  async handler(backend: Backend, args: unknown) {
    const a = args as { host_path?: unknown; dos_path?: unknown };
    const host = requireString(a.host_path, "host_path");
    const dos = normalizeDosPath(requireString(a.dos_path, "dos_path"));

    let fileCount = 0;
    let bytesWritten = 0;
    const walk = async (hostDir: string, dosPrefix: string) => {
      for (const entry of fs.readdirSync(hostDir, { withFileTypes: true })) {
        const hostChild = path.join(hostDir, entry.name);
        const dosChild = dosPrefix + "/" + entry.name;
        if (entry.isDirectory()) {
          await walk(hostChild, dosChild);
        } else if (entry.isFile()) {
          const bytes = fs.readFileSync(hostChild);
          await backend.fsWrite(dosChild, bytes);
          fileCount++;
          bytesWritten += bytes.length;
        }
      }
    };
    await walk(host, dos.replace(/\/$/, ""));
    return { file_count: fileCount, bytes_written: bytesWritten };
  },
};

/** Recursively copy a virtual DOS FS subtree to a host directory. */
export const fsPullDirTool: ToolDef = {
  name: "fs_pull_dir",
  description: "Recursively copy a virtual DOS FS subtree to a host directory.",
  inputSchema: {
    type: "object",
    required: ["dos_path", "host_path"],
    properties: {
      dos_path: { type: "string" },
      host_path: { type: "string" },
    },
  },
  async handler(backend: Backend, args: unknown) {
    const a = args as { dos_path?: unknown; host_path?: unknown };
    const dos = normalizeDosPath(requireString(a.dos_path, "dos_path"));
    const host = requireString(a.host_path, "host_path");

    fs.mkdirSync(host, { recursive: true });
    let fileCount = 0;
    let bytesRead = 0;

    const walk = async (dosPrefix: string, hostDir: string) => {
      const entries = await backend.fsList(dosPrefix);
      for (const e of entries) {
        const dosChild = dosPrefix.replace(/\/$/, "") + "/" + e.name;
        const hostChild = path.join(hostDir, e.name);
        if (e.isDir) {
          fs.mkdirSync(hostChild, { recursive: true });
          await walk(dosChild, hostChild);
        } else {
          const bytes = await backend.fsRead(dosChild);
          fs.writeFileSync(hostChild, bytes);
          fileCount++;
          bytesRead += bytes.length;
        }
      }
    };
    await walk(dos, host);
    return { file_count: fileCount, bytes_read: bytesRead };
  },
};

export const fsSyncTool: ToolDef = {
  name: "fs_sync",
  description: "Flush any pending mirrored writes to their host directories.",
  inputSchema: { type: "object", properties: {} },
  async handler(backend: Backend, _args: unknown) {
    const r = await backend.fsSync();
    return { mirrors_flushed: r.mirrorsFlushed };
  },
};
