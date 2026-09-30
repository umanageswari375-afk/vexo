import type { FileMap } from "./projects";

const MAX_FILES = 400;
const MAX_FILE_BYTES = 512 * 1024;

type Session = {
  port: number;
  status: "running" | "error" | "stopped";
  url: string | null;
  logs: string[];
  proc?: { kill: () => void };
  startedAt: number;
};

// Kept on globalThis so the session survives route-module reloads in dev.
const g = globalThis as unknown as { __vexoRuntime?: Map<string, Session> };
const sessions = (g.__vexoRuntime ??= new Map<string, Session>());

export type RunResult = {
  ok: boolean;
  available: boolean;
  sessions: { port: number; status: string; url: string | null; age: number }[];
  online: boolean;
  logs: string[];
  message?: string;
};

/** Rejects traversal and absolute paths before anything touches the filesystem. */
function safePath(rel: string): string | null {
  if (!rel || rel.startsWith("/") || rel.includes("\0")) return null;
  const parts = rel.split(/[\\/]+/);
  if (parts.some((p) => p === ".." || p === "")) return null;
  return parts.join("/");
}

async function loadFs() {
  // node:fs is unavailable on edge runtimes; callers fall back to the sandbox.
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  return { fs, os, path };
}

export async function runtimeAvailable(): Promise<boolean> {
  try {
    await loadFs();
    await import("node:child_process");
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(files: FileMap, id: string) {
  const { fs, os, path } = await loadFs();
  const root = path.join(os.tmpdir(), "vexo-runner", id.replace(/[^\w.-]/g, "_"));
  await fs.mkdir(root, { recursive: true });
  const entries = Object.entries(files).slice(0, MAX_FILES);
  for (const [rel, content] of entries) {
    const safe = safePath(rel);
    if (!safe) continue;
    const body = content.length > MAX_FILE_BYTES ? content.slice(0, MAX_FILE_BYTES) : content;
    const full = path.join(root, safe);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body, "utf8");
  }
  return root;
}

function freePort(): number {
  return 14000 + Math.floor(Math.random() * 2000);
}

/** True when package.json declares any dependency worth installing. */
async function hasDependencies(root: string): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    const pkg = JSON.parse(await fs.readFile(`${root}/package.json`, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return (
      Object.keys(pkg.dependencies ?? {}).length > 0 ||
      Object.keys(pkg.devDependencies ?? {}).length > 0
    );
  } catch {
    return false;
  }
}

/** True when node_modules is absent or older than package.json / its lockfile. */
async function needsInstall(root: string): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    const modules = `${root}/node_modules`;
    const installedAt = (await fs.stat(modules)).mtimeMs;
    for (const f of [
      "package.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "bun.lock",
    ]) {
      try {
        const s = await fs.stat(`${root}/${f}`);
        if (s.mtimeMs > installedAt) return true;
      } catch {
        /* no such lockfile */
      }
    }
    return false;
  } catch {
    return true;
  }
}

async function waitForServer(port: number, timeoutMs = 45000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
      if (r.status < 500) return true;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

/** Detects an explicit port in the process output, so logs show the real link. */
function detectPort(text: string, fallback: number): number {
  const m =
    text.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/) ??
    text.match(/--port[= ](\d{2,5})/) ??
    text.match(/port\s+(\d{2,5})/i);
  return m?.[1] ? Number(m[1]) : fallback;
}

