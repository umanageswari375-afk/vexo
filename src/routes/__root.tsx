import { createRootRoute, Outlet, Link } from "@tanstack/react-router";
import { useAuth } from "@lib/auth";
import { Toaster } from "sonner";
import { Button } from "@components/ui/button";

export const Route = createRootRoute({
  component: () => (
    <AuthProvider>
      <div className="min-h-screen bg-background font-sans antialiased">
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="container flex h-16 items-center justify-between px-4">
            <Link to="/" className="flex items-center gap-2 font-bold text-xl">
              <span className="text-primary">V</span>exo
            </Link>
            <nav className="flex items-center gap-4">
              <NavLinks />
            </nav>
          </div>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
        <Toaster position="top-right" />
      </div>
    </AuthProvider>
  ),
});

function NavLinks() {
  const { user, signOutUser } = useAuth();

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/auth" className="text-sm font-medium hover:text-primary">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <Link to="/projects" className="text-sm font-medium hover:text-primary">
        Projects
      </Link>
      <Button variant="ghost" size="sm" onClick={() => signOutUser()}>
        Sign out
      </Button>
    </div>
  );
}