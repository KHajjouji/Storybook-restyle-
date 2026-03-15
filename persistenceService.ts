import { Project } from "./types";
import { db, auth } from "./firebase";
import { collection, doc, setDoc, getDocs, deleteDoc, query, where } from "firebase/firestore";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const persistenceService = {
  async saveProject(project: Project): Promise<void> {
    if (!auth.currentUser) return;
    const path = `projects/${project.id}`;
    try {
      const projectToSave = {
        id: project.id,
        uid: auth.currentUser.uid,
        name: project.name,
        lastModified: Date.now(),
        settings: JSON.stringify(project.settings),
        pages: JSON.stringify(project.pages),
        thumbnail: project.thumbnail || null
      };
      await setDoc(doc(db, 'projects', project.id), projectToSave);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async getAllProjects(): Promise<Project[]> {
    if (!auth.currentUser) return [];
    const path = 'projects';
    try {
      const q = query(collection(db, path), where("uid", "==", auth.currentUser.uid));
      const querySnapshot = await getDocs(q);
      const projects: Project[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        projects.push({
          id: data.id,
          name: data.name,
          lastModified: data.lastModified,
          settings: JSON.parse(data.settings),
          pages: JSON.parse(data.pages),
          thumbnail: data.thumbnail
        });
      });
      return projects.sort((a, b) => b.lastModified - a.lastModified);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async deleteProject(id: string): Promise<void> {
    if (!auth.currentUser) return;
    const path = `projects/${id}`;
    try {
      await deleteDoc(doc(db, 'projects', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
};