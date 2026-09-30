import { useMemo, useState } from "react";
import {
  ChevronRight,
  File,
  FileCode,
  Folder,
  FolderOpen,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import type { FileMap } from "@/lib/projects";

type Node = { name: string; path: string; dir: boolean; children: Node[] };

function build(files: FileMap): Node[] {
  const root: Node = { name: "", path: "", dir: true, children: [] };
  for (const p of Object.keys(files).sort()) {
    const parts = p.split("/");
    let cur = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      const dir = i < parts.length - 1;
      if (!dir && part === ".gitkeep") return;
      let n = cur.children.find((c) => c.name === part && c.dir === dir);
      if (!n) {
        n = { name: part, path, dir, children: [] };
        cur.children.push(n);
      }
      cur = n;
    });
  }
  const sort = (ns: Node[]) => {
    ns.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    ns.forEach((n) => sort(n.children));
  };
  sort(root.children);
  return root.children;
}

type Props = {
  files: FileMap;
  active: string | null;
  changed: Set<string>;
  onOpen: (p: string) => void;
  onCreate: (p: string, dir: boolean) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (p: string) => void;
};

/** Inline prompt state. Native prompt()/confirm() are blocked in sandboxed frames. */
type Dialog =
  | { kind: "create"; dir: boolean; parent: string; value: string }
  | { kind: "rename"; path: string; value: string }
  | { kind: "delete"; path: string };

export function FileTree(props: Props) {
  const tree = useMemo(() => build(props.files), [props.files]);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const ask = (dir: boolean, base = "") => {
    setDialog({ kind: "create", dir, parent: base, value: base ? base + "/" : "" });
  };

  const submit = () => {
    if (!dialog) return;
    if (dialog.kind === "create") {
      const name = dialog.value.trim().replace(/^\/+/, "");
      if (!name) return setDialog(null);
      props.onCreate(name, dialog.dir);
    } else if (dialog.kind === "rename") {
      const to = dialog.value.trim();
      if (to && to !== dialog.path) props.onRename(dialog.path, to);
    } else {
      props.onDelete(dialog.path);
    }
    setDialog(null);
  };

  const title =
    dialog?.kind === "create"
      ? dialog.dir
        ? "New folder"
        : "New file"
      : dialog?.kind === "rename"
        ? "Rename"
        : "Delete";

  const render = (nodes: Node[], depth: number) =>
    nodes.map((n) => (
      <div key={n.path}>
        <div
          className={`group flex cursor-pointer items-center gap-1.5 py-[3px] pr-2 text-[13px] hover:bg-accent ${props.active === n.path ? "bg-accent text-foreground" : "text-muted-foreground"}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => {
            if (n.dir)
              setClosed((s) => {
                const x = new Set(s);
                if (x.has(n.path)) x.delete(n.path);
                else x.add(n.path);
                return x;
              });
            else props.onOpen(n.path);
          }}
        >
          {n.dir ? (
            <>
              <ChevronRight
                className={`h-3 w-3 shrink-0 transition ${closed.has(n.path) ? "" : "rotate-90"}`}
              />
              {closed.has(n.path) ? (
                <Folder className="h-3.5 w-3.5 shrink-0 text-primary-glow" />
              ) : (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary-glow" />
              )}
            </>
          ) : (
            <>
              <span className="w-3" />
              {/\.(jsx?|tsx?|html|css|json)$/.test(n.name) ? (
                <FileCode className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <File className="h-3.5 w-3.5 shrink-0" />
              )}
            </>
          )}
          <span className="truncate">{n.name}</span>
          {props.changed.has(n.path) && (
            <span
              className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
              title="Changed by agent"
            />
          )}
          <span className="ml-auto hidden gap-1 group-hover:flex">
            {n.dir && (
              <button
                title="New file here"
                onClick={(e) => {
                  e.stopPropagation();
                  ask(false, n.path);
                }}
              >
                <FilePlus className="h-3 w-3 hover:text-foreground" />
              </button>
            )}
            <button
              title="Rename"
              onClick={(e) => {
                e.stopPropagation();
                setDialog({ kind: "rename", path: n.path, value: n.path });
              }}
            >
              <Pencil className="h-3 w-3 hover:text-foreground" />
            </button>
            <button
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                setDialog({ kind: "delete", path: n.path });
              }}
            >
              <Trash2 className="h-3 w-3 hover:text-destructive" />
            </button>
          </span>
        </div>
        {n.dir && !closed.has(n.path) && render(n.children, depth + 1)}
      </div>
    ));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Explorer
        <span className="flex gap-2">
          <button title="New file" onClick={() => ask(false)}>
            <FilePlus className="h-3.5 w-3.5 hover:text-foreground" />
          </button>
          <button title="New folder" onClick={() => ask(true)}>
            <FolderPlus className="h-3.5 w-3.5 hover:text-foreground" />
          </button>
        </span>
      </div>
      <div className="flex-1 overflow-auto pb-4">
        {tree.length ? (
          render(tree, 0)
        ) : (
          <p className="px-3 text-xs text-muted-foreground">
            No files yet. Ask the agent to build something.
          </p>
        )}
      </div>

      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDialog(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-sm font-medium text-foreground">{title}</p>
            {dialog.kind === "delete" ? (
              <p className="mb-4 text-xs text-muted-foreground">
                Delete <span className="text-foreground">{dialog.path}</span>? This can't be undone.
              </p>
            ) : (
              <input
                autoFocus
                value={dialog.value}
                placeholder={
                  dialog.kind === "create" && dialog.dir ? "src/components" : "src/app.js"
                }
                onChange={(e) =>
                  setDialog((d) => (d && d.kind !== "delete" ? { ...d, value: e.target.value } : d))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  if (e.key === "Escape") setDialog(null);
                }}
                className="mb-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDialog(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${dialog.kind === "delete" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}
              >
                {dialog.kind === "delete" ? "Delete" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
