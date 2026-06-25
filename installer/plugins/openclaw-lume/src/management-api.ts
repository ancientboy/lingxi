/**
 * Lume 管理类原生能力 — skills / workflow / health / 文件
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { GatewayApiConfig } from "./gateway-api.js";
import { callGatewayMethod } from "./gateway-api.js";

const SKILLS_DIR = path.join(os.homedir(), ".openclaw", "workspace", "skills");
const WORKFLOW_DIR = path.join(
  os.homedir(),
  ".openclaw",
  "workspace",
  "skills",
  "workflow-hub",
  "workflows",
);

const NATIVE_FILE_ROOTS = [
  path.join(os.homedir(), ".openclaw", "workspace"),
  path.join(os.homedir(), ".openclaw"),
];

function safeResolve(userPath: string): string | null {
  const expanded = userPath.startsWith("~")
    ? path.join(os.homedir(), userPath.slice(1))
    : userPath;
  const resolved = path.resolve(expanded);
  for (const root of NATIVE_FILE_ROOTS) {
    const rootResolved = path.resolve(root);
    if (resolved === rootResolved || resolved.startsWith(rootResolved + path.sep)) {
      return resolved;
    }
  }
  return null;
}

export async function listInstalledSkills(): Promise<Record<string, unknown>> {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => !n.startsWith("."));
  } catch {
    entries = [];
  }
  const skills = entries.map((id) => ({ id, name: id }));
  return { total: skills.length, skills };
}

export async function listWorkflows(): Promise<Record<string, unknown>> {
  const workflows: Record<string, unknown>[] = [];
  try {
    const files = fs.readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(WORKFLOW_DIR, file), "utf8");
        const wf = JSON.parse(raw) as Record<string, unknown>;
        workflows.push({
          id: wf.id ?? file.replace(/\.json$/, ""),
          name: wf.name ?? wf.id,
          description: wf.description ?? "",
          mode: wf.mode,
          agents: wf.agents ?? [],
          estimatedDuration: wf.estimatedDuration,
          steps: (wf.steps as unknown[]) ?? [],
        });
      } catch {
        /* skip bad file */
      }
    }
  } catch {
    /* empty */
  }
  return { success: true, workflows };
}

export async function readWorkflow(workflowId: string): Promise<Record<string, unknown>> {
  const safeId = workflowId.replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = path.join(WORKFLOW_DIR, `${safeId}.json`);
  if (!filePath.startsWith(WORKFLOW_DIR)) {
    throw new Error("Invalid workflow id");
  }
  const content = fs.readFileSync(filePath, "utf8");
  return { id: safeId, content, workflow: JSON.parse(content) };
}

export async function writeWorkflow(
  workflowId: string,
  content: string,
): Promise<Record<string, unknown>> {
  const safeId = workflowId.replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = path.join(WORKFLOW_DIR, `${safeId}.json`);
  if (!filePath.startsWith(WORKFLOW_DIR)) {
    throw new Error("Invalid workflow id");
  }
  JSON.parse(content);
  fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return { success: true, id: safeId };
}

export async function fetchHealthStatus(
  cfg: GatewayApiConfig,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ts: new Date().toISOString() };
  try {
    out.health = await callGatewayMethod(cfg, "health", {});
  } catch (e) {
    out.health = { ok: false, error: String(e) };
  }
  try {
    out.status = await callGatewayMethod(cfg, "status", {});
  } catch (e) {
    out.status = { ok: false, error: String(e) };
  }
  return out;
}

export async function listNativeFiles(dirPath: string): Promise<Record<string, unknown>> {
  const resolved = safeResolve(dirPath || "~/.openclaw/workspace");
  if (!resolved) throw new Error("Path not allowed");
  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  const files = entries.map((e) => ({
    name: e.name,
    path: path.join(resolved, e.name),
    isDirectory: e.isDirectory(),
  }));
  return { path: resolved, files };
}

export async function readNativeFile(filePath: string): Promise<Record<string, unknown>> {
  const resolved = safeResolve(filePath);
  if (!resolved) throw new Error("Path not allowed");
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) throw new Error("Path is a directory");
  if (stat.size > 5 * 1024 * 1024) throw new Error("File too large (>5MB)");
  return {
    path: resolved,
    content: fs.readFileSync(resolved, "utf8"),
    size: stat.size,
  };
}

export async function sendNativeNotify(
  title: string,
  body: string,
): Promise<Record<string, unknown>> {
  console.log(`[Lume native.notify] ${title}: ${body}`);
  return { success: true, title, body };
}