/** True when the project has a package.json at all. */
async function hasPackageJson(root: string): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    await fs.access(`${root}/package.json`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Minimal static file server used when a project has no package.json, so that
 * plain HTML/CSS/JS projects still produce a real localhost link.
 */
const STATIC_SERVER = `import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const root = process.argv[2];
const port = Number(process.argv[3]);
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain" };
createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = join(root, normalize(url).replace(/^(\\.\\.[\\/\\\\])+/, ""));
    try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); }
    catch { file = join(file, "index.html"); }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log("static server on http://localhost:" + port));`;

export async function runProject(
  id: string,
  files: FileMap,
  script: string,
  onLog: (line: string) => void,
): Promise<RunResult> {
  const empty: RunResult = {
    ok: false,
    available: false,
    sessions: [],
    online: false,
    logs: [],
    message: "Real execution is not available on this runtime.",
  };
  if (!(await runtimeAvailable())) return empty;
  const { exec } = await import("node:child_process");
  const root = await ensureDir(files, id);
  const prev = sessions.get(id);
  if (prev?.proc) {
    try {
      prev.proc.kill();
    } catch {
      /* already gone */
    }
  }
  const logs: string[] = [];
  const log = (line: string) => {
    if (!line.trim()) return;
    logs.push(line);
    if (logs.length > 400) logs.shift();
    onLog(line);
  };

  const npmScript = script === "start" || script === "dev" || script === "preview" ? script : "dev";

  // No package.json means a plain HTML/CSS/JS project: serve it with a real static server
  // so the terminal still prints a genuine localhost link instead of only a preview.
  if (!(await hasPackageJson(root))) {
    const staticPort = freePort();
    log("> serving static files (no package.json found)");
    // Written to a file rather than passed via -e, so shell escaping can't corrupt it.
    const fs = await import("node:fs/promises");
    const scriptPath = `${root}/.vexo-static-server.mjs`;
    await fs.writeFile(scriptPath, STATIC_SERVER, "utf8");
    const srv = exec(`node ${JSON.stringify(scriptPath)} ${JSON.stringify(root)} ${staticPort}`, {
      cwd: root,
      timeout: 300000,
      maxBuffer: 1024 * 1024,
    });
    srv.stdout?.on("data", (d: Buffer) => String(d).split("\n").forEach(log));
    srv.stderr?.on("data", (d: Buffer) => String(d).split("\n").forEach(log));
    srv.on("error", (e) => log(`error: ${e.message}`));
    const startPort = staticPort;
    const session: Session = {
      port: startPort,
      status: "running",
      url: `http://localhost:${startPort}`,
      logs,
      proc: { kill: () => srv.kill() },
      startedAt: Date.now(),
    };
    sessions.set(id, session);
    const up = await waitForServer(startPort);
    session.status = up ? "running" : "error";
    log(up ? `ready — ${session.url}` : "server did not start (see logs above)");
    return {
      ok: up,
      available: true,
      online: true,
      logs,
      sessions: listSessions(id, false),
      message: up ? `Server running at ${session.url}` : "Server failed to start",
    };
  }

  // A fresh project has no node_modules, so `npm run dev` would fail with a missing
  // binary. Install the declared dependencies first (only when they aren't there yet).
  if ((await hasDependencies(root)) && !(await needsInstall(root))) {
    log("dependencies already installed");
  } else if (await hasDependencies(root)) {
    log("> installing dependencies…");
    const installed = await new Promise<boolean>((resolve) => {
      const c = exec("npm install --no-audit --no-fund", {
        cwd: root,
        timeout: 300000,
        maxBuffer: 1024 * 1024,
      });
      c.stdout?.on("data", (d: Buffer) => String(d).split("\n").forEach(log));
      c.stderr?.on("data", (d: Buffer) => String(d).split("\n").forEach(log));
      c.on("close", (code) => resolve(code === 0));
      c.on("error", (e) => {
        log(`install error: ${e.message}`);
        resolve(false);
      });
    });
    if (!installed) {
      return {
        ok: false,
        available: true,
        online: true,
        logs,
        sessions: listSessions(id, false),
        message: "npm install failed — see the terminal output above.",
      };
    }
  }

  const port = freePort();
  log(`> ${npmScript} (in ${root})`);
  const child = exec(`npm run ${npmScript} -- --host 127.0.0.1 --port ${port}`, {
    cwd: root,
    timeout: 300000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, PORT: String(port) },
  });
  child.stdout?.on("data", (d: Buffer) => String(d).split("\n").forEach(log));
  child.stderr?.on("data", (d: Buffer) => String(d).split("\n").forEach(log));
  child.on("error", (e) => log(`error: ${e.message}`));

  const session: Session = {
    port,
    status: "running",
    url: `http://localhost:${port}`,
    logs,
    proc: { kill: () => child.kill() },
    startedAt: Date.now(),
  };
  sessions.set(id, session);

  const up = await waitForServer(port);
  const realPort = detectPort(logs.join("\n"), port);
  if (realPort !== port) session.port = realPort;
  session.url = `http://localhost:${session.port}`;
  session.status = up ? "running" : "error";
  log(up ? `ready — ${session.url}` : "server did not start (see logs above)");

  return {
    ok: up,
    available: true,
    online: true,
    logs,
    sessions: listSessions(id, false),
    message: up ? `Server running at ${session.url}` : "Server failed to start",
  };
}

/** Installs dependencies with real npm; streams progress through onLog. */
export async function installDeps(
  id: string,
  files: FileMap,
  onLog: (line: string) => void,
): Promise<RunResult> {
  if (!(await runtimeAvailable()))
    return {
      ok: false,
      available: false,
      sessions: [],
      online: false,
      logs: [],
      message: "Real install is not available on this runtime.",
    };
  const { exec } = await import("node:child_process");
  const root = await ensureDir(files, id);
  const logs: string[] = [];
  const log = (l: string) => {
    if (l.trim()) {
      logs.push(l);
      onLog(l);
    }
  };
  const ok = await new Promise<boolean>((resolve) => {
    const c = exec("npm install --no-audit --no-fund", {
      cwd: root,
      timeout: 300000,
      maxBuffer: 1024 * 1024,
    });
    c.stdout?.on("data", (d: Buffer) => String(d).split("\n").forEach(log));
    c.stderr?.on("data", (d: Buffer) => String(d).split("\n").forEach(log));
    c.on("close", (code) => resolve(code === 0));
    c.on("error", (e) => {
      log(`error: ${e.message}`);
      resolve(false);
    });
  });
  return {
    ok,
    available: true,
    online: true,
    logs,
    sessions: listSessions(id, false),
    message: ok ? "Dependencies installed." : "npm install failed",
  };
}

export function listSessions(id: string, online = true) {
  const s = sessions.get(id);
  if (!s) return [];
  return [{ port: s.port, status: s.status, url: s.url, age: Date.now() - s.startedAt, online }];
}

export function stopSession(id: string) {
  const s = sessions.get(id);
  if (!s) return;
  try {
    s.proc?.kill();
  } catch {
    /* already gone */
  }
  sessions.delete(id);
}

export function sessionUrl(id: string): string | null {
  const s = sessions.get(id);
  return s && s.status === "running" ? s.url : null;
}
