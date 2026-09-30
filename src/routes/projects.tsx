import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Upload, LogOut, FolderCode, Loader2, FolderUp } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { VexoLogo } from "@/components/vexo/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth, signOutUser } from "@/lib/auth";
import { listProjects, createProject, deleteProject, type FileMap } from "@/lib/projects";
import { TEMPLATES } from "@/lib/vexo-engine";

function storageMessage(message: string) {
  // Firestore reports an empty path as NOT_FOUND, so a plain "not found" must not be
  // mistaken for a missing database. Only permission/rule failures are actionable here.
  if (/permission|insufficient|unauth/i.test(message))
    return "Firestore is blocking this request. In Firebase Console → Firestore Database → Rules, allow signed-in users to read and write their own documents, then reload.";
  if (/failed to get document because the client is offline|unavailable/i.test(message))
    return "Couldn't reach Firestore. Check your internet connection and reload.";
  if (/api.?key|invalid.?api/i.test(message))
    return "The Firebase web API key is missing or wrong. Set GOOGLE_API_KEY in your .env file.";
  return `Couldn't load projects: ${message}`;
}

export const Route = createFileRoute("/projects")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your projects — Vexo" },
      { name: "description", content: "Create, open and manage your Vexo projects." },
      { property: "og:title", content: "Your projects — Vexo" },
      { property: "og:description", content: "Your Vexo project dashboard." },
    ],
  }),
  component: Projects,
});

