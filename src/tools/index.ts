import type { Backend } from "../backend";
import { loadBundleTool, shutdownTool, waitTool } from "./session";
import {
  sendKeysTool,
  sendKeySequenceTool,
  sendClickTool,
  moveMouseTool,
} from "./input";
import { screenshotTool, getStatusTool } from "./observe";
import {
  fsReadTool,
  fsWriteTool,
  fsListTool,
  fsDeleteTool,
  fsPushDirTool,
  fsPullDirTool,
  fsSyncTool,
} from "./fs";

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
  fsDeleteTool,
  fsPushDirTool,
  fsPullDirTool,
  fsSyncTool,
];
