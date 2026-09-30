import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { getFirebase } from "./firebase";

type AuthState = { user: User | null; loading: boolean; error: string | null };
const Ctx = createContext<AuthState>({ user: null, loading: true, error: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });
  useEffect(() => {
    let unsub = () => {};
    getFirebase()
      .then(async ({ auth }) => {
        const { onAuthStateChanged } = await import("firebase/auth");
        unsub = onAuthStateChanged(auth, (user) => setState({ user, loading: false, error: null }));
      })
      .catch((e) => setState({ user: null, loading: false, error: String(e?.message ?? e) }));
    return () => unsub();
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export async function signOutUser() {
  const { auth } = await getFirebase();
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
}
