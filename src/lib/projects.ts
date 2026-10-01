import { getFirestoreInstance } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";

export interface Project {
  id: string;
  name: string;
  files: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectSnapshot {
  id: string;
  projectId: string;
  name: string;
  files: Record<string, string>;
  createdAt: Date;
}

function getUserProjectsRef(userId: string) {
  const db = getFirestoreInstance();
  return collection(db, "users", userId, "projects");
}

function getUserHistoryRef(userId: string) {
  const db = getFirestoreInstance();
  return collection(db, "users", userId, "history");
}

export async function listProjects(userId: string): Promise<Project[]> {
  const ref = getUserProjectsRef(userId);
  const q = query(ref, orderBy("updatedAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date(),
  })) as Project[];
}

export async function getProject(userId: string, projectId: string): Promise<Project | null> {
  const db = getFirestoreInstance();
  const ref = doc(db, "users", userId, "projects", projectId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  } as Project;
}

export async function saveProject(
  userId: string,
  project: Omit<Project, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<string> {
  const db = getFirestoreInstance();
  const now = serverTimestamp();
  const projectData = {
    ...project,
    updatedAt: now,
    createdAt: project.id ? undefined : now,
  };

  if (project.id) {
    const ref = doc(db, "users", userId, "projects", project.id);
    await setDoc(ref, projectData, { merge: true });
    return project.id;
  } else {
    const ref = doc(collection(db, "users", userId, "projects"));
    await setDoc(ref, projectData);
    return ref.id;
  }
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  const db = getFirestoreInstance();
  const ref = doc(db, "users", userId, "projects", projectId);
  await deleteDoc(ref);
}

export async function createSnapshot(
  userId: string,
  projectId: string,
  name: string,
  files: Record<string, string>
): Promise<string> {
  const db = getFirestoreInstance();
  const ref = doc(collection(db, "users", userId, "history"));
  await setDoc(ref, {
    projectId,
    name,
    files,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listSnapshots(userId: string, projectId: string): Promise<ProjectSnapshot[]> {
  const ref = getUserHistoryRef(userId);
  const q = query(ref, where("projectId", "==", projectId), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as ProjectSnapshot[];
}

export async function getSnapshot(userId: string, snapshotId: string): Promise<ProjectSnapshot | null> {
  const db = getFirestoreInstance();
  const ref = doc(db, "users", userId, "history", snapshotId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
  } as ProjectSnapshot;
}