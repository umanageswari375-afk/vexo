import { useEffect, useRef, useState } from "react";
import { runCommand, type ShellCtx } from "@/lib/shell";
import type { FileMap } from "@/lib/projects";

export type Line = { text: string; kind: "out" | "err" | "ok" | "info" | "cmd" };

type Props = {
  files: FileMap;
  projectId: string;
  setFiles: (f: FileMap) => void;
  lines: Line[];
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  openPreview: () => void;
  openUrl: (url: string) => void;
  askAgent: (p: string) => void;
};

const COLOR: Record<Line["kind"], string> = {
  out: "text-foreground/90",
  err: "text-destructive",
  ok: "text-primary",
  info: "text-primary-glow",
  cmd: "text-muted-foreground",
};

export function TerminalPanel(p: Props) {
  const [cwd, setCwd] = useState("");
  const [input, setInput] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const end = useRef<HTMLDivElement>(null);
  const filesRef = useRef(p.files);
  filesRef.current = p.files;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [p.lines]);

  async function exec(line: string) {
    p.setLines((l) => [...l, { text: `~/${cwd}${cwd ? " " : ""}$ ${line}`, kind: "cmd" }]);
    if (line.trim()) setHist((h) => [line, ...h].slice(0, 50));
    const ctx: ShellCtx = {
      files: filesRef.current,
      cwd,
      projectId: p.projectId,
      setFiles: (f) => {
        filesRef.current = f;
        p.setFiles(f);
      },
      setCwd,
      print: (text, kind = "out") => p.setLines((l) => [...l, { text, kind }]),
      clear: () => p.setLines([]),
      openPreview: p.openPreview,
      openUrl: p.openUrl,
      askAgent: p.askAgent,
    };
    await runCommand(line, ctx);
  }

  return (
    <div
      className="flex h-full flex-col bg-editor font-mono text-[12.5px]"
      onClick={() => document.getElementById("vexo-term-input")?.focus()}
    >
      <div className="flex-1 overflow-auto px-3 py-2">
        {p.lines.map((l, i) => (
          <pre key={i} className={`whitespace-pre-wrap break-words ${COLOR[l.kind]}`}>
            {l.text}
          </pre>
        ))}
        <div className="flex items-center gap-2" ref={end}>
          <span className="text-primary">~/{cwd}$</span>
          <input
            id="vexo-term-input"
            className="flex-1 bg-transparent text-foreground outline-none"
            value={input}
            spellCheck={false}
            autoComplete="off"
            aria-label="Terminal input"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                exec(input);
                setInput("");
                setHi(-1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                const n = Math.min(hi + 1, hist.length - 1);
                if (hist[n] != null) {
                  setHi(n);
                  setInput(hist[n]);
                }
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const n = hi - 1;
                setHi(Math.max(n, -1));
                setInput(n >= 0 ? (hist[n] ?? "") : "");
              } else if (e.key === "l" && e.ctrlKey) {
                e.preventDefault();
                p.setLines([]);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
