import type { Backend } from "../backend/index.js";
import { loadBundleTool, shutdownTool, waitTool } from "./session.js";
import {
  sendKeysTool,
  sendKeySequenceTool,
  sendClickTool,
  moveMouseTool,
} from "./input.js";
import { screenshotTool, getStatusTool } from "./observe.js";
import {
  fsReadTool,
  fsWriteTool,
  fsListTool,
  fsStatTool,
  fsDeleteTool,
  fsPushDirTool,
  fsPullDirTool,
  fsSyncTool,
} from "./fs.js";

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
  screenshotTool,
  getStatusTool,
  fsReadTool,
  fsWriteTool,
  fsListTool,
  fsStatTool,
  fsDeleteTool,
  fsPushDirTool,
  fsPullDirTool,
  fsSyncTool,
];
