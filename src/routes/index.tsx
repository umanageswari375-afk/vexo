import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FolderTree, Terminal, Eye, Bot, Wrench, Download } from "lucide-react";
import mascot from "@/assets/vexo-mascot.png";
import { VexoLogo } from "@/components/vexo/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vexo — Describe it. Vexo builds it." },
      {
        name: "description",
        content:
          "Vexo is an AI coding agent, code editor, terminal and live preview in one workspace.",
      },
      { property: "og:title", content: "Vexo — Describe it. Vexo builds it." },
      {
        property: "og:description",
        content:
          "AI agent that creates files, runs your project and fixes errors — in your browser.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Bot,
    title: "AI Agent",
    text: "Describe a project. The agent plans, writes every file and edits many at once.",
  },
  {
    icon: FolderTree,
    title: "Explorer + Editor",
    text: "Full file tree with a real code editor, tabs and syntax highlighting.",
  },
  {
    icon: Terminal,
    title: "Terminal",
    text: "ls, cd, cat, node, npm run dev — run and inspect your project.",
  },
  {
    icon: Eye,
    title: "Live Preview",
    text: "Run HTML, CSS, JS and React instantly in an isolated preview.",
  },
  {
    icon: Wrench,
    title: "Auto-fix",
    text: "Preview and terminal errors go straight back to the agent to fix.",
  },
  {
    icon: Download,
    title: "Import / Export",
    text: "Bring your files in, download a ZIP, undo any AI change.",
  },
];

function Landing() {
  const { user } = useAuth();
  const cta = user ? "/projects" : "/auth";
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <VexoLogo />
        <Button asChild variant={user ? "default" : "secondary"}>
          <Link to={cta}>{user ? "Open projects" : "Sign in"}</Link>
        </Button>
      </header>

      <section className="relative overflow-hidden">
        <div className="grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 font-mono text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> AI development environment
            </span>
            <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Describe it.
              <br />
              <span className="bg-gradient-primary bg-clip-text text-transparent">
                Vexo builds it.
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Vexo's agent creates your project, writes the files, runs it, catches errors and fixes
              them — while you watch in the editor, terminal and preview.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="shadow-glow">
                <Link to={cta}>
                  Start building <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="mt-8 rounded-lg border border-border bg-editor p-4 font-mono text-sm">
              <p className="text-muted-foreground">
                $ vexo "portfolio site with dark mode and contact form"
              </p>
              <p className="mt-2 text-primary">✓ created index.html, style.css, script.js</p>
              <p className="text-primary">✓ preview running · 0 errors</p>
            </div>
          </div>
          <img
            src={mascot}
            alt="Vexo, the AI coding robot"
            width={1024}
            height={1024}
            className="animate-float mx-auto w-72 md:w-96"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="bg-card p-6">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
