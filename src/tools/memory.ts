import type { Backend } from "../backend/index.js";
import type { ToolDef } from "./index.js";

/** A single read is capped so a mistyped length cannot produce a 64MB payload. */
const MAX_READ_BYTES = 1024 * 1024;
const MAX_PATTERN_BYTES = 4096;
const DEFAULT_MAX_HITS = 8;

function optionalInt(v: unknown, name: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw new Error(`${name} must be an integer`);
  }
  return v;
}

/**
 * Resolve a physical address from either `address` or a `segment`/`offset` pair.
 *
 * Disassemblies quote real-mode `seg:off`, so accepting that directly avoids the
 * caller doing `seg * 16 + off` by hand every time and getting it wrong once.
 */
function resolveAddress(a: Record<string, unknown>): number {
  const address = optionalInt(a.address, "address");
  const segment = optionalInt(a.segment, "segment");
  const offset = optionalInt(a.offset, "offset");
  if (address !== undefined) {
    if (address < 0) throw new Error("address must not be negative");
    return address;
  }
  if (segment !== undefined && offset !== undefined) {
    if (segment < 0 || offset < 0) throw new Error("segment and offset must not be negative");
    return segment * 16 + offset;
  }
  throw new Error("either address, or both segment and offset, are required");
}

export const readMemoryTool: ToolDef = {
  name: "read_memory",
  description:
    "Read the guest's emulated DOS memory by physical address, or by real-mode segment:offset. " +
    "Read-only. Physical address is segment * 16 + offset, so a disassembly's seg:off can be " +
    "passed straight through. Returns base64.",
  inputSchema: {
    type: "object",
    required: ["length"],
    properties: {
      address: {
        type: "integer",
        description: "Physical address. Omit when passing segment and offset.",
      },
      segment: { type: "integer", description: "Real-mode segment, paired with offset." },
      offset: { type: "integer", description: "Real-mode offset, paired with segment." },
      length: { type: "integer", description: `Bytes to read, at most ${MAX_READ_BYTES}.` },
    },
  },
  async handler(backend: Backend, args: unknown) {
    const a = (args ?? {}) as Record<string, unknown>;
    const address = resolveAddress(a);
    const length = optionalInt(a.length, "length");
    if (length === undefined || length <= 0) {
      throw new Error("length must be a positive integer");
    }
    if (length > MAX_READ_BYTES) {
      throw new Error(`length must be at most ${MAX_READ_BYTES} bytes`);
    }
    const bytes = await backend.readMemory(address, length);
    return { address, length: bytes.length, bytes_base64: bytes.toString("base64") };
  },
};

export const searchMemoryTool: ToolDef = {
  name: "search_memory",
  description:
    "Scan the guest's emulated DOS memory for a byte pattern and return the physical addresses " +
    "where it occurs. Use this to locate a segment whose base is not known in advance, by " +
    "searching for content you already know is there. The scan runs beside the memory, so " +
    "nothing large is transferred.",
  inputSchema: {
    type: "object",
    required: ["pattern_base64"],
    properties: {
      pattern_base64: { type: "string", description: "Bytes to find, base64 encoded." },
      max_hits: { type: "integer", description: `Stop after this many hits (default ${DEFAULT_MAX_HITS}).` },
      start: { type: "integer", description: "Restrict the scan to addresses at or above this." },
      end: { type: "integer", description: "Restrict the scan to addresses below this." },
    },
  },
  async handler(backend: Backend, args: unknown) {
    const a = (args ?? {}) as Record<string, unknown>;
    if (typeof a.pattern_base64 !== "string" || a.pattern_base64.length === 0) {
      throw new Error("pattern_base64 (non-empty string) required");
    }
    const pattern = Buffer.from(a.pattern_base64, "base64");
    if (pattern.length === 0) {
      throw new Error("pattern_base64 decoded to zero bytes");
    }
    if (pattern.length > MAX_PATTERN_BYTES) {
      throw new Error(`pattern must be at most ${MAX_PATTERN_BYTES} bytes`);
    }
    const maxHits = optionalInt(a.max_hits, "max_hits") ?? DEFAULT_MAX_HITS;
    if (maxHits <= 0) throw new Error("max_hits must be a positive integer");
    const start = optionalInt(a.start, "start");
    const end = optionalInt(a.end, "end");
    if (start !== undefined && end !== undefined && end <= start) {
      throw new Error("end must be greater than start");
    }
    const result = await backend.searchMemory(pattern, { maxHits, start, end });
    return {
      hits: result.hits,
      hit_count: result.hits.length,
      scanned_bytes: result.scannedBytes,
    };
  },
};
