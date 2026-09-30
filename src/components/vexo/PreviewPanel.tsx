import { useEffect, useMemo, useState } from "react";
import { RotateCw, Monitor, Smartphone, Tablet, ExternalLink, X } from "lucide-react";
import { buildPreview } from "@/lib/vexo-engine";
import type { FileMap } from "@/lib/projects";

type Props = {
  files: FileMap;
  /** When set, the preview loads this real running-server URL instead of the sandbox. */
  url?: string | null;
  onClose: () => void;
  onConsole: (kind: string, msg: string) => void;
};

const SIZES = { desktop: "100%", tablet: "768px", mobile: "390px" } as const;

export function PreviewPanel({ files, url, onClose, onConsole }: Props) {
  const [nonce, setNonce] = useState(0);
  const [size, setSize] = useState<keyof typeof SIZES>("desktop");
  const [page, setPage] = useState<string | undefined>();
  const built = useMemo(() => buildPreview(files, page), [files, page, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (!e.data?.__vexo) return;
      if (e.data.type === "navigate") {
        const target =
          String(e.data.message)
            .replace(/^\.?\//, "")
            .split(/[?#]/)[0] ?? "";
        if (files[target]) setPage(target);
        return;
      }
      onConsole(e.data.type, e.data.message);
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [files, onConsole]);

  function openTab() {
    if (url) {
      window.open(url, "_blank");
      return;
    }
    const w = window.open("", "_blank");
    if (w) {
      w.document.open();
      w.document.write(built.html);
      w.document.close();
    }
  }

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Preview
        </span>
        <span className="truncate rounded bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {url ?? `/${built.entry ?? "—"}`}
        </span>
        {url && (
          <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            live server
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 text-muted-foreground">
          {(["desktop", "tablet", "mobile"] as const).map((s) => {
            const I = s === "desktop" ? Monitor : s === "tablet" ? Tablet : Smartphone;
            return (
              <button
                key={s}
                title={s}
                onClick={() => setSize(s)}
                className={`rounded p-1 hover:bg-accent ${size === s ? "text-primary" : ""}`}
              >
                <I className="h-3.5 w-3.5" />
              </button>
            );
          })}
          <button
            title="Reload"
            onClick={() => {
              setPage(undefined);
              setNonce((n) => n + 1);
            }}
            className="rounded p-1 hover:bg-accent"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button title="Open in new tab" onClick={openTab} className="rounded p-1 hover:bg-accent">
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button title="Close preview" onClick={onClose} className="rounded p-1 hover:bg-accent">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex flex-1 justify-center overflow-auto bg-secondary/40 p-0">
        {url ? (
          <iframe
            key={url + nonce}
            title="Project preview"
            src={url}
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
            className="h-full border-0 bg-white"
            style={{ width: SIZES[size] }}
          />
        ) : built.entry ? (
          <iframe
            key={nonce + (page ?? "")}
            title="Project preview"
            srcDoc={built.html}
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
            className="h-full border-0 bg-white"
            style={{ width: SIZES[size] }}
          />
        ) : (
          <div className="m-auto max-w-xs text-center text-sm text-muted-foreground">
            No <code className="font-mono">index.html</code> to preview yet. Ask the agent to build
            a web page, or use the terminal for Node scripts.
          </div>
        )}
      </div>
    </div>
  );
}
