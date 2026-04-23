/**
 * Normalise a DOS path to the canonical form used by dos-mcp tools:
 *   - Drive letter uppercased (C:)
 *   - Forward slashes only
 *   - Filenames uppercased (DOS case semantics)
 *   - Duplicate slashes collapsed
 *   - Paths without a drive letter default to C:
 */
export function normalizeDosPath(input: string): string {
  let p = input.replace(/\\/g, "/");
  p = p.replace(/\/+/g, "/");

  const driveMatch = p.match(/^([A-Za-z]):(.*)$/);
  let drive: string;
  let rest: string;
  if (driveMatch) {
    drive = driveMatch[1].toUpperCase();
    rest = driveMatch[2];
  } else {
    drive = "C";
    rest = p;
  }

  if (!rest.startsWith("/")) rest = "/" + rest;
  rest = rest.toUpperCase();

  return `${drive}:${rest}`;
}

export function dosPathToUnix(input: string): string {
  const n = normalizeDosPath(input);
  return n.replace(/^[A-Z]:/, "");
}

export function splitDosPath(input: string): { drive: string; segments: string[] } {
  const n = normalizeDosPath(input);
  const m = n.match(/^([A-Z]):\/(.*)$/);
  if (!m) throw new Error(`invalid DOS path: ${input}`);
  const drive = m[1];
  const rest = m[2];
  const segments = rest === "" ? [] : rest.split("/");
  return { drive, segments };
}
