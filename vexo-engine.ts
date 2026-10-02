import type { FileMap } from "./projects";

export type Op =
  | { type: "write"; path: string; content: string }
  | { type: "delete"; path: string }
  | { type: "command"; cmd: string }
  | { type: "image"; query: string; width: number; height: number };

export type ParseResult = {
  ops: Op[];
  prose: string;
  pending: string | null;
  /** The agent signalled it has more files to write; the caller should send a continuation. */
  more: boolean;
  /** The agent signalled the project is complete. */
  done: boolean;
  /** Local files referenced by the written code but not present in the project. */
  missing: string[];
};

const CTRL_RE = /<vexo-(more|done)\s*\/>/g;

export function parseAgent(text: string): ParseResult {
  const ops: Op[] = [];
  const re =
    /<vexo-file path="([^"]+)">\n?([\s\S]*?)<\/vexo-file>|<vexo-delete path="([^"]+)"\s*\/>|<vexo-command>([\s\S]*?)<\/vexo-command>|<vexo-image([^>]*?)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) ops.push({ type: "write", path: clean(m[1]), content: stripFence(m[2] ?? "") });
    else if (m[3]) ops.push({ type: "delete", path: clean(m[3]) });
    else if (m[4]) ops.push({ type: "command", cmd: m[4].trim() });
    else if (m[5] !== undefined) {
      const attrs = m[5];
      const attr = (n: string) =>
        attrs.match(new RegExp(`${n}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
      const num = (n: string, d: number) => {
        const v = Number(attr(n));
        return Number.isFinite(v) && v > 0 ? Math.min(Math.round(v), 2000) : d;
      };
      ops.push({
        type: "image",
        query: (attr("query") ?? attr("prompt") ?? "").trim(),
        width: num("width", 800),
        height: num("height", 600),
      });
    }
  }
  const open = text.match(/<vexo-file path="([^"]+)">(?![\s\S]*<\/vexo-file>)/);
  let prose = text
    .replace(re, "")
    .replace(CTRL_RE, "")
    .replace(/<vexo-file path="[^"]+">[\s\S]*$/, "")
    .trim();
  prose = prose.replace(/\n{3,}/g, "\n\n");
  const ctrl = new Set<string>();
  let c: RegExpExecArray | null;
  CTRL_RE.lastIndex = 0;
  while ((c = CTRL_RE.exec(text))) ctrl.add(c[1]!);
  return {
    ops,
    prose,
    pending: open ? clean(open[1] ?? "") : null,
    // `done` wins: a trailing done marker after a `more` marker means we're finished.
    more: ctrl.has("more") && !ctrl.has("done"),
    done: ctrl.has("done"),
    missing: [],
  };
}

/**
 * Finds local files that the code references but the project doesn't contain yet.
 * Catches the common case where the agent links a stylesheet or script it forgot to write.
 */
export function findMissing(files: FileMap): string[] {
  const missing = new Set<string>();
  const exists = (p: string) => {
    if (files[p] != null) return true;
    return [`${p}.js`, `${p}.jsx`, `${p}.css`, `${p}/index.js`, `${p}/index.jsx`].some(
      (c) => files[c] != null,
    );
  };
  for (const [path, src] of Object.entries(files)) {
    // JS/TS imports may be bare specifiers ("react", "express") that resolve to
    // installed packages; HTML/CSS references are always project-relative.
    const isModule = /\.(jsx?|tsx?)$/.test(path);
    const refs: string[] = [];
    if (path.endsWith(".html")) {
      for (const r of src.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) if (r[1]) refs.push(r[1]);
    } else if (isModule) {
      for (const r of src.matchAll(/from\s*["']([^"']+)["']/g)) if (r[1]) refs.push(r[1]);
      for (const r of src.matchAll(/import\s*["']([^"']+)["']/g)) if (r[1]) refs.push(r[1]);
    } else if (path.endsWith(".css")) {
      for (const r of src.matchAll(/@import\s+["']([^"']+)["']/g)) if (r[1]) refs.push(r[1]);
    }
    for (const ref of refs) {
      if (isModule && !ref.startsWith(".") && !ref.startsWith("/")) continue;
      const p = resolvePath(path, ref);
      if (p && !exists(p)) missing.add(p);
    }
  }
  return [...missing].slice(0, 12);
}

const clean = (p: string) => p.replace(/^\.?\//, "").trim();
function stripFence(s: string) {
  const t = s.replace(/\s+$/, "");
  const f = t.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  return (f ? f[1] : t) + "\n";
}

export function applyOps(files: FileMap, ops: Op[]): FileMap {
  const next = { ...files };
  for (const op of ops) {
    if (op.type === "write") next[op.path] = op.content;
    if (op.type === "delete") {
      for (const k of Object.keys(next))
        if (k === op.path || k.startsWith(op.path + "/")) delete next[k];
    }
  }
  return next;
}

/** Fetches every image op and returns them as project files (path -> data URL). */
export async function resolveImages(
  ops: Op[],
): Promise<{ files: FileMap; saved: { query: string; path: string }[] }> {
  const files: FileMap = {};
  const saved: { query: string; path: string }[] = [];
  for (const op of ops) {
    if (op.type !== "image") continue;
    try {
      const res = await fetch("/api/fetch-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: op.query, width: op.width, height: op.height }),
      });
      if (!res.ok) continue;
      const img = (await res.json()) as { path: string; dataUrl: string };
      if (img.path && img.dataUrl) {
        files[img.path] = img.dataUrl;
        saved.push({ query: op.query, path: img.path });
      }
    } catch {
      /* skip images that fail; never break the build over a picture */
    }
  }
  return { files, saved };
}

/** Resolve a relative reference from a file. */
export function resolvePath(from: string, ref: string) {
  if (/^(https?:|data:|blob:|\/\/)/.test(ref)) return null;
  const base = ref.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const part of (ref.replace(/^\//, "").split(/[?#]/)[0] ?? "").split("/")) {
    if (part === "..") base.pop();
    else if (part && part !== ".") base.push(part);
  }
  return base.join("/");
}

/**
 * Finds the file a reference points at, tolerating the ways imported projects differ
 * from the editor's layout: an extra top-level folder (e.g. a Replit zip), absolute
 * paths written against a server root, or a missing/mislocated index.html.
 * Without this, unresolved <script>/<link> tags keep their original URL and the
 * browser then tries to fetch it from the preview host, which fails CORS.
 */
export function resolveFile(files: FileMap, from: string, ref: string): string | null {
  const clean = ref.split(/[?#]/)[0] ?? "";
  if (!clean) return null;
  const exact = resolvePath(from, ref);
  if (exact && files[exact] != null) return exact;

  const target = clean.replace(/^\.?\//, "");
  if (!target) return null;
  const targetLower = target.toLowerCase();
  const base = target.split("/").pop()!.toLowerCase();

  // Once a top-level folder is stripped there is only one sensible candidate, so
  // prefer the shallowest path ending with the same relative reference.
  const endsWith = (k: string) => {
    const kl = k.toLowerCase();
    return kl === targetLower || kl.endsWith("/" + targetLower);
  };
  const byName = (k: string) => k.toLowerCase().endsWith("/" + base) || k.toLowerCase() === base;

  const keys = Object.keys(files);
  return (
    keys.find(endsWith) ??
    keys.filter(byName).sort((a, b) => a.split("/").length - b.split("/").length)[0] ??
    null
  );
}

const MIME: Record<string, string> = {
  js: "text/javascript",
  mjs: "text/javascript",
  jsx: "text/javascript",
  ts: "text/javascript",
  tsx: "text/javascript",
  css: "text/css",
  json: "application/json",
  svg: "image/svg+xml",
  html: "text/html",
};

/**
 * Builds a self-contained HTML document for the preview iframe:
 * local CSS/JS are inlined or served as blob URLs, and runtime errors are reported to the parent.
 */
export function buildPreview(
  files: FileMap,
  entry?: string,
): { html: string; urls: string[]; entry: string | null } {
  const htmlEntry =
    entry && files[entry]
      ? entry
      : (["index.html", "public/index.html", "src/index.html"].find((p) => files[p]) ??
        Object.keys(files).find((p) => p.endsWith(".html")));
  if (!htmlEntry) return { html: "", urls: [], entry: null };
  const urls: string[] = [];
  const blobFor = new Map<string, string>();
  const makeBlob = (path: string): string | null => {
    if (blobFor.has(path)) return blobFor.get(path)!;
    const src = files[path];
    if (src == null) return null;
    const ext = path.split(".").pop()!.toLowerCase();
    // Images added by upload are stored as data URLs; use them unchanged.
    if (src.startsWith("data:")) {
      blobFor.set(path, src);
      return src;
    }
    let code = src;
    if (["js", "mjs"].includes(ext)) {
      code = src.replace(
        /(import\s[^'"]*?from\s*|import\s*|export\s[^'"]*?from\s*)(['"])(\.{1,2}\/[^'"]+|\/[^'"]+)\2/g,
        (all, pre, q, ref) => {
          const r = resolvePath(path, ref);
          const u = r ? makeBlob(r) : null;
          return u ? `${pre}${q}${u}${q}` : all;
        },
      );
    }
    const url = `data:${MIME[ext] ?? "text/plain"};charset=utf-8,${encodeURIComponent(code)}`;
    urls.push(url);
    blobFor.set(path, url);
    return url;
  };

  let html = files[htmlEntry] ?? "";
  html = html.replace(/<link([^>]*?)href=["']([^"']+)["']([^>]*)>/gi, (all, a, href, b) => {
    // Only local stylesheets are inlined; external/CDN links are left alone.
    if (/^(https?:|data:|blob:|\/\/)/i.test(href)) return all;
    if (!/stylesheet/i.test(a + b)) return all;
    const p = resolveFile(files, htmlEntry, href);
    if (p) return `<style data-src="${p}">\n${files[p]}\n</style>`;
    // Unresolvable local stylesheet: drop it. Leaving the tag makes the preview
    // fetch it from the preview host, which fails CORS and spams the console.
    return "";
  });
  html = html.replace(
    /<script([^>]*?)src=["']([^"']+)["']([^>]*)><\/script>/gi,
    (all, a, src, b) => {
      if (/^(https?:|data:|blob:|\/\/)/i.test(src)) return all;
      const p = resolveFile(files, htmlEntry, src);
      if (!p) return ""; // see above: an unresolved local script can only fail.
      const attrs = `${a} ${b}`;
      if (/text\/babel/.test(attrs)) {
        // Babel standalone: inline the source and rewrite local imports to blob URLs of transpiled modules.
        return `<script${attrs.replace(/src=["'][^"']+["']/, "")} data-presets="react" data-file="${p}">\n${inlineBabel(files, p)}\n</script>`;
      }
      const u = makeBlob(p);
      return `<script${a}src="${u}"${b}></script>`;
    },
  );
  html = html.replace(
    /(src|href)=["'](?!https?:|data:|#|\/\/|blob:|mailto:)([^"']+\.(png|jpe?g|gif|svg|webp|ico))["']/gi,
    (all, attr, ref) => {
      const p = resolveFile(files, htmlEntry, ref);
      const u = p ? makeBlob(p) : null;
      return u ? `${attr}="${u}"` : all;
    },
  );

  const bridge = `<script>(function(){function send(t,m){try{parent.postMessage({__vexo:true,type:t,message:String(m)},"*")}catch(e){}}
window.addEventListener("error",function(e){send("error",(e.message||"Error")+(e.filename?" ("+e.filename.split("/").pop()+":"+e.lineno+")":""))});
window.addEventListener("unhandledrejection",function(e){send("error","Unhandled promise: "+(e.reason&&e.reason.message||e.reason))});
["log","warn","error","info"].forEach(function(k){var o=console[k];console[k]=function(){send(k,[].map.call(arguments,function(a){try{return typeof a==="object"?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(" "));o.apply(console,arguments)}});
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(a){var h=a.getAttribute("href");if(h&&!/^(https?:|#|mailto:)/.test(h)){e.preventDefault();send("navigate",h)}}});
})();</script>`;
  html = /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (h) => h + bridge)
    : bridge + html;
  return { html, urls, entry: htmlEntry };
}

function inlineBabel(files: FileMap, entry: string) {
  // Concatenate local imports (depth-first) so Babel standalone can run one module.
  const seen = new Set<string>();
  const out: string[] = [];
  const bare = new Map<string, { def?: string; ns?: string; named: Set<string> }>();
  const visit = (p: string) => {
    if (seen.has(p) || files[p] == null) return;
    seen.add(p);
    let src = files[p];
    src = src.replace(
      /^\s*import\s+([\s\S]*?)\s+from\s+['"](\.{1,2}\/[^'"]+)['"];?\s*$/gm,
      (_all, what: string, ref: string) => {
        const r = resolvePath(p, ref);
        const cand = r
          ? [r, r + ".jsx", r + ".js", r + "/index.jsx", r + "/index.js"].find(
              (c) => files[c] != null,
            )
          : null;
        if (cand?.endsWith(".css")) {
          out.push(
            `{const s=document.createElement('style');s.textContent=${JSON.stringify(files[cand])};document.head.appendChild(s);}`,
          );
          return "";
        }
        if (cand) {
          visit(cand);
          return "";
        }
        return "";
      },
    );
    src = src.replace(
      /^\s*import\s+([\s\S]*?)\s+from\s+['"]([^.'"][^'"]*)['"];?\s*$/gm,
      (_a, what: string, mod: string) => {
        const e = bare.get(mod) ?? { named: new Set<string>() };
        const named = what.match(/\{([\s\S]*)\}/);
        if (named)
          (named[1] ?? "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
            .forEach((x) => e.named.add(x));
        const ns = what.match(/\*\s+as\s+(\w+)/);
        if (ns && ns[1]) e.ns = ns[1];
        const def = what
          .replace(/\{[\s\S]*\}/, "")
          .replace(/\*\s+as\s+\w+/, "")
          .replace(/,/g, "")
          .trim();
        if (def) e.def = def;
        bare.set(mod, e);
        return "";
      },
    );
    src = src.replace(/^\s*import\s+['"](\.{1,2}\/[^'"]+\.css)['"];?\s*$/gm, (_a, ref: string) => {
      const r = resolvePath(p, ref);
      if (r && files[r])
        out.push(
          `{const s=document.createElement('style');s.textContent=${JSON.stringify(files[r])};document.head.appendChild(s);}`,
        );
      return "";
    });
    src = src
      .replace(/^export\s+default\s+function/gm, "function")
      .replace(/^export\s+default\s+[A-Za-z_$][\w$]*;?\s*$/gm, "")
      .replace(/^export\s+(const|function|class|let)/gm, "$1");
    out.push(`// ${p}\n${src}`);
  };
  visit(entry);
  const head = [...bare].map(([mod, e]) => {
    const parts = [
      e.def,
      e.ns ? `* as ${e.ns}` : "",
      e.named.size ? `{ ${[...e.named].join(", ")} }` : "",
    ].filter(Boolean);
    return parts.length ? `import ${parts.join(", ")} from "${mod}";` : `import "${mod}";`;
  });
  return [...head, ...out].join("\n");
}

export const TEMPLATES: Record<string, { label: string; desc: string; files: FileMap }> = {
  blank: { label: "Blank", desc: "Start empty and let the agent build", files: {} },
  web: {
    label: "HTML / CSS / JS",
    desc: "Static website starter",
    files: {
      "index.html": `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>My Vexo Site</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <main>\n    <h1>Hello from Vexo</h1>\n    <p>Edit these files or ask the agent to build something.</p>\n    <button id="btn">Click me</button>\n  </main>\n  <script src="script.js"></script>\n</body>\n</html>\n`,
      "style.css": `body { font-family: system-ui, sans-serif; background: #0f1115; color: #e8f0d8; display: grid; place-items: center; min-height: 100vh; margin: 0; }\nbutton { background: #b8f23a; border: 0; padding: .7rem 1.2rem; border-radius: .5rem; font-weight: 600; cursor: pointer; }\n`,
      "script.js": `document.getElementById("btn").addEventListener("click", () => {\n  console.log("Button clicked!");\n  alert("It works!");\n});\n`,
    },
  },
  react: {
    label: "React",
    desc: "React app running in the browser",
    files: {
      "index.html": `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>React on Vexo</title>\n  <link rel="stylesheet" href="src/index.css" />\n  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>\n  <script type="importmap">{ "imports": { "react": "https://esm.sh/react@18", "react-dom/client": "https://esm.sh/react-dom@18/client" } }</script>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="text/babel" data-type="module" src="src/main.jsx"></script>\n</body>\n</html>\n`,
      "src/main.jsx": `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\n\ncreateRoot(document.getElementById("root")).render(<App />);\n`,
      "src/App.jsx": `import React, { useState } from "react";\n\nexport default function App() {\n  const [count, setCount] = useState(0);\n  return (\n    <main className="app">\n      <h1>React on Vexo</h1>\n      <button onClick={() => setCount(count + 1)}>Count: {count}</button>\n    </main>\n  );\n}\n`,
      "src/index.css": `body { margin: 0; font-family: system-ui, sans-serif; background: #0f1115; color: #e8f0d8; }\n.app { min-height: 100vh; display: grid; place-content: center; text-align: center; gap: 1rem; }\nbutton { background: #b8f23a; border: 0; padding: .7rem 1.2rem; border-radius: .5rem; font-weight: 600; cursor: pointer; }\n`,
    },
  },
  node: {
    label: "Node.js",
    desc: "Node backend with an API",
    files: {
      "package.json": `{\n  "name": "vexo-node-api",\n  "version": "1.0.0",\n  "type": "module",\n  "scripts": { "dev": "node server.js", "start": "node server.js" },\n  "dependencies": { "express": "^4.19.2" }\n}\n`,
      "server.js": `import express from "express";\n\nconst app = express();\napp.use(express.json());\n\nconst users = [{ id: 1, name: "Ada" }];\n\napp.get("/api/users", (req, res) => res.json(users));\napp.post("/api/users", (req, res) => {\n  const user = { id: users.length + 1, ...req.body };\n  users.push(user);\n  res.status(201).json(user);\n});\n\nconst port = process.env.PORT || 3000;\napp.listen(port, () => console.log("API running on http://localhost:" + port));\n`,
      "hello.js": `console.log("Hello from Node on Vexo!");\nconsole.log("2 + 2 =", 2 + 2);\n`,
    },
  },
};
