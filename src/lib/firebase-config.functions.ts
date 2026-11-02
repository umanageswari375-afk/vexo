import { createServerFn } from "@tanstack/react-start";

// Firebase web config values are public client identifiers (security comes from Firestore rules).
// They are kept in project secrets and handed to the browser at runtime.
export const getFirebaseConfig = createServerFn({ method: "GET" }).handler(async () => {
  return {
    apiKey: (process.env["GOOGLE_API_KEY"] ?? "").trim(),
    authDomain: "vexo-b17a3.firebaseapp.com",
    projectId: "vexo-b17a3",
    storageBucket: "vexo-b17a3.firebasestorage.app",
    messagingSenderId: "802353248161",
    appId: "1:802353248161:web:9c8d2fc0127f8081017de0",
    measurementId: (process.env["GOOGLE_ANALYTICS_MEASUREMENT_ID"] ?? "").trim() || "G-FN6RZTHH6M",
  };
});
