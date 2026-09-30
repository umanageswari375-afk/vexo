import { createServerFn } from "@tanstack/react-start";

// Firebase web config values are public client identifiers (security comes from Firestore rules).
// They are kept in project secrets and handed to the browser at runtime.
export const getFirebaseConfig = createServerFn({ method: "GET" }).handler(async () => {
  return {
    apiKey: (process.env["GOOGLE_API_KEY"] ?? "").trim(),
    authDomain: "vexo-77de7.firebaseapp.com",
    projectId: "vexo-77de7",
    storageBucket: "vexo-77de7.firebasestorage.app",
    messagingSenderId: "154610180232",
    appId: "1:154610180232:web:236d163e697e5a77d37f3d",
    measurementId: (process.env["GOOGLE_ANALYTICS_MEASUREMENT_ID"] ?? "").trim() || undefined,
  };
});
