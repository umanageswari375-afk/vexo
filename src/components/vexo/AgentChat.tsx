import { useState, useRef, useEffect } from "react";
import { Button } from "@components/ui/button";
import { Textarea } from "@components/ui/textarea";
import { ScrollArea } from "@components/ui/scroll-area";
import { Send, Loader2, Copy, Check } from "lucide-react";
import { cn } from "@lib/utils";
import { parseAgent, type FileOp } from "@lib/vexo-engine";
import { type Project } from "@lib/projects";

interface AgentChatProps {
  project: Project;
  onApplyChanges: (ops: FileOp[]) => void;
}

export function AgentChat({ project, onApplyChanges }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! I'm the Vexo AI agent. Describe what you want to build and I'll help you create it." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMessage,
          files: project.files,
          projectId: project.id,
        }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      let assistantContent = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        assistantContent += chunk;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant" && last.streaming) {
            last.content = assistantContent;
          }
          return next;
        });
      }

      const parsed = parseAgent(assistantContent);
      if (parsed.files.length > 0) {
        onApplyChanges(parsed.files);
      }

      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant" && last.streaming) {
          last.streaming = false;
          last.content = parsed.message || assistantContent;
          last.parsed = parsed;
        }
        return next;
      });
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Unknown error"}` }]);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <Message key={i} message={msg} onCopy={copyCode} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      <form onSubmit={handleSubmit} className="border-t p-4">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe what you want to build..."
          className="mb-2 min-h-[80px] max-h-[200px] resize-none"
          disabled={loading}
          rows={3}
        />
        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={loading || !input.trim()} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {loading ? "Thinking..." : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  parsed?: ReturnType<typeof parseAgent>;
}

function Message({ message, onCopy }: { message: ChatMessage; onCopy: (code: string) => void }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div className={cn("flex-1 max-w-[85%]")}>
        <div
          className={cn(
            "rounded-lg p-3 text-sm",
            isUser ? "bg-primary text-primary-foreground rounded-br-none" : "bg-muted rounded-bl-none"
          )}
        >
          {!isUser && message.streaming && <span className="animate-pulse">▌</span>}
          <div className="whitespace-pre-wrap">{message.content}</div>
          {message.parsed?.files.length && (
            <div className="mt-2 space-y-1">
              {message.parsed.files.map((op, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-xs font-medium",
                    op.type === "create" && "bg-green-100 text-green-800",
                    op.type === "update" && "bg-blue-100 text-blue-800",
                    op.type === "delete" && "bg-red-100 text-red-800"
                  )}>
                    {op.type.toUpperCase()}
                  </span>
                  <span className="font-mono truncate">{op.path}</span>
                  {op.content && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 p-0"
                      onClick={() => onCopy(op.content!)}
                      title="Copy content"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}