function Projects() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [tpl, setTpl] = useState("blank");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth", replace: true });
  }, [user, loading, nav]);

  const {
    data: projects,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["projects", user?.uid],
    queryFn: listProjects,
    enabled: !!user,
  });

  async function create(files?: FileMap, importedName?: string) {
    const n = (importedName ?? name).trim();
    if (!n) {
      toast.error("Give your project a name.");
      return;
    }
    setBusy(true);
    try {
      const id = await createProject({
        name: n,
        description: desc,
        template: files ? "import" : tpl,
        files: files ?? TEMPLATES[tpl]?.files ?? {},
      });
      qc.invalidateQueries({ queryKey: ["projects"] });
      nav({ to: "/p/$id", params: { id }, search: { prompt: desc && !files ? desc : undefined } });
    } catch (e) {
      toast.error(storageMessage((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function onImport(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      await importFiles(list);
    } catch (e) {
      // Surface real failures instead of an import that silently does nothing.
      toast.error(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function importFiles(list: FileList) {
    const files: FileMap = {};
    let pname = "Imported project";
    let skipped = 0;
    // Images are stored as data URLs so the preview and the agent can use them directly.
    const IMAGE = /\.(png|jpe?g|gif|svg|webp|ico|avif|bmp)$/i;
    const BINARY = /\.(png|jpe?g|gif|webp|ico|avif|bmp|pdf|woff2?|ttf|eot|mp4|webm|mp3|zip)$/i;
    const MAX_IMAGE = 400 * 1024;
    const MAX_TEXT = 300 * 1024;
    // Replit/Edge/Netlify exports ship vendored and generated folders that are neither
    // useful in the editor nor small enough to store. Skipping them keeps imports working.
    const SKIP_DIR =
      /(^|\/)(node_modules|\.git|\.next|\.nuxt|\.svelte-kit|\.cache|\.venv|venv|__pycache__|dist|build|out|coverage|vendor|target|\.idea|\.vscode|\.vercel|\.output)(\/|$)/;

    const toDataUrl = (f: File) =>
      new Promise<string | null>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
        r.onerror = () => resolve(null);
        r.readAsDataURL(f);
      });

    // SVGs are already compact text; raster photos are not. Downscaling big rasters keeps a
    // photo-heavy project inside the 1 MB document it is saved in, without dropping images.
    const MAX_EDGE = 1000;
    async function shrink(dataUrl: string, type: string): Promise<string> {
      if (type === "image/svg+xml" || typeof document === "undefined") return dataUrl;
      try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = dataUrl;
        });
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const g = canvas.getContext("2d");
        if (!g) return dataUrl;
        g.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL(type === "image/jpeg" ? "image/jpeg" : "image/png", 0.82);
        return out.length < dataUrl.length ? out : dataUrl;
      } catch {
        return dataUrl;
      }
    }

    for (const f of Array.from(list)) {
      if (f.name.endsWith(".zip")) {
        pname = f.name.replace(/\.zip$/, "");
        const zip = await JSZip.loadAsync(f);
        for (const [p, entry] of Object.entries(zip.files)) {
          if (entry.dir || SKIP_DIR.test(p)) continue;
          if (IMAGE.test(p)) {
            const blob = (await entry.async("uint8array")) as Uint8Array;
            if (blob.byteLength > MAX_IMAGE) {
              skipped++;
              continue;
            }
            const ext = p.split(".").pop()!.toLowerCase();
            const mime =
              ext === "jpg" || ext === "jpeg"
                ? "image/jpeg"
                : ext === "svg"
                  ? "image/svg+xml"
                  : `image/${ext}`;
            let bin = "";
            for (const b of blob) bin += String.fromCharCode(b);
            files[p] = await shrink(`data:${mime};base64,${btoa(bin)}`, mime);
          } else {
            files[p] = await entry.async("string");
          }
        }
      } else {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        if (SKIP_DIR.test(rel)) continue;
        if (IMAGE.test(rel)) {
          if (f.size > MAX_IMAGE) {
            skipped++;
            continue;
          }
          const raw = await toDataUrl(f);
          if (raw) files[rel] = await shrink(raw, f.type || "image/png");
        } else if (BINARY.test(rel) || f.size > MAX_TEXT) {
          skipped++;
          continue;
        } else {
          files[rel] = await f.text();
        }
      }
    }
    if (!Object.keys(files).length) {
      toast.error(
        skipped
          ? "Nothing importable — those files are too large for browser storage. Use a zip without large media."
          : "No readable files found in that selection.",
      );
      return;
    }
    if (skipped) toast.warning(`${skipped} large or binary file${skipped > 1 ? "s" : ""} skipped.`);
    // A whole project is stored in one Firestore document, which caps at 1 MiB. Importing a
    // real Replit/Edge export easily exceeds that once images are inlined as data URLs, and
    // rejecting the whole import would be unhelpful. Instead keep the code and shed the
    // heaviest images until the project fits, telling the user exactly what was dropped.
    const BUDGET = 900 * 1024;
    const weigh = (f: FileMap) =>
      JSON.stringify(Object.entries(f).map(([path, content]) => ({ path, content }))).length;
    let dropped = 0;
    while (weigh(files) > BUDGET) {
      const heaviest = Object.entries(files)
        .filter(
          ([k, v]) => v.startsWith("data:") && /\.(png|jpe?g|gif|webp|ico|avif|bmp)$/i.test(k),
        )
        .sort((a, b) => b[1].length - a[1].length)[0];
      if (!heaviest) break;
      delete files[heaviest[0]];
      dropped++;
    }
    if (dropped)
      toast.warning(
        `${dropped} image${dropped > 1 ? "s" : ""} left out — the project is stored in one Firestore document (1 MB max). The code imported fully.`,
      );
    if (!Object.keys(files).length) {
      toast.error("This folder is too large to import. Try a zip without images or media.");
      return;
    }
    // strip common top folder
    const keys = Object.keys(files);
    const top = keys[0]?.split("/")[0];
    if (top && keys.length > 1 && keys.every((k) => k.startsWith(top + "/"))) {
      pname = top;
      for (const k of keys) {
        files[k.slice(top.length + 1)] = files[k] ?? "";
        delete files[k];
      }
    }
    await create(files, pname);
  }

  // A native confirm() is blocked inside sandboxed frames, so deletion is confirmed by
  // the inline dialog rendered below instead.
  async function remove(id: string, n: string) {
    setPendingDelete({ id, name: n });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    await deleteProject(id);
    qc.invalidateQueries({ queryKey: ["projects"] });
    toast.success("Project deleted");
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <VexoLogo />
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{user?.email}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              qc.clear();
              await signOutUser();
              nav({ to: "/auth", replace: true });
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground">
              Create a project and tell the agent what to build.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void onImport(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={dirRef}
              type="file"
              hidden
              multiple
              // Chromium/WebKit expose folder picking through these non-standard attributes.
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              onChange={(e) => {
                void onImport(e.target.files);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="h-4 w-4" /> Import zip / files
            </Button>
            <Button variant="secondary" onClick={() => dirRef.current?.click()} disabled={busy}>
              <FolderUp className="h-4 w-4" /> Import folder
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          </div>
        </div>

        {error && (
          <p className="mt-6 rounded-md border border-destructive/40 p-4 text-sm text-destructive">
            {storageMessage((error as Error).message)}
          </p>
        )}
        {isLoading || loading ? (
          <div className="mt-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : projects?.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-border p-12 text-center">
            <FolderCode className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 font-medium">No projects yet</p>
            <p className="text-sm text-muted-foreground">Start one and describe it to the agent.</p>
            <Button className="mt-4" onClick={() => setOpen(true)}>
              Create your first project
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects?.map((p) => (
              <div
                key={p.id}
                className="group relative rounded-xl border border-border bg-card p-5 transition hover:border-primary/50"
              >
                <Link
                  to="/p/$id"
                  params={{ id: p.id }}
                  search={{ prompt: undefined }}
                  className="absolute inset-0"
                  aria-label={`Open ${p.name}`}
                />
                <div className="flex items-start justify-between">
                  <FolderCode className="h-5 w-5 text-primary" />
                  <button
                    className="relative z-10 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                    onClick={() => remove(p.id, p.name)}
                    aria-label="Delete project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <h3 className="mt-3 font-semibold">{p.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {p.description || "No description"}
                </p>
                <p className="mt-4 font-mono text-xs text-muted-foreground">
                  {Object.keys(p.files).length} files ·{" "}
                  {p.updatedAt
                    ? new Date(p.updatedAt.seconds * 1000).toLocaleDateString()
                    : "just now"}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <span className="text-foreground">{pendingDelete?.name}</span>? This can't be
            undone.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Textarea
              placeholder="What should Vexo build? (optional — the agent starts on it right away)"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
            />
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TEMPLATES).map(([k, t]) => (
                <button
                  key={k}
                  onClick={() => setTpl(k)}
                  className={`rounded-lg border p-3 text-left text-sm transition ${tpl === k ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => create()} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
