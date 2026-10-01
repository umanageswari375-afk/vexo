import { useState } from "react";
import { Button } from "@components/ui/button";
import { cn } from "@lib/utils";
import { FileText, Folder, Plus, Trash2, ChevronRight, ChevronDown } from "lucide-react";

interface FileTreeProps {
  files: Record<string, string>;
  activeFile: string;
  onFileClick: (path: string) => void;
  onFileCreate: (path: string) => void;
  onFileDelete: (path: string) => void;
}

export function FileTree({ files, activeFile, onFileClick, onFileCreate, onFileDelete }: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set([""]));
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");

  const tree = buildTree(files);

  function buildTree(files: Record<string, string>) {
    const root: TreeNode = { name: "", path: "", type: "folder", children: [] };
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split("/");
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        const currentPath = parts.slice(0, i + 1).join("/");
        let child = current.children.find((c) => c.name === part);
        if (!child) {
          child = {
            name: part,
            path: currentPath,
            type: isFile ? "file" : "folder",
            children: isFile ? undefined : [],
          };
          current.children.push(child);
        }
        current = child;
      }
    }
    return root;
  }

  function renderNode(node: TreeNode, depth: number = 0) {
    const isExpanded = expandedFolders.has(node.path);
    const isActive = activeFile === node.path;

    if (node.type === "file") {
      return (
        <div
          key={node.path}
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-accent transition-colors",
            isActive && "bg-accent text-accent-foreground"
          )}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => onFileClick(node.path)}
        >
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">{node.name}</span>
        </div>
      );
    }

    return (
      <div key={node.path}>
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-accent transition-colors",
            isActive && "bg-accent text-accent-foreground"
          )}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedFolders((prev) => {
                const next = new Set(prev);
                if (next.has(node.path)) {
                  next.delete(node.path);
                } else {
                  next.add(node.path);
                }
                return next;
              });
            }}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
          <Folder className={cn("h-4 w-4", isExpanded ? "text-primary" : "text-muted-foreground")} />
          <span className="font-medium">{node.name}</span>
        </div>
        {isExpanded && (
          <div>
            {node.children?.map((child) => renderNode(child, depth + 1))}
            {creatingIn === node.path && (
              <div style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }} className="flex items-center gap-1 px-2 py-1">
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFileName.trim()) {
                      onFileCreate(`${node.path}/${newFileName.trim()}`);
                      setCreatingIn(null);
                      setNewFileName("");
                    } else if (e.key === "Escape") {
                      setCreatingIn(null);
                      setNewFileName("");
                    }
                  }}
                  autoFocus
                  className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      {tree.children.map((child) => renderNode(child))}
      <div className="mt-4 border-t pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => {
            setCreatingIn("");
            setNewFileName("");
          }}
        >
          <Plus className="h-4 w-4" />
          New File
        </Button>
      </div>
    </div>
  );
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
}