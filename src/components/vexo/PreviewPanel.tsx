import { useEffect, useRef, useState } from "react";
import { buildPreview } from "@lib/vexo-engine";
import { Button } from "@components/ui/button";
import { RefreshCw, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@lib/utils";

interface PreviewPanelProps {
  files: Record<string, string>;
}

export function PreviewPanel({ files }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [maximized, setMaximized] = useState(false);
  const [previewSrc, setPreviewSrc] = useState("");

  useEffect(() => {
    const html = buildPreview(files);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setPreviewSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [files]);

  const refresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col border-l bg-card",
        maximized && "fixed inset-0 z-50 h-[80vh] w-[80vw] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg shadow-xl"
      )}
    >
      <div className="flex h-10 items-center justify-between border-b px-3">
        <span className="text-sm font-medium">Preview</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={refresh} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMaximized(!maximized)}
            title={maximized ? "Minimize" : "Maximize"}
          >
            {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          {!maximized && previewSrc && (
            <a href={previewSrc} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" title="Open in new tab">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          )}
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden">
        {previewSrc ? (
          <iframe
            ref={iframeRef}
            src={previewSrc}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            title="Project Preview"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p>Generating preview...</p>
          </div>
        )}
      </div>
    </div>
  );
}