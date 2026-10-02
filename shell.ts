import type { FileMap } from "./projects";
import { resolvePath } from "./vexo-engine";

export type ShellCtx = {
  files: FileMap;
  cwd: string;
  projectId: string;
  setFiles: (f: FileMap) => void;
  setCwd: (c: string) => void;
  print: (text: string, kind?: "out" | "err" | "ok" | "info") => void;
  clear: () => void;
  openPreview: () => void;
  openUrl: (url: string) => void;
  askAgent: (prompt: string) => void;
};

/**
 * Runs a real command on the server when the Node runtime is available, streaming
 * output to the terminal. Falls back to the simulated shell on edge runtimes.
 */
async function serverRun(
  action: "run" | "install" | "stop" | "status",
  script: string,
  c: ShellCtx,
): Promise<boolean> {
  let token: string | undefined;
  try {
    const { getFirebase } = await import("./firebase");
    const { auth } = await getFirebase();
    token = await auth.currentUser?.getIdToken();
  } catch {
    /* not signed in */
  }
  let res: Response;
  try {
    res = await fetch("/api/runtime", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({ projectId: c.projectId, action, script, files: c.files }),
    });
  } catch {
    return false;
  }
  if (!res.ok || !res.body) {
    c.print(`runtime: ${await res.text().catch(() => "request failed")}`, "err");
    return true;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let handled = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line) as { type: string; data: Record<string, unknown> };
        handled = true;
        if (ev.type === "log") c.print(String(ev.data["line"] ?? ""));
        else if (ev.type === "unavailable") c.print(String(ev.data["message"] ?? ""), "info");
        else if (ev.type === "error") c.print(String(ev.data["message"] ?? ""), "err");
        else if (ev.type === "result") {
          const sessions =
            (ev.data["sessions"] as { port?: number; url?: string }[] | undefined) ?? [];
          const s0 = sessions[0];
          if (s0?.port) {
            sessionStorage.setItem("vexo:port:" + c.projectId, String(s0.port));
            const proxy = await proxyUrl(c.projectId, s0.port);
            if (action === "run") {
              c.print(`  ➜  Local:   ${proxy}`, "ok");
              if (s0.url) c.print(`  ➜  Direct:  ${s0.url}`, "info");
              c.openUrl(proxy);
            } else if (action === "status") {
              c.print(`  ➜  Local:   ${proxy}`, "ok");
            }
          }
          if (ev.data["message"]) c.print(String(ev.data["message"]), "info");
        }
      } catch {
        /* partial frame */
      }
    }
  }
  return handled;
}

/**
 * Establishes an authenticated proxy cookie, then returns the preview URL.
 * The cookie auths the iframe's own asset requests, so the URL stays clean.
 */
export async function proxyUrl(projectId: string, port: number): Promise<string> {
  try {
    const { getFirebase } = await import("./firebase");
    const { auth } = await getFirebase();
    const token = await auth.currentUser?.getIdToken();
    if (token)
      await fetch("/api/runtime-ticket", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      });
  } catch {
    /* not signed in */
  }
  return `${location.origin}/api/rt/${port}/`;
}

const HELP = `Vexo terminal — commands:
  ls [dir]              list files          cd <dir>        change directory
  pwd                   current directory   cat <file>      print file
  touch <file>          create file         mkdir <dir>     create folder
  rm [-r] <path>        delete              mv <a> <b>      rename/move
  echo <text> [> file]  print / write file  tree            show project tree
  node <file.js>        run a JS file       npm run dev     run the project (real)
  npm install [pkg]     install deps        link            show the running URL
  stop                  stop the server     clear           clear screen
  vexo <prompt>         ask the AI agent

Running the project: \`npm run dev\` writes the files to disk and starts a real
dev server, then prints the local URL and opens it in the preview.`;

const dirs = (files: FileMap) => {
  const s = new Set<string>([""]);
  for (const p of Object.keys(files)) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) s.add(parts.slice(0, i).join("/"));
  }
  return s;
};

