import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@components/ui/card";
import { Code, Terminal, Layout, Zap, Github, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  return (
    <div className="min-h-screen bg-background">
      <section className="container px-4 py-20 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl">
            <span className="text-primary">V</span>exo
          </h1>
          <p className="mb-10 text-lg text-muted-foreground">
            A browser-based AI code editor. Describe what you want to build,
            and the agent writes the files, runs the project in a sandbox, and
            fixes errors automatically.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link to="/auth">
              <Button size="lg" className="gap-2 w-full sm:w-auto">
                Start Building <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                View Demo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/30 py-20">
        <div className="container px-4">
          <h2 className="mb-12 text-center text-3xl font-bold">Features</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <FeatureCard
              icon={Code}
              title="AI Agent"
              description="Describe your project in natural language. The agent plans, writes, and edits files automatically."
            />
            <FeatureCard
              icon={Layout}
              title="Code Editor"
              description="VS Code-style experience with Monaco editor, file explorer, tabs, and syntax highlighting."
            />
            <FeatureCard
              icon={Terminal}
              title="Terminal"
              description="Full terminal with ls, cd, cat, tree, node, npm, and custom vexo commands."
            />
            <FeatureCard
              icon={Zap}
              title="Live Preview"
              description="Instant preview for HTML/CSS/JS and React projects in an isolated iframe sandbox."
            />
            <FeatureCard
              icon={Github}
              title="Import & Export"
              description="Bring files in, download a ZIP, and restore from history snapshots."
            />
            <FeatureCard
              icon={Code}
              title="Auto-Fix"
              description="Preview and terminal errors are sent to the agent automatically for continuous fixing."
            />
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container px-4 text-center">
          <h2 className="mb-6 text-3xl font-bold">Ready to build?</h2>
          <p className="mb-8 text-muted-foreground max-w-2xl mx-auto">
            Sign in with GitHub or Google to start your first project.
          </p>
          <Link to="/auth">
            <Button size="lg" className="gap-2">
              Get Started <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription>{description}</CardDescription>
      </CardContent>
    </Card>
  );
}