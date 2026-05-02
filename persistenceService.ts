import { Project } from "./types";
import { db, auth } from "./firebase";
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where } from "firebase/firestore";
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
  const errMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map((provider: any) => ({
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
  
  if (errMsg.includes('Quota exceeded') || errMsg.includes('resource-exhausted')) {
    throw new Error('Quota exceeded. Your data is perfectly safe! If you just upgraded to Blaze, it may take a few minutes for the limits to update. Please wait a moment and try again.');
  }
  
  throw new Error(errMsg);
}

const chunkCache = new Map<string, number>();

export const persistenceService = {
  // Utility for chunking large strings into Firestore
  async saveChunks(projectId: string, chunkType: string, id: string, data: string): Promise<void> {
    if (!data) return;
    const cacheKey = `${projectId}_${chunkType}_${id}`;
    if (chunkCache.get(cacheKey) === data.length) {
      return; // Already uploaded this exact size
    }
    
    const CHUNK_SIZE = 900 * 1024; // 900KB
    const chunks = [];
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      chunks.push(data.slice(i, i + CHUNK_SIZE));
    }
    const baseRef = doc(db, `projects/${projectId}/${chunkType}`, id);
    try {
      await setDoc(baseRef, { chunkCount: chunks.length });
      for (let i = 0; i < chunks.length; i++) {
        await setDoc(doc(db, `projects/${projectId}/${chunkType}/${id}/chunks`, i.toString()), { data: chunks[i] });
      }
      chunkCache.set(cacheKey, data.length);
    } catch (e) {
      console.warn('Failed to save chunk to Firestore, may be too large', e);
      await set(`project_${chunkType}_${id}`, data); // fallback to IDB
    }
  },

  async loadChunks(projectId: string, chunkType: string, id: string): Promise<string | null> {
    const baseRef = doc(db, `projects/${projectId}/${chunkType}`, id);
    try {
      const snap = await getDoc(baseRef);
      if (snap.exists()) {
        const chunkCount = snap.data().chunkCount;
        let fullString = "";
        for (let i = 0; i < chunkCount; i++) {
          const chunkSnap = await getDoc(doc(db, `projects/${projectId}/${chunkType}/${id}/chunks`, i.toString()));
          if (chunkSnap.exists()) {
            fullString += chunkSnap.data().data || "";
          }
        }
        return fullString;
      }
    } catch (e) {
      console.error(e);
    }
    // Fallback to idb
    const idbData = await get(`project_${chunkType}_${id}`);
    return idbData || null;
  },

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
      
      // Save full page images to Firestore chunks
      for (const p of project.pages) {
        if (p.originalImage) await this.saveChunks(project.id, 'page_originalImage', p.id, p.originalImage);
        if (p.processedImage) await this.saveChunks(project.id, 'page_processedImage', p.id, p.processedImage);
        if (p.layers && p.layers.length > 0) await this.saveChunks(project.id, 'page_layers', p.id, JSON.stringify(p.layers));
      }
      
      if (project.coverImage) {
        await this.saveChunks(project.id, 'project_coverImage', project.id, project.coverImage);
      }
      if (project.coverLayers && project.coverLayers.length > 0) {
        await this.saveChunks(project.id, 'project_coverLayers', project.id, JSON.stringify(project.coverLayers));
      }

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
        
        // Fast path: Only load thumbnail
        const localThumbnail = await get(`project_thumbnail_${data.id}`);

        const parsedSettings = JSON.parse(data.settings);

        projects.push({
          id: data.id,
          name: data.name,
          lastModified: data.lastModified,
          settings: parsedSettings,
          pages: [], // We don't load pages here anymore to save time
          thumbnail: localThumbnail || data.thumbnail,
          currentStep: data.currentStep,
          fullScript: data.fullScript,
          activityScript: data.activityScript,
          nicheTopic: data.nicheTopic,
          nicheResult: data.nicheResult,
          coverImage: data.coverImage,
          coverLayers: data.coverLayers ? JSON.parse(data.coverLayers) : undefined,
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

  async getProject(id: string): Promise<Project | null> {
    if (!auth.currentUser) return null;
    const path = `projects/${id}`;
    try {
      const docSnap = await getDoc(doc(db, 'projects', id));
      if (!docSnap.exists()) return null;
      
      const data = docSnap.data();
      
      // Load local data
      const localPages = await get(`project_pages_${data.id}`);
      const localCoverLayers = await get(`project_coverLayers_${data.id}`);
      const localCoverImage = await get(`project_coverImage_${data.id}`);
      const localStyleReference = await get(`project_styleReference_${data.id}`);
      const localCharacterReferences = await get(`project_characterReferences_${data.id}`);
      const localThumbnail = await get(`project_thumbnail_${data.id}`);

      const remotePages = JSON.parse(data.pages);
      // Load remote chunks ONLY if not available locally
      let remoteCoverImage = localCoverImage || data.coverImage;
      if (!remoteCoverImage) {
        remoteCoverImage = await persistenceService.loadChunks(data.id, 'project_coverImage', data.id);
      }
      
      let coverLayers = localCoverLayers || (data.coverLayers ? JSON.parse(data.coverLayers) : undefined);
      if (!coverLayers) {
        const remoteCoverLayersStr = await persistenceService.loadChunks(data.id, 'project_coverLayers', data.id);
        coverLayers = remoteCoverLayersStr ? JSON.parse(remoteCoverLayersStr) : undefined;
      }
      
      // Merge remote and local images into remote pages based on ID
      const mergedPages = await Promise.all(remotePages.map(async (remotePage: any) => {
        const localPage = localPages && Array.isArray(localPages) ? localPages.find((p: any) => p.id === remotePage.id) : undefined;
        
        let processedImg = localPage?.processedImage || remotePage.processedImage;
        let originalImg = localPage?.originalImage || remotePage.originalImage;
        let layers = localPage?.layers || remotePage.layers;

        if (!processedImg && remotePage.status === 'completed') {
          processedImg = await persistenceService.loadChunks(data.id, 'page_processedImage', remotePage.id);
        }
        if (!originalImg) {
          originalImg = await persistenceService.loadChunks(data.id, 'page_originalImage', remotePage.id);
        }
        if (!layers || layers.length === 0) {
          const remoteLayersStr = await persistenceService.loadChunks(data.id, 'page_layers', remotePage.id);
          layers = remoteLayersStr ? JSON.parse(remoteLayersStr) : undefined;
        }
        
        // Reset status if completed but images are missing
        let status = remotePage.status;
        if (status === 'completed' && !processedImg && !originalImg) {
          status = 'idle';
        }
        
        return {
          ...remotePage,
          status,
          originalImage: originalImg,
          processedImage: processedImg,
          layers: layers,
          retargeting: remotePage.retargeting ? {
            ...remotePage.retargeting,
            sourceImage: localPage?.retargeting?.sourceImage || remotePage.retargeting?.sourceImage
          } : undefined
        };
      }));

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

      return {
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
        coverImage: remoteCoverImage,
        coverLayers: coverLayers,
        projectContext: data.projectContext,
        enableActivityDesigner: data.enableActivityDesigner,
        globalFixPrompt: data.globalFixPrompt,
        targetAspectRatio: data.targetAspectRatio,
        targetResolution: data.targetResolution
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
      return null;
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