import { Project } from "./types";
import { supabaseService, supabase, isSupabaseConfigured } from "./supabaseService";

const DB_NAME = 'StoryFlowDB';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const persistenceService = {
  async saveProject(project: Project): Promise<void> {
    // 1. Save to Local IndexedDB (Always)
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const projectToSave = { ...project, lastModified: Date.now() };
      const request = store.put(projectToSave);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // 2. Save to Cloud if user is logged in and Supabase is configured
    if (isSupabaseConfigured && supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        try {
          await supabaseService.saveProject(project, user.id);
        } catch (e) {
          console.warn("Cloud sync failed, project saved locally only:", e);
        }
      }
    }
  },

  async getAllProjects(): Promise<Project[]> {
    // 1. Get from Local IndexedDB
    const db = await getDB();
    const localProjects = await new Promise<Project[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    // 2. Get from Cloud if user is logged in and Supabase is configured
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const cloudProjects = await supabaseService.getProjects(user.id);
          // Merge - cloud projects take precedence for same ID if newer
          const merged = [...localProjects];
          cloudProjects.forEach(cp => {
            const index = merged.findIndex(lp => lp.id === cp.id);
            if (index !== -1) {
              if (cp.lastModified > merged[index].lastModified) {
                merged[index] = cp;
              }
            } else {
              merged.push(cp);
            }
          });
          return merged.sort((a, b) => b.lastModified - a.lastModified);
        }
      } catch (e) {
        console.warn("Could not fetch cloud projects, showing local only:", e);
      }
    }

    return localProjects.sort((a, b) => b.lastModified - a.lastModified);
  },

  async deleteProject(id: string): Promise<void> {
    // Delete local
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Delete cloud if configured
    if (isSupabaseConfigured && supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabaseService.deleteProject(id);
      }
    }
  }
};