import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Play, Save, Send, Sparkles, History } from "lucide-react";
import { toast } from "sonner";
import { VexoLogo } from "@/components/vexo/Logo";
import CodeEditor from "@/components/vexo/CodeEditor";
import { FileTree } from "@/components/vexo/FileTree";
import { TerminalPanel, type Line } from "@/components/vexo/TerminalPanel";
import { PreviewPanel } from "@/components/vexo/PreviewPanel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { getProject, saveProject, pushHistory, type ChatMsg, type FileMap } from "@/lib/projects";
import { parseAgent, applyOps, findMissing, resolveImages } from "@/lib/vexo-engine";
import { proxyUrl } from "@/lib/shell";

export const Route = createFileRoute("/p/$id")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    prompt: typeof s["prompt"] === "string" ? (s["prompt"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Workspace — Vexo" },
      {
        name: "description",
        content: "Build your project with the Vexo AI agent, editor, terminal and live preview.",
      },
      { property: "og:title", content: "Workspace — Vexo" },
      { property: "og:description", content: "Vexo AI coding workspace." },
    ],
  }),
  component: Workspace,
});

function Workspace() {
  const { id } = Route.useParams();
  const { prompt: initialPrompt } = Route.useSearch();
  const { user, loading } = useAuth();
  const nav = useNavigate();

  const [files, setFiles] = useState<FileMap>({});
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<Line[]>([
    { text: "Vexo terminal — type 'help' for commands.", kind: "info" },
  ]);
  const [showPreview, setShowPreview] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const chatEnd = useRef<HTMLDivElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const errorsRef = useRef(errors);
  errorsRef.current = errors;

  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject(id),
    enabled: !!user,
  });

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth", replace: true });
  }, [user, loading, nav]);

  useEffect(() => {
    if (!project) return;
    setFiles(project.files);
    setChat(project.chat ?? []);
    const first = Object.keys(project.files).find((p) => !p.endsWith(".gitkeep"));
    setActive(first ?? null);
    if (Object.keys(project.files).some((p) => p.endsWith(".html"))) setShowPreview(true);
  }, [project]);

  // If a dev server for this project is still alive, reconnect the preview to it.
  useEffect(() => {
    const port = sessionStorage.getItem("vexo:port:" + id);
    if (!port) {
      setLiveUrl(null);
      return;
    }
    let cancelled = false;
    proxyUrl(id, Number(port)).then((u) => {
      if (!cancelled) setLiveUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [chat, busy]);

  const save = useCallback(
    async (f?: FileMap, c?: ChatMsg[]) => {
      try {
        await saveProject(id, { files: f ?? filesRef.current, chat: c ?? chatRef.current });
        setDirty(false);
      } catch (e) {
        toast.error("Save failed: " + (e as Error).message);
      }
    },
    [id],
  );

  // autosave
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => save(), 1500);
    return () => clearTimeout(t);
  }, [dirty, files, save]);

  function updateFiles(next: FileMap, changedPaths: string[] = []) {
    setFiles(next);
    setDirty(true);
    if (changedPaths.length) setChanged((s) => new Set([...s, ...changedPaths]));
  }

  /** One agent request: streams the reply, applies the file ops it produced. */
  async function agentRound(messages: ChatMsg[], filesNow: FileMap, errs?: string) {
    const { auth } = await getFirebase();
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messages: messages.slice(-12),
        files: filesNow,
        activeFile: active,
        errors: errs,
      }),
    });
    if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "Agent request failed"));
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
      const { prose } = parseAgent(text);
      setChat([...messages, { role: "assistant", content: prose || "Working…" }]);
    }
    const parsed = parseAgent(text);
    let next = filesNow;
    let images: { query: string; path: string }[] = [];
    if (parsed.ops.length) {
      next = applyOps(filesNow, parsed.ops);
      const imageOps = parsed.ops.filter((o) => o.type === "image");
      if (imageOps.length) {
        const res = await resolveImages(imageOps);
        Object.assign(next, res.files);
        images = res.saved;
        if (res.saved.length)
          toast.success(`Added ${res.saved.length} image${res.saved.length > 1 ? "s" : ""}`, {
            description: res.saved.map((s) => s.path).join(", "),
          });
      }
      updateFiles(
        next,
        parsed.ops.filter((o) => o.type === "write" || o.type === "delete").map((o) => o.path),
      );
      const firstHtml = Object.keys(next).find((k) => k.endsWith(".html"));
      if (firstHtml) setShowPreview(true);
      const written = parsed.ops.find((o) => o.type === "write");
      if (written) setActive(written.path);
    }
    return { parsed, files: next, images };
  }

  const MAX_BUILD_ROUNDS = 8;
  const MAX_FIX_ROUNDS = 2;

  async function askAgent(promptText: string) {
    const p = promptText.trim();
    if (!p || busy) return;
    setBusy(true);
    // `visible` is what the user sees; `api` additionally carries the internal
    // continuation prompts that keep the agent building until the project is done.
    let visible: ChatMsg[] = [...chatRef.current, { role: "user", content: p }];
    let api: ChatMsg[] = [...visible];
    setChat(visible);
    try {
      let filesNow = filesRef.current;
      let lastProse = "";
      for (let round = 0; round < MAX_BUILD_ROUNDS; round++) {
        const {
          parsed,
          files: updated,
          images,
        } = await agentRound(
          api,
          filesNow,
          round === 0 ? errorsRef.current.slice(-5).join("\n") || undefined : undefined,
        );
        filesNow = updated;
        lastProse = parsed.prose || lastProse;
        const opPaths = parsed.ops
          .filter((o) => o.type === "write" || o.type === "delete")
          .map((o) => o.path);
        api = [...api, { role: "assistant", content: parsed.prose, ops: opPaths }];
        visible = [...visible, { role: "assistant", content: parsed.prose, ops: opPaths }];
        if (images.length) {
          const note = `Saved images — reference these exact paths in your HTML with <img src="...">:\n${images
            .map((i) => `- "${i.query}" -> ${i.path}`)
            .join("\n")}`;
          api = [...api, { role: "user", content: note }];
        }
        setChat(visible);
        await pushHistory(id, p.slice(0, 80), filesNow);
        await save(filesNow, visible);

        const missing = findMissing(filesNow);
        // Markers are a hint, not a guarantee — models often omit them. Treat
        // "referenced but unwritten files" as the authoritative signal, and stop
        // when a round produces no operations so we never spin without progress.
        // A round that only saved images must not end the build: the HTML that
        // references those images still has to be written.
        if (parsed.done && !images.length) break;
        if (!parsed.ops.length) break;
        if (!parsed.more && !missing.length && !images.length) break;
        const nudge = images.length
          ? `Now write the project files. Use the saved image paths exactly as listed above.`
          : missing.length
            ? `Continue building. These files are referenced but do not exist yet — write them now, in full: ${missing.join(", ")}. Do not repeat files you already wrote.`
            : "Continue building the project. Write the remaining planned files in full, then end with <vexo-done /> when complete.";
        api = [...api, { role: "user", content: nudge }];
        visible = [...visible, { role: "user", content: "…continuing" }];
        setChat(visible);
      }

      // Give the preview a moment to run, then fix any runtime errors it reported.
      for (let fix = 0; fix < MAX_FIX_ROUNDS; fix++) {
        await new Promise((r) => setTimeout(r, 1200));
        const errs = errorsRef.current.slice(-5);
        if (!errs.length) break;
        const ask = `The preview reported these runtime errors. Rewrite the affected files so the project runs cleanly:\n${errs.join("\n")}`;
        api = [...api, { role: "user", content: ask }];
        const { parsed, files: updated } = await agentRound(api, filesNow, errs.join("\n"));
        filesNow = updated;
        const opPaths = parsed.ops
          .filter((o) => o.type === "write" || o.type === "delete")
          .map((o) => o.path);
        api = [...api, { role: "assistant", content: parsed.prose, ops: opPaths }];
        visible = [...visible, { role: "assistant", content: parsed.prose, ops: opPaths }];
        setChat(visible);
        await pushHistory(id, "auto-fix", filesNow);
        await save(filesNow, visible);
        if (!parsed.ops.length) break;
      }
      if (!lastProse) toast.message("Agent finished with no file changes.");
      setErrors([]);
    } catch (e) {
      toast.error((e as Error).message);
      setChat(visible);
    } finally {
      setBusy(false);
    }
  }

  // kick off the initial prompt from project creation
  const kicked = useRef(false);
  useEffect(() => {
    if (initialPrompt && project && !kicked.current) {
      kicked.current = true;
      askAgent(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, project]);

  const onConsole = useCallback((kind: string, msg: string) => {
    if (kind === "error") setErrors((e) => [...e.slice(-9), msg]);
    setLines((l) => [
      ...l.slice(-200),
      { text: `[preview] ${msg}`, kind: kind === "error" ? "err" : "out" },
    ]);
  }, []);

  const fileList = useMemo(
    () => Object.keys(files).filter((p) => !p.endsWith(".gitkeep")),
    [files],
  );

  if (isLoading || loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !project) {
    return (
      <div className="grid min-h-screen place-items-center text-center">
        <div>
          <p className="text-lg font-semibold">Couldn't open this project</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {(error as Error)?.message ?? "It may have been deleted."}
          </p>
          <Button className="mt-4" onClick={() => nav({ to: "/projects" })}>
            Back to projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <Link
          to="/projects"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Back to projects"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <VexoLogo small />
        <span className="truncate text-sm font-medium">{project.name}</span>
        {dirty && <span className="text-xs text-muted-foreground">saving…</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => save()} title="Save now">
            <Save className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await pushHistory(id, "Manual snapshot", filesRef.current);
              toast.success("Snapshot saved to history");
            }}
            title="Save history snapshot"
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={showPreview ? "secondary" : "default"}
            onClick={() => setShowPreview((v) => !v)}
          >
            <Play className="h-4 w-4" /> Preview
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* File tree */}
        <aside className="hidden w-52 shrink-0 border-r border-border md:block">
          <FileTree
            files={files}
            active={active}
            changed={changed}
            onOpen={setActive}
            onCreate={(p, dir) => updateFiles({ ...files, [dir ? p + "/.gitkeep" : p]: "" }, [p])}
            onRename={(from, to) => {
              const next: FileMap = {};
              for (const [k, v] of Object.entries(files))
                next[k === from ? to : k.startsWith(from + "/") ? to + k.slice(from.length) : k] =
                  v;
              updateFiles(next, [to]);
              if (active === from) setActive(to);
            }}
            onDelete={(p) => {
              const next = { ...files };
              for (const k of Object.keys(next))
                if (k === p || k.startsWith(p + "/")) delete next[k];
              updateFiles(next);
              if (active === p) setActive(null);
            }}
          />
        </aside>

        {/* Editor + terminal */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {active && files[active] != null ? (
              <CodeEditor
                path={active}
                value={files[active]}
                onChange={(v) => updateFiles({ ...files, [active]: v })}
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                {fileList.length
                  ? "Select a file from the explorer."
                  : "Empty project — tell the agent what to build."}
              </div>
            )}
          </div>
          <div className="h-40 shrink-0 border-t border-border">
            <TerminalPanel
              files={files}
              projectId={id}
              setFiles={(f) => updateFiles(f)}
              lines={lines}
              setLines={setLines}
              openPreview={() => setShowPreview(true)}
              openUrl={(u) => {
                setLiveUrl(u);
                setShowPreview(true);
              }}
              askAgent={askAgent}
            />
          </div>
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="hidden w-[42%] shrink-0 border-l border-border lg:block">
            <PreviewPanel
              files={files}
              url={liveUrl}
              onClose={() => setShowPreview(false)}
              onConsole={onConsole}
            />
          </div>
        )}

        {/* Agent chat */}
        <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-panel">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Vexo Agent
          </div>
          <div className="flex-1 space-y-3 overflow-auto p-3 text-sm">
            {chat.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Describe what to build or change. The agent writes real files into your project.
              </p>
            )}
            {chat.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-6 rounded-lg bg-primary/15 p-2.5"
                    : "mr-2 rounded-lg bg-secondary p-2.5"
                }
              >
                <p className="whitespace-pre-wrap break-words text-[13px]">
                  {m.content || (busy && i === chat.length - 1 ? "…" : "")}
                </p>
                {!!m.ops?.length && (
                  <p className="mt-1 font-mono text-[11px] text-primary-glow">
                    {m.ops.length} file op(s): {m.ops.slice(0, 4).join(", ")}
                    {m.ops.length > 4 ? "…" : ""}
                  </p>
                )}
              </div>
            ))}
            <div ref={chatEnd} />
          </div>
          <form
            className="flex gap-2 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              askAgent(input);
              setInput("");
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
              placeholder="Build me a…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              aria-label="Ask the agent"
            />
            <Button size="sm" type="submit" disabled={busy || !input.trim()} aria-label="Send">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </aside>
      </div>
    </div>
  );
}
