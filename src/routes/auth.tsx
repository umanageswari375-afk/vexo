import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import mascot from "@/assets/vexo-mascot.png";
import { VexoLogo } from "@/components/vexo/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Vexo" },
      {
        name: "description",
        content: "Sign in to Vexo to create and save your AI-built projects.",
      },
      { property: "og:title", content: "Sign in — Vexo" },
      { property: "og:description", content: "Access your Vexo projects." },
    ],
  }),
  component: AuthPage,
});

const CONFIG_CODES = new Set([
  "auth/configuration-not-found",
  "auth/operation-not-allowed",
  "auth/admin-restricted-operation",
]);

function friendly(e: unknown) {
  const code = (e as { code?: string })?.code ?? "";
  if (CONFIG_CODES.has(code))
    return "This sign-in method isn't switched on in your Firebase project yet.";
  const map: Record<string, string> = {
    "auth/invalid-credential": "Wrong email or password.",
    "auth/email-already-in-use": "That email already has an account — sign in instead.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-email": "Please enter a valid email.",
    "auth/popup-closed-by-user": "Sign-in was closed.",
    "auth/unauthorized-domain": "This domain isn't authorised in Firebase Authentication settings.",
  };
  return map[code] ?? (e as Error)?.message ?? "Something went wrong";
}

function isConfigIssue(e: unknown) {
  return CONFIG_CODES.has((e as { code?: string })?.code ?? "");
}

function RecoverySteps({ method }: { method: "email" | "google" | "github" }) {
  const label = method === "email" ? "Email/Password" : method === "github" ? "GitHub" : "Google";
  return (
    <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <p className="font-semibold text-amber-400">{label} sign-in isn't enabled in Firebase yet</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>
          Open the{" "}
          <a
            className="text-primary underline"
            href="https://console.firebase.google.com"
            target="_blank"
            rel="noreferrer"
          >
            Firebase Console
          </a>{" "}
          and select your project (<span className="font-mono">vexo-b17a3</span>).
        </li>
        <li>
          Go to <span className="text-foreground">Build → Authentication → Get started</span>.
        </li>
        <li>
          On the <span className="text-foreground">Sign-in method</span> tab, enable{" "}
          <span className="text-foreground">{label}</span> and save.
        </li>
        <li>
          If you see a domain error, add this site's domain under{" "}
          <span className="text-foreground">Authentication → Settings → Authorized domains</span>.
        </li>
        <li>Come back here and try again.</li>
      </ol>
    </div>
  );
}

function AuthPage() {
  const { user, loading, error } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [configIssue, setConfigIssue] = useState<"email" | "google" | "github" | null>(null);

  useEffect(() => {
    if (user) nav({ to: "/projects", replace: true });
  }, [user, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { auth } = await getFirebase();
      const m = await import("firebase/auth");
      if (mode === "up") await m.createUserWithEmailAndPassword(auth, email, password);
      else await m.signInWithEmailAndPassword(auth, email, password);
      setConfigIssue(null);
    } catch (err) {
      if (isConfigIssue(err)) setConfigIssue("email");
      toast.error(friendly(err));
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    try {
      const { auth } = await getFirebase();
      const m = await import("firebase/auth");
      await m.signInWithPopup(auth, new m.GoogleAuthProvider());
      setConfigIssue(null);
    } catch (err) {
      if (isConfigIssue(err)) setConfigIssue("google");
      toast.error(friendly(err));
    } finally {
      setBusy(false);
    }
  }
  async function github() {
    setBusy(true);
    try {
      const { auth } = await getFirebase();
      const m = await import("firebase/auth");
      await m.signInWithPopup(auth, new m.GithubAuthProvider());
      setConfigIssue(null);
    } catch (err) {
      if (isConfigIssue(err)) setConfigIssue("github");
      toast.error(friendly(err));
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!email) {
      toast.error("Enter your email first.");
      return;
    }
    try {
      const { auth } = await getFirebase();
      const m = await import("firebase/auth");
      await m.sendPasswordResetEmail(auth, email);
      toast.success("Password reset email sent.");
    } catch (err) {
      toast.error(friendly(err));
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col p-8">
        <VexoLogo />
        <div className="m-auto w-full max-w-sm">
          <h1 className="text-3xl font-bold">
            {mode === "in" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your projects are saved privately to your account.
          </p>
          {error && (
            <p className="mt-4 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
              Couldn't connect to Firebase: {error}
            </p>
          )}
          {configIssue && <RecoverySteps method={configIssue} />}
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="em">Email</Label>
              <Input
                id="em"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw">Password</Label>
              <Input
                id="pw"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button className="w-full" disabled={busy || loading}>
              {mode === "in" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <Button
            variant="secondary"
            className="mt-3 w-full"
            onClick={google}
            disabled={busy || loading}
          >
            Continue with Google
          </Button>
          <Button
            variant="secondary"
            className="mt-2 w-full"
            onClick={github}
            disabled={busy || loading}
          >
            Continue with GitHub
          </Button>
          <div className="mt-4 flex justify-between text-sm text-muted-foreground">
            <button
              className="hover:text-foreground"
              onClick={() => setMode(mode === "in" ? "up" : "in")}
            >
              {mode === "in" ? "New here? Create account" : "Have an account? Sign in"}
            </button>
            {mode === "in" && (
              <button className="hover:text-foreground" onClick={reset}>
                Forgot password?
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="relative hidden items-center justify-center overflow-hidden border-l border-border bg-panel md:flex">
        <div className="grid-bg absolute inset-0 opacity-40" />
        <img
          src={mascot}
          alt="Vexo mascot"
          width={1024}
          height={1024}
          className="animate-float relative w-80"
        />
      </div>
    </div>
  );
}