export async function runCommand(line: string, c: ShellCtx) {
  const raw = line.trim();
  if (!raw) return;
  const [cmd, ...args] = raw
    .match(/"[^"]*"|'[^']*'|\S+/g)!
    .map((a) => a.replace(/^["']|["']$/g, "")) as [string, ...string[]];
  const abs = (p: string = "") => resolvePath(c.cwd ? c.cwd + "/x" : "x", p) ?? p;
  const D = dirs(c.files);

  switch (cmd) {
    case "help":
      return c.print(HELP, "info");
    case "clear":
    case "cls":
      return c.clear();
    case "pwd":
      return c.print("/" + c.cwd);
    case "ls": {
      const d = args[0] ? abs(args[0]) : c.cwd;
      if (!D.has(d)) return c.print(`ls: ${args[0]}: No such directory`, "err");
      const pre = d ? d + "/" : "";
      const items = new Set<string>();
      for (const p of Object.keys(c.files))
        if (p.startsWith(pre)) {
          const rest = p.slice(pre.length).split("/");
          const head = rest[0];
          if (head) items.add(rest.length > 1 ? head + "/" : head);
        }
      return c.print([...items].sort().join("  ") || "(empty)");
    }
    case "tree":
      return c.print(Object.keys(c.files).sort().join("\n") || "(empty project)");
    case "cd": {
      const d = !args[0] || args[0] === "/" || args[0] === "~" ? "" : abs(args[0]);
      if (!D.has(d)) return c.print(`cd: ${args[0]}: No such directory`, "err");
      return c.setCwd(d);
    }
    case "cat": {
      if (!args[0]) return c.print("cat: missing file", "err");
      const p = abs(args[0]);
      return c.files[p] != null
        ? c.print(c.files[p])
        : c.print(`cat: ${args[0]}: No such file`, "err");
    }
    case "touch": {
      if (!args[0]) return c.print("touch: missing file", "err");
      const p = abs(args[0]);
      if (c.files[p] == null) c.setFiles({ ...c.files, [p]: "" });
      return;
    }
    case "mkdir": {
      const p = abs(args.filter((a) => !a.startsWith("-"))[0] ?? "");
      if (!p) return c.print("mkdir: missing folder", "err");
      return c.setFiles({ ...c.files, [p + "/.gitkeep"]: "" });
    }
    case "rm": {
      const target = args.filter((a) => !a.startsWith("-"))[0];
      if (!target) return c.print("rm: missing path", "err");
      const p = abs(target ?? "");
      const next = { ...c.files };
      let n = 0;
      for (const k of Object.keys(next))
        if (k === p || k.startsWith(p + "/")) {
          delete next[k];
          n++;
        }
      if (!n) return c.print(`rm: ${target}: No such file`, "err");
      return c.setFiles(next);
    }
    case "mv": {
      if (args.length < 2) return c.print("mv: usage mv <from> <to>", "err");
      const a = abs(args[0]),
        b = abs(args[1]);
      const next: FileMap = {};
      let n = 0;
      for (const [k, v] of Object.entries(c.files)) {
        if (k === a) {
          next[b] = v;
          n++;
        } else if (k.startsWith(a + "/")) {
          next[b + k.slice(a.length)] = v;
          n++;
        } else next[k] = v;
      }
      if (!n) return c.print(`mv: ${args[0]}: No such file`, "err");
      return c.setFiles(next);
    }
    case "echo": {
      const gt = args.indexOf(">");
      if (gt >= 0 && args[gt + 1])
        return c.setFiles({
          ...c.files,
          [abs(args[gt + 1] ?? "")]: args.slice(0, gt).join(" ") + "\n",
        });
      return c.print(args.join(" "));
    }
    case "node": {
      if (!args[0]) return c.print("node: interactive REPL is not supported, pass a file", "err");
      const p = abs(args[0]);
      const src = c.files[p];
      if (src == null) return c.print(`node: cannot find '${args[0]}'`, "err");
      if (
        /require\(['"](express|http|fs|net)['"]\)|from ['"](express|http|node:http|fs|net)['"]|\.listen\(/.test(
          src,
        )
      ) {
        c.print(
          `⚠ ${args[0]} uses a server/filesystem API that can't run in the browser sandbox.`,
          "err",
        );
        c.print(
          "Export the project (Export button) and run `npm install && npm start` locally, or ask the agent for a browser demo.",
          "info",
        );
        return;
      }
      return runJs(src, c);
    }
    case "npm":
    case "pnpm":
    case "yarn":
    case "bun": {
      const sub = args[0];
      if (sub === "run" || sub === "start" || sub === "dev") {
        const script = sub === "run" ? args[1] : sub;
        if (script === "dev" || script === "start" || script === "preview") {
          // Prefer real execution: a genuine npm process with a real local URL.
          c.print(`> ${script}`, "info");
          if (await serverRun("run", script, c)) return;
          const hasHtml = Object.keys(c.files).some((p) => p.endsWith(".html"));
          const hasPkg = !!c.files["package.json"];
          if (hasPkg) {
            c.print(
              "A real dev server needs the Node runtime, which this hosting doesn't provide.",
              "err",
            );
            c.print(
              "The browser preview is showing the project instead. For a real npm server + localhost link, extract the project zip and run `npm install && npm run dev` on your machine.",
              "info",
            );
            if (hasHtml) return c.openPreview();
            return;
          }
          if (!hasHtml) {
            c.print(
              `No index.html found. This looks like a server project — use \`node <file>\` for scripts, or export to run locally.`,
              "err",
            );
            return;
          }
          c.print(`> vexo-dev-server\n  ➜  Local:   preview ready (opened in Preview)`, "ok");
          return c.openPreview();
        }
        return c.print(`npm: script "${script}" not found`, "err");
      }
      if (sub === "install" || sub === "i" || sub === "add") {
        const pkgs = args.slice(1).filter((a) => !a.startsWith("-"));
        if (!pkgs.length) {
          c.print("> npm install", "info");
          if (await serverRun("install", "install", c)) return;
          c.print("up to date — browser projects load packages from esm.sh CDN at runtime.", "ok");
          return;
        }
        let pkg: { dependencies?: Record<string, string> } = {};
        try {
          pkg = JSON.parse(c.files["package.json"] ?? "{}");
        } catch {
          return c.print("npm: package.json is not valid JSON", "err");
        }
        pkg.dependencies = { ...(pkg.dependencies ?? {}) };
        for (const name of pkgs) pkg.dependencies[name.replace(/@[^/@]*$/, "") || name] = "latest";
        const updated = {
          ...c.files,
          "package.json":
            JSON.stringify({ name: "vexo-project", version: "1.0.0", ...pkg }, null, 2) + "\n",
        };
        c.setFiles(updated);
        c.print(`added ${pkgs.length} package(s) to package.json`, "ok");
        if (await serverRun("install", "install", { ...c, files: updated })) return;
        c.print(`In the browser preview import them from https://esm.sh/<name>.`, "info");
        return;
      }
      return c.print(`npm ${sub ?? ""}: not available in the browser terminal`, "err");
    }
    case "link": {
      c.print("> checking running servers", "info");
      if (await serverRun("status", "status", c)) return;
      return c.print("No running server. Use `npm run dev` to start one.", "info");
    }
    case "stop": {
      if (await serverRun("stop", "stop", c)) {
        sessionStorage.removeItem("vexo:port:" + c.projectId);
        return c.print("Server stopped.", "ok");
      }
      return c.print("No running server.", "info");
    }
    case "vexo":
    case "ai": {
      if (!args.length) return c.print("usage: vexo <what to build or fix>", "err");
      c.print("→ sent to Vexo Agent", "info");
      return c.askAgent(args.join(" "));
    }
    default:
      return c.print(`${cmd}: command not found. Type 'help'.`, "err");
  }
}

function runJs(src: string, c: ShellCtx) {
  const fmt = (a: unknown[]) =>
    a.map((x) => (typeof x === "object" ? JSON.stringify(x, null, 2) : String(x))).join(" ");
  const con = {
    log: (...a: unknown[]) => c.print(fmt(a)),
    info: (...a: unknown[]) => c.print(fmt(a)),
    warn: (...a: unknown[]) => c.print(fmt(a), "err"),
    error: (...a: unknown[]) => c.print(fmt(a), "err"),
  };
  try {
    const code = src.replace(/^\s*import\s.*$/gm, "").replace(/^\s*export\s+(default\s+)?/gm, "");

    const fn = new Function("console", "process", "require", `"use strict";\n${code}`);
    const r = fn(con, { env: {}, argv: ["node"], exit: () => {} }, () => {
      throw new Error("require() is not available in the browser sandbox");
    });
    if (r instanceof Promise)
      r.catch((e: Error) => c.print(`Uncaught ${e?.name ?? "Error"}: ${e?.message ?? e}`, "err"));
  } catch (e) {
    const err = e as Error;
    c.print(`Uncaught ${err.name}: ${err.message}`, "err");
  }
}
