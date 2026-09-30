import Editor from "@monaco-editor/react";

const LANG: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  html: "html",
  css: "css",
  json: "json",
  md: "markdown",
  py: "python",
  sh: "shell",
  yml: "yaml",
  yaml: "yaml",
};

export default function CodeEditor({
  path,
  value,
  onChange,
}: {
  path: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return (
    <Editor
      path={path}
      language={LANG[ext] ?? "plaintext"}
      value={value}
      theme="vexo"
      onChange={(v) => onChange(v ?? "")}
      beforeMount={(monaco) => {
        monaco.editor.defineTheme("vexo", {
          base: "vs-dark",
          inherit: true,
          rules: [
            { token: "keyword", foreground: "b8f23a" },
            { token: "string", foreground: "6fe3c1" },
            { token: "comment", foreground: "6b7385", fontStyle: "italic" },
            { token: "number", foreground: "f5c26b" },
          ],
          colors: {
            "editor.background": "#0f1216",
            "editor.lineHighlightBackground": "#171b21",
            "editorLineNumber.foreground": "#3c4452",
          },
        });
        monaco.languages.typescript?.javascriptDefaults.setCompilerOptions({
          jsx: 2,
          allowNonTsExtensions: true,
          target: 99,
        });
        monaco.languages.typescript?.javascriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: true,
        });
      }}
      options={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 2,
        automaticLayout: true,
        padding: { top: 12 },
      }}
    />
  );
}
