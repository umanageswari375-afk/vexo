import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuth } from "@lib/auth";
import { getProject, saveProject, createSnapshot, type Project } from "@lib/projects";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EditorLayout } from "@components/vexo/EditorLayout";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/p/$projectId")({
  component: WorkspacePage,
  beforeLoad: async ({ context: { auth }, params }) => {
    if (!auth.user) {
      throw redirect({ to: "/auth" });
    }
    const project = await getProject(auth.user.uid, params.projectId);
    if (!project) {
      throw redirect({ to: "/projects" });
    }
  },
});

function WorkspacePage({ params }: { params: { projectId: string } }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { data: projectData, isLoading: queryLoading } = useQuery({
    queryKey: ["project", user?.uid, params.projectId],
    queryFn: () => getProject(user!.uid, params.projectId),
    enabled: !!user,
  });

  useEffect(() => {
    if (projectData) {
      setProject(projectData);
      setIsLoading(false);
    } else if (!queryLoading) {
      setIsLoading(false);
    }
  }, [projectData, queryLoading]);

  const saveMutation = useMutation({
    mutationFn: async (updatedProject: Project) => {
      await saveProject(user!.uid, updatedProject);
      return updatedProject;
    },
    onSuccess: (savedProject) => {
      queryClient.setQueryData(["project", user?.uid, params.projectId], savedProject);
      setProject(savedProject);
    },
  });

  const snapshotMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!project) return;
      await createSnapshot(user!.uid, project.id, name, project.files);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshots", user?.uid, project?.id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  return (
    <EditorLayout
      project={project}
      onSave={(updatedProject) => saveMutation.mutate(updatedProject)}
      onSnapshot={(name) => snapshotMutation.mutate(name)}
      isSaving={saveMutation.isPending}
    />
  );
}