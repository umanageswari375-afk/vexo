import { useState, useRef, useEffect } from "react";
import { Button } from "@components/ui/button";
import { X, Maximize2, Minimize2, Send, Loader2 } from "lucide-react";
import { cn } from "@lib/utils";

interface TerminalPanelProps {
  projectId: string;
}

export function TerminalPanel({ projectId }: TerminalPanelProps) {
  const [output, setOutput] = useState<string[]>(["Welcome to Vexo Terminal", "Type 'help' for available commands", ""]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || running) return;

    const command = input.trim();
    setOutput((prev) => [...prev, `$ ${command}`, ""]);
    setHistory((prev) => [command, ...prev].slice(0, 50));
    setHistoryIndex(-1);
    setInput("");
    setRunning(true);

    try {
      const response = await fetch(`/api/terminal/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data = await response.json();
      if (data.output) {
        setOutput((prev) => [...prev.slice(0, -1), ...data.output.split("\n"), ""]);
      }
      if (data.error) {
        setOutput((prev) => [...prev.slice(0, -1), `Error: ${data.error}`, ""]);
      }
    } catch (err) {
      setOutput((prev) => [...prev.slice(0, -1), `Error: ${err instanceof Error ? err.message : "Unknown error"}`, ""]);
    } finally {
      setRunning(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        setHistoryIndex((prev) => prev + 1);
        setInput(history[historyIndex + 1]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        setHistoryIndex((prev) => prev - 1);
        setInput(history[historyIndex - 1]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput("");
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col border-t bg-card",
        maximized && "fixed inset-0 z-50 h-[80vh] w-[80vw] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg shadow-xl"
      )}
    >
      <div className="flex h-10 items-center justify-between border-b px-3">
        <span className="text-sm font-medium">Terminal</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMaximized(!maximized)}
            title={maximized ? "Minimize" : "Maximize"}
          >
            {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          {!maximized && (
            <Button variant="ghost" size="icon" onClick={() => setOutput(["Welcome to Vexo Terminal", "Type 'help' for available commands", ""])} title="Clear">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div ref={terminalRef} className="flex-1 overflow-y-auto p-3 font-mono text-sm text-gray-100 bg-black">
        {output.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            {line}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex border-t px-3 py-2 bg-card">
        <span className="text-green-400 mr-2">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none"
          placeholder="Type a command..."
          disabled={running}
        />
        <Button type="submit" size="icon" disabled={running || !input.trim()}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}