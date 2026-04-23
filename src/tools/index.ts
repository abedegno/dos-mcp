import type { Backend } from "../backend";
import { loadBundleTool, shutdownTool, waitTool } from "./session";
import {
  sendKeysTool,
  sendKeySequenceTool,
  sendClickTool,
  moveMouseTool,
} from "./input";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
  handler: (backend: Backend, args: unknown) => Promise<unknown>;
}

export const tools: ToolDef[] = [
  loadBundleTool,
  shutdownTool,
  waitTool,
  sendKeysTool,
  sendKeySequenceTool,
  sendClickTool,
  moveMouseTool,
];
