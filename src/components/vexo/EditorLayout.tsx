import { useState, useRef, useEffect } from "react";
import { Editor } from "@monaco-editor/react";
import { FileTree } from "./FileTree";
import { TerminalPanel } from "./TerminalPanel";
import { PreviewPanel } from "./PreviewPanel";
import { AgentChat } from "./AgentChat";
import { Button } from "@components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/tabs";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@components/ui/resizable";
import { FolderOpen, Terminal, Layout, Bot, Save, Copy, Clock, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@lib/utils";
import { type Project } from "@lib/projects";

interface EditorLayoutProps {
  project: Project;
  onSave: (project: Project) => void;
  onSnapshot: (name: string) => void;
  isSaving: boolean;
}

export function EditorLayout({ project, onSave, onSnapshot, isSaving }: EditorLayoutProps) {
  const [activeFile, setActiveFile] = useState<string>(Object.keys(project.files)[0] || "");
  const [openTabs, setOpenTabs] = useState<string[]>(activeFile ? [activeFile] : []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [rightPanel, setRightPanel] = useState<"preview" | "agent" | "history">("preview");
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const editorRef = useRef<Editor>(null);

  useEffect(() => {
    if (activeFile && !openTabs.includes(activeFile)) {
      setOpenTabs([...openTabs, activeFile]);
    }
  }, [activeFile, openTabs]);

  const handleSave = () => {
    if (editorRef.current) {
      const content = editorRef.current.getValue();
      const updatedFiles = { ...project.files, [activeFile]: content };
      onSave({ ...project, files: updatedFiles });
    }
  };

  const handleCreateSnapshot = () => {
    if (snapshotName.trim()) {
      onSnapshot(snapshotName.trim());
      setShowSnapshotDialog(false);
      setSnapshotName("");
    }
  };

  const fileNames = Object.keys(project.files);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={20} minSize={0} maxSize={400}>
          {sidebarOpen && (
            <div className="flex h-full flex-col border-r bg-card">
              <div className="flex h-10 items-center justify-between border-b px-3">
                <h3 className="font-medium text-sm">Explorer</h3>
                <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
              <FileTree
                files={project.files}
                activeFile={activeFile}
                onFileClick={setActiveFile}
                onFileCreate={(path) => {
                  const newFiles = { ...project.files, [path]: "" };
                  onSave({ ...project, files: newFiles });
                  setActiveFile(path);
                }}
                onFileDelete={(path) => {
                  const newFiles = { ...project.files };
                  delete newFiles[path];
                  onSave({ ...project, files: newFiles });
                  if (activeFile === path) {
                    const remaining = Object.keys(newFiles);
                    setActiveFile(remaining[0] || "");
                  }
                }}
              />
            </div>
          )}
          {!sidebarOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 rounded-r-md border-l-0"
              onClick={() => setSidebarOpen(true)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={60} minSize={300}>
          <div className="flex h-full flex-col">
            <div className="flex h-10 items-center justify-between border-b bg-card px-3">
              <Tabs value={activeFile} onValueChange={setActiveFile} className="flex-1 mr-4">
                <TabsList className="h-auto bg-transparent p-0">
                  {openTabs.map((tab) => (
                    <TabsTrigger key={tab} value={tab} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-1.5 text-sm">
                      {tab.split("/").pop()}
                      <X className="ml-2 h-3 w-3" onClick={(e) => {
                        e.stopPropagation();
                        setOpenTabs(openTabs.filter((t) => t !== tab));
                        if (activeFile === tab) {
                          const remaining = openTabs.filter((t) => t !== tab);
                          setActiveFile(remaining[remaining.length - 1] || "");
                        }
                      }} />
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={handleSave} disabled={isSaving} title="Save (Ctrl+S)">
                  {isSaving ? <Save className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setShowSnapshotDialog(true)} title="Create Snapshot">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 relative">
              {activeFile && (
                <Editor
                  ref={editorRef}
                  height="100%"
                  language={getLanguage(activeFile)}
                  theme="vs-dark"
                  value={project.files[activeFile] || ""}
                  onChange={(value) => {
                    if (editorRef.current) {
                      const updatedFiles = { ...project.files, [activeFile]: value };
                      onSave({ ...project, files: updatedFiles });
                    }
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: "on",
                    automaticLayout: true,
                    tabSize: 2,
                  }}
                />
              )}
              {!activeFile && (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <p>No file selected</p>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={20} minSize={0} maxSize={500}>
          <div className="flex h-full flex-col border-l bg-card">
            <Tabs value={rightPanel} onValueChange={setRightPanel} className="flex-1 flex">
              <TabsList className="flex h-10 w-full bg-transparent p-0">
                <TabsTrigger value="preview" className="flex-1 gap-2">
                  <Layout className="h-4 w-4" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="agent" className="flex-1 gap-2">
                  <Bot className="h-4 w-4" />
                  Agent
                </TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="flex-1">
                <PreviewPanel files={project.files} />
              </TabsContent>
              <TabsContent value="agent" className="flex-1">
                <AgentChat
                  project={project}
                  onApplyChanges={(ops) => {
                    const updatedFiles = applyOps(project.files, ops);
                    onSave({ ...project, files: updatedFiles });
                  }}
                />
              </TabsContent>
            </Tabs>
            {terminalOpen && (
              <>
                <ResizableHandle />
                <ResizablePanel defaultSize={30} minSize={100} maxSize={400}>
                  <TerminalPanel projectId={project.id} />
                </ResizablePanel>
              </>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {showSnapshotDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold">Create Snapshot</h3>
            <p className="mb-4 text-sm text-muted-foreground">Give this snapshot a name to restore later.</p>
            <input
              type="text"
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              placeholder="Snapshot name"
              className="w-full mb-4 rounded-md border border-input bg-background px-3 py-2 text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowSnapshotDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateSnapshot} disabled={!snapshotName.trim()}>
                Create Snapshot
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    html: "html",
    htm: "html",
    css: "css",
    json: "json",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    sh: "shell",
    yaml: "yaml",
    yml: "yaml",
  };
  return langMap[ext || ""] || "plaintext";
}

function applyOps(files: Record<string, string>, ops: import("../../lib/vexo-engine").FileOp[]): Record<string, string> {
  const result = { ...files };
  for (const op of ops) {
    switch (op.type) {
      case "create":
      case "update":
        if (op.content !== undefined) {
          result[op.path] = op.content;
        }
        break;
      case "delete":
        delete result[op.path];
        break;
    }
  }
  return result;
}