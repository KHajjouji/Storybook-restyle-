import { Project } from "./types";
import { db, auth } from "./firebase";
import { collection, doc, setDoc, getDocs, deleteDoc, query, where } from "firebase/firestore";
import { set, get, del } from 'idb-keyval';

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
      // Save large data to IndexedDB
      await set(`project_pages_${project.id}`, project.pages);
      if (project.coverLayers) {
        await set(`project_coverLayers_${project.id}`, project.coverLayers);
      }
      if (project.coverImage) {
        await set(`project_coverImage_${project.id}`, project.coverImage);
      }
      if (project.settings.styleReference) {
        await set(`project_styleReference_${project.id}`, project.settings.styleReference);
      }
      if (project.settings.characterReferences && project.settings.characterReferences.length > 0) {
        await set(`project_characterReferences_${project.id}`, project.settings.characterReferences);
      }
      if (project.thumbnail) {
        await set(`project_thumbnail_${project.id}`, project.thumbnail);
      }

      // Strip large base64 data for Firestore to avoid 1MB limit
      const strippedPages = project.pages.map(p => ({
        ...p,
        originalImage: undefined,
        processedImage: undefined,
        layers: undefined,
        retargeting: p.retargeting ? { ...p.retargeting, sourceImage: undefined } : undefined
      }));

      const strippedSettings = {
        ...project.settings,
        styleReference: undefined,
        characterReferences: project.settings.characterReferences.map(c => ({
          ...c,
          images: [] // Strip images for Firestore
        }))
      };

      const projectToSave = {
        id: project.id,
        uid: auth.currentUser.uid,
        name: project.name,
        lastModified: Date.now(),
        settings: JSON.stringify(strippedSettings),
        pages: JSON.stringify(strippedPages),
        thumbnail: null, // Stored locally
        currentStep: project.currentStep || null,
        fullScript: project.fullScript || null,
        activityScript: project.activityScript || null,
        nicheTopic: project.nicheTopic || null,
        nicheResult: project.nicheResult || null,
        coverImage: null, // Stored locally
        coverLayers: null, // Stored locally
        projectContext: project.projectContext || null,
        enableActivityDesigner: project.enableActivityDesigner || false,
        globalFixPrompt: project.globalFixPrompt || null,
        targetAspectRatio: project.targetAspectRatio || null,
        targetResolution: project.targetResolution || null
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
      
      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        
        // Load local data
        const localPages = await get(`project_pages_${data.id}`);
        const localCoverLayers = await get(`project_coverLayers_${data.id}`);
        const localCoverImage = await get(`project_coverImage_${data.id}`);
        const localStyleReference = await get(`project_styleReference_${data.id}`);
        const localCharacterReferences = await get(`project_characterReferences_${data.id}`);
        const localThumbnail = await get(`project_thumbnail_${data.id}`);

        const remotePages = JSON.parse(data.pages);
        let mergedPages = remotePages;
        
        if (localPages && Array.isArray(localPages)) {
          // Merge local images into remote pages based on ID
          mergedPages = remotePages.map((remotePage: any) => {
            const localPage = localPages.find((p: any) => p.id === remotePage.id);
            if (localPage) {
              return {
                ...remotePage,
                originalImage: localPage.originalImage || remotePage.originalImage,
                processedImage: localPage.processedImage || remotePage.processedImage,
                layers: localPage.layers || remotePage.layers,
                retargeting: remotePage.retargeting ? {
                  ...remotePage.retargeting,
                  sourceImage: localPage.retargeting?.sourceImage || remotePage.retargeting?.sourceImage
                } : undefined
              };
            }
            return remotePage;
          });
        }

        const parsedSettings = JSON.parse(data.settings);
        if (localStyleReference) {
          parsedSettings.styleReference = localStyleReference;
        }
        if (localCharacterReferences && Array.isArray(localCharacterReferences)) {
          // Merge local character images into remote character references
          parsedSettings.characterReferences = parsedSettings.characterReferences.map((remoteChar: any) => {
            const localChar = localCharacterReferences.find((c: any) => c.id === remoteChar.id);
            if (localChar) {
              return {
                ...remoteChar,
                images: localChar.images || []
              };
            }
            return remoteChar;
          });
        }

        projects.push({
          id: data.id,
          name: data.name,
          lastModified: data.lastModified,
          settings: parsedSettings,
          pages: mergedPages,
          thumbnail: localThumbnail || data.thumbnail,
          currentStep: data.currentStep,
          fullScript: data.fullScript,
          activityScript: data.activityScript,
          nicheTopic: data.nicheTopic,
          nicheResult: data.nicheResult,
          coverImage: localCoverImage || data.coverImage,
          coverLayers: localCoverLayers || (data.coverLayers ? JSON.parse(data.coverLayers) : undefined),
          projectContext: data.projectContext,
          enableActivityDesigner: data.enableActivityDesigner,
          globalFixPrompt: data.globalFixPrompt,
          targetAspectRatio: data.targetAspectRatio,
          targetResolution: data.targetResolution
        });
      }
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
      await del(`project_pages_${id}`);
      await del(`project_coverLayers_${id}`);
      await del(`project_coverImage_${id}`);
      await del(`project_styleReference_${id}`);
      await del(`project_characterReferences_${id}`);
      await del(`project_thumbnail_${id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async saveUserStyle(style: import('./types').UserStyle): Promise<void> {
    if (!auth.currentUser) return;
    const path = `userStyles/${style.id}`;
    try {
      const styleToSave = {
        ...style,
        uid: auth.currentUser.uid
      };
      await setDoc(doc(db, 'userStyles', style.id), styleToSave);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async getUserStyles(): Promise<import('./types').UserStyle[]> {
    if (!auth.currentUser) return [];
    const path = 'userStyles';
    try {
      const q = query(collection(db, path), where("uid", "==", auth.currentUser.uid));
      const querySnapshot = await getDocs(q);
      const styles: import('./types').UserStyle[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        styles.push({
          id: data.id,
          name: data.name,
          image: data.image,
          prompt: data.prompt,
          createdAt: data.createdAt
        });
      });
      return styles.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async deleteUserStyle(id: string): Promise<void> {
    if (!auth.currentUser) return;
    const path = `userStyles/${id}`;
    try {
      await deleteDoc(doc(db, 'userStyles', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
};