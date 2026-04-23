import type { Backend } from "../backend";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
  handler: (backend: Backend, args: unknown) => Promise<unknown>;
}

/** Registered at server startup. Tools added in later tasks. */
export const tools: ToolDef[] = [];
