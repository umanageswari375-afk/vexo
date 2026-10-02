import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { getFirebase } from "./firebase";

export type FileMap = Record<string, string>;
export type ChatMsg = { role: "user" | "assistant"; content: string; ops?: string[] };
export type Project = {
  id: string;
  name: string;
  description: string;
  template: string;
  files: FileMap;
  chat: ChatMsg[];
  env: string;
  updatedAt?: { seconds: number } | null;
};

// Firestore layout: users/{uid}/projects/{projectId}  (+ /history/{snapshotId})
// File paths contain "/" and ".", which aren't valid map keys, so files are stored as an array.
type Stored = Omit<Project, "id" | "files"> & { files: { path: string; content: string }[] };

async function ctx() {
  const { auth, db } = await getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  return { db, uid };
}
const toArr = (f: FileMap) => Object.entries(f).map(([path, content]) => ({ path, content }));
const toMap = (a: { path: string; content: string }[] = []) =>
  Object.fromEntries(a.map((x) => [x.path, x.content]));

// Firestore rejects documents larger than 1 MiB, and the project is stored in a single
// document, so oversized imports must fail with a clear message instead of an opaque error.
const MAX_DOC_BYTES = 1024 * 1024;
function assertFits(files: FileMap) {
  const bytes = JSON.stringify(toArr(files)).length;
  if (bytes > MAX_DOC_BYTES * 0.9) {
    const mb = (bytes / 1024 / 1024).toFixed(2);
    throw new Error(
      `This project is ${mb} MB, over the ~1 MB a single saved project can hold. ` +
        `Remove large files (often images or node_modules folders) and try again.`,
    );
  }
}

export async function listProjects(): Promise<Project[]> {
  const { db, uid } = await ctx();
  const snap = await getDocs(
    query(collection(db, "users", uid, "projects"), orderBy("updatedAt", "desc")),
  );
  return snap.docs.map((d) => {
    const s = d.data() as Stored;
    return { ...s, id: d.id, files: toMap(s.files) };
  });
}

export async function getProject(id: string): Promise<Project | null> {
  const { db, uid } = await ctx();
  const d = await getDoc(doc(db, "users", uid, "projects", id));
  if (!d.exists()) return null;
  const s = d.data() as Stored;
  return { ...s, id: d.id, files: toMap(s.files), chat: s.chat ?? [], env: s.env ?? "" };
}

export async function createProject(p: {
  name: string;
  description: string;
  template: string;
  files: FileMap;
}) {
  const { db, uid } = await ctx();
  assertFits(p.files);
  const ref = await addDoc(collection(db, "users", uid, "projects"), {
    ...p,
    files: toArr(p.files),
    chat: [],
    env: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function saveProject(id: string, patch: Partial<Omit<Project, "id">>) {
  const { db, uid } = await ctx();
  if (patch.files) assertFits(patch.files);
  const data: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
  if (patch.files) data["files"] = toArr(patch.files);
  if (patch.chat)
    data["chat"] = patch.chat
      .slice(-60)
      .map((m) => ({ role: m.role, content: m.content, ops: m.ops ?? [] }));
  await updateDoc(doc(db, "users", uid, "projects", id), data);
}

export async function deleteProject(id: string) {
  const { db, uid } = await ctx();
  await deleteDoc(doc(db, "users", uid, "projects", id));
}

export async function pushHistory(id: string, label: string, files: FileMap) {
  const { db, uid } = await ctx();
  await addDoc(collection(db, "users", uid, "projects", id, "history"), {
    label,
    files: toArr(files),
    createdAt: serverTimestamp(),
  });
}

export async function listHistory(id: string) {
  const { db, uid } = await ctx();
  const snap = await getDocs(
    query(
      collection(db, "users", uid, "projects", id, "history"),
      orderBy("createdAt", "desc"),
      limit(20),
    ),
  );
  return snap.docs.map((d) => {
    const s = d.data() as {
      label: string;
      files: { path: string; content: string }[];
      createdAt?: { seconds: number };
    };
    return { id: d.id, label: s.label, files: toMap(s.files), at: s.createdAt?.seconds ?? 0 };
  });
}
