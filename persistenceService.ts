import { Project } from "./types";

const STORAGE_KEY = 'storyflow_projects_v1';

export const persistenceService = {
  saveProject: async (project: Project): Promise<void> => {
    // In a real Google Cloud environment, this would call Firestore/Firebase
    // We simulate the delay and the persistent storage
    return new Promise((resolve) => {
      setTimeout(() => {
        const existing = persistenceService.getAllProjects();
        const index = existing.findIndex(p => p.id === project.id);
        
        if (index > -1) {
          existing[index] = { ...project, lastModified: Date.now() };
        } else {
          existing.push({ ...project, lastModified: Date.now() });
        }
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
        resolve();
      }, 600);
    });
  },

  getAllProjects: (): Project[] => {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  getProjectById: (id: string): Project | undefined => {
    return persistenceService.getAllProjects().find(p => p.id === id);
  },

  deleteProject: (id: string): void => {
    const existing = persistenceService.getAllProjects();
    const filtered = existing.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }
};