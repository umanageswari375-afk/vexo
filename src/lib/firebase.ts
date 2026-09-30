import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFirebaseConfig } from "./firebase-config.functions";

let promise: Promise<{ app: FirebaseApp; auth: Auth; db: Firestore }> | null = null;

/** Browser-only lazy Firebase init. */
export function getFirebase() {
  if (!promise) {
    promise = (async () => {
      const config = await getFirebaseConfig();
      if (!config.apiKey) throw new Error("Firebase API key is not configured");
      const app = getApps()[0] ?? initializeApp(config as FirebaseOptions);
      const auth = getAuth(app);
      const db = getFirestore(app);
      if (config.measurementId) {
        import("firebase/analytics")
          .then(async (m) => ((await m.isSupported()) ? m.getAnalytics(app) : null))
          .catch(() => null);
      }
      return { app, auth, db };
    })();
    promise.catch(() => (promise = null));
  }
  return promise;
}
