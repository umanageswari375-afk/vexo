export interface FileOp {
  type: "create" | "update" | "delete";
  path: string;
  content?: string;
}

export interface ParsedAgentOutput {
  files: FileOp[];
  commands: string[];
  done: boolean;
  message?: string;
}

export function parseAgent(output: string): ParsedAgentOutput {
  const files: FileOp[] = [];
  const commands: string[] = [];
  let done = false;
  let message: string | undefined;

  const fileRegex = /<vexo-file\s+path="([^"]+)">([\s\S]*?)<\/vexo-file>/g;
  let match;
  while ((match = fileRegex.exec(output)) !== null) {
    const path = match[1];
    const content = match[2];
    files.push({ type: "create", path, content });
  }

  const updateRegex = /<vexo-update\s+path="([^"]+)">([\s\S]*?)<\/vexo-update>/g;
  while ((match = updateRegex.exec(output)) !== null) {
    const path = match[1];
    const content = match[2];
    files.push({ type: "update", path, content });
  }

  const deleteRegex = /<vexo-delete\s+path="([^"]+)">/g;
  while ((match = deleteRegex.exec(output)) !== null) {
    const path = match[1];
    files.push({ type: "delete", path });
  }

  const commandRegex = /<vexo-command>([\s\S]*?)<\/vexo-command>/g;
  while ((match = commandRegex.exec(output)) !== null) {
    commands.push(match[1].trim());
  }

  if (output.includes("<vexo-done>")) {
    done = true;
    const doneMatch = output.match(/<vexo-done>([\s\S]*?)<\/vexo-done>/);
    if (doneMatch) {
      message = doneMatch[1].trim();
    }
  }

  return { files, commands, done, message };
}

export function applyOps(files: Record<string, string>, ops: FileOp[]): Record<string, string> {
  const result = { ...files };
  for (const op of ops) {
    switch (op.type) {
      case "create":
      case "update":
        if (op.content !== undefined) {
          result[op.path] = op.content;
        }
        break;
      case "delete":
        delete result[op.path];
        break;
    }
  }
  return result;
}

export function buildPreview(files: Record<string, string>): string {
  const htmlFile = files["index.html"] || files["index.htm"];
  if (!htmlFile) {
    return buildDefaultPreview(files);
  }

  let html = htmlFile;

  const cssFiles = Object.entries(files)
    .filter(([path]) => path.endsWith(".css"))
    .map(([, content]) => content);

  const jsFiles = Object.entries(files)
    .filter(([path]) => path.endsWith(".js") || path.endsWith(".jsx") || path.endsWith(".ts") || path.endsWith(".tsx"))
    .map(([, content]) => content);

  if (cssFiles.length > 0) {
    const combinedCss = cssFiles.join("\n");
    html = html.replace("</head>", `<style>${combinedCss}</style>\n</head>`);
  }

  if (jsFiles.length > 0) {
    const combinedJs = jsFiles.join("\n");
    html = html.replace("</body>", `<script>${combinedJs}</script>\n</body>`);
  }

  return html;
}

function buildDefaultPreview(files: Record<string, string>): string {
  const hasJs = Object.keys(files).some((k) => k.endsWith(".js") || k.endsWith(".jsx") || k.endsWith(".ts") || k.endsWith(".tsx"));
  const hasCss = Object.keys(files).some((k) => k.endsWith(".css"));

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vexo Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
`;

  if (hasCss) {
    const cssContent = Object.entries(files)
      .filter(([path]) => path.endsWith(".css"))
      .map(([, content]) => content)
      .join("\n");
    html += `<style>${cssContent}</style>`;
  }

  html += `</head>
<body class="min-h-screen bg-gray-50 p-8">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold text-gray-900 mb-4">Project Preview</h1>
    <p class="text-gray-600 mb-8">No index.html found. Showing project files:</p>
    <ul class="space-y-2">`;

  for (const [path, content] of Object.entries(files)) {
    html += `<li class="font-mono text-sm text-gray-700 bg-white p-3 rounded border">${path}</li>`;
  }

  html += `</ul></div></body></html>`;

  return html;
}

export const TEMPLATES: Record<string, Record<string, string>> = {
  "html": {
    "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vexo Project</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-50">
  <div class="max-w-4xl mx-auto p-8">
    <h1 class="text-4xl font-bold text-gray-900 mb-4">Hello Vexo!</h1>
    <p class="text-gray-600">Start building your project here.</p>
  </div>
</body>
</html>`,
  },
  "react": {
    "package.json": JSON.stringify({
      name: "vexo-react-app",
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0",
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.2.1",
        vite: "^5.0.0",
      },
    }, null, 2),
    "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`,
    "src/main.jsx": `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)`,
    "src/App.jsx": `import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">React + Vexo</h1>
      <button
        onClick={() => setCount(count + 1)}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Count: {count}
      </button>
    </div>
  )
}

export default App`,
    "src/index.css": `:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

#root {
  width: 100%;
}`,
    "vite.config.js": `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, host: true },
})`,
  },
  "node": {
    "package.json": JSON.stringify({
      name: "vexo-node-app",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      scripts: {
        start: "node index.js",
        dev: "node --watch index.js",
      },
    }, null, 2),
    "index.js": `console.log("Hello from Vexo Node.js project!");

const greeting = (name) => \`Hello, \${name}!\`;
console.log(greeting("Vexo"));`,
  },
};