import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { useAuth } from "@lib/auth";
import { listProjects, createSnapshot, deleteProject, type Project } from "@lib/projects";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Plus, Trash2, FolderOpen, Copy, Clock, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/projects")({
  component: ProjectsPage,
  beforeLoad: async ({ context: { auth } }) => {
    if (!auth.user) {
      throw redirect({ to: "/auth" });
    }
  },
});

function ProjectsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects", user?.uid],
    queryFn: () => listProjects(user!.uid),
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const projectId = await createSnapshot(user!.uid, "", name, {});
      return projectId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", user?.uid] });
      setShowCreate(false);
      setNewProjectName("");
      toast.success("Project created");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await deleteProject(user!.uid, projectId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", user?.uid] });
      toast.success("Project deleted");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete project");
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectName.trim()) {
      createMutation.mutate(newProjectName.trim());
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Projects</h1>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {showCreate && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create New Project</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex gap-4">
              <Input
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="flex-1"
                autoFocus
              />
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Create"
                )}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {projects.length === 0 && !showCreate && (
        <Card className="text-center py-12">
          <CardContent>
            <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">No projects yet. Create one to get started!</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onDelete={() => deleteMutation.mutate(project.id)}
            isDeleting={deleteMutation.variables === project.id && deleteMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onDelete,
  isDeleting,
}: {
  project: Project;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate">{project.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
        </div>
        <div className="flex gap-2">
          <Link to={`/p/${project.id}`}>
            <Button variant="outline" className="flex-1 gap-2">
              <FolderOpen className="h-4 w-4" />
              Open
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
            className="text-destructive hover:bg-destructive/10"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}