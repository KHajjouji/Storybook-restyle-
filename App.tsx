import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, Sparkles, BookOpen, Download, Trash2, Save,
  Loader2, AlertCircle, CheckCircle2, ChevronRight, 
  ChevronLeft, Plus, MapPin, Layers, Palette, Columns, Wand2, Edit3, RefreshCw, X, Rocket, Clock, Cloud, FolderOpen, MoreVertical
} from 'lucide-react';
import { BookPage, AppSettings, PRINT_FORMATS, CharacterRef, CharacterAssignment, AppMode, Project } from './types';
import { restyleIllustration, translateText, extractTextFromImage, analyzeStyleFromImage, identifyAndDesignCharacters, planStoryScenes } from './geminiService';
import { generateBookPDF } from './utils/pdfGenerator';
import { persistenceService } from './persistenceService';

type Step = 'landing' | 'upload' | 'script' | 'settings' | 'characters' | 'mapping' | 'generate';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>('landing');
  const [projectId, setProjectId] = useState<string>(Math.random().toString(36).substring(7));
  const [projectName, setProjectName] = useState<string>("Untitled Masterpiece");
  const [pages, setPages] = useState<BookPage[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    mode: 'restyle',
    targetStyle: '3D Pixar-style animation, warm volumetric lighting, soft render',
    targetLanguage: 'French',
    exportFormat: 'KDP_SQUARE',
    spreadExportMode: 'WIDE_SPREAD',
    useProModel: true,
    embedTextInImage: true,
    characterReferences: [],
    estimatedPageCount: 32
  });
  
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);
  const [isAnalyzingScript, setIsAnalyzingScript] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const charRefInputRef = useRef<HTMLInputElement>(null);
  const styleRefInputRef = useRef<HTMLInputElement>(null);

  // Stats calculation
  const stats = useMemo(() => {
    const total = pages.length;
    const completed = pages.filter(p => p.status === 'completed').length;
    const processing = pages.filter(p => p.status === 'processing').length;
    const errors = pages.filter(p => p.status === 'error').length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, processing, errors, progress };
  }, [pages]);

  // Load project library on mount
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const projs = await persistenceService.getAllProjects();
        setSavedProjects(projs);
      } catch (e) {
        console.error("Failed to load project library:", e);
      }
    };
    fetchProjects();
  }, []);

  // Handle Save
  const handleSaveProject = async () => {
    setIsSaving(true);
    try {
      const thumbnail = pages.find(p => p.processedImage || p.originalImage)?.processedImage || pages.find(p => p.originalImage)?.originalImage;
      
      const project: Project = {
        id: projectId,
        name: projectName,
        lastModified: Date.now(),
        settings,
        pages,
        thumbnail
      };
      
      await persistenceService.saveProject(project);
      const updatedList = await persistenceService.getAllProjects();
      setSavedProjects(updatedList);
      setLastSaved(Date.now());
    } catch (e) {
      console.error("Save failed:", e);
      alert("Could not save project. Your browser might be out of storage space.");
    } finally {
      setIsSaving(false);
    }
  };

  const loadProject = (project: Project) => {
    setProjectId(project.id);
    setProjectName(project.name);
    setSettings(project.settings);
    setPages(project.pages);
    // Determine the furthest step based on project state
    if (project.pages.length > 0) {
      if (project.pages.some(p => p.processedImage)) setCurrentStep('generate');
      else setCurrentStep('mapping');
    } else if (project.settings.fullScript) {
      setCurrentStep('settings');
    } else {
      setCurrentStep('landing');
    }
  };

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this project forever?")) {
      try {
        await persistenceService.deleteProject(id);
        const updatedList = await persistenceService.getAllProjects();
        setSavedProjects(updatedList);
      } catch (e) {
        console.error("Delete failed:", e);
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const fileList = Array.from(files) as File[];
    
    const newPages: BookPage[] = [];
    for (const file of fileList) {
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newPages.push({
          id: Math.random().toString(36).substring(7),
          originalImage: base64,
          originalText: "Analyzing page content...",
          status: 'idle',
          assignments: [],
          isSpread: false
        });
      } catch (err) {
        console.error("File Error:", err);
      }
    }

    setPages(prev => [...prev, ...newPages]);
    setIsUploading(false);

    for (const p of newPages) {
      try {
        const extractedText = await extractTextFromImage(p.originalImage!);
        setPages(current => current.map(item => 
          item.id === p.id ? { ...item, originalText: extractedText || "" } : item
        ));
      } catch (err) {
        console.error("OCR Error:", err);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCharRefUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    const newRefs: CharacterRef[] = [];

    for (const file of fileList) {
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newRefs.push({
          id: Math.random().toString(36).substring(7),
          image: base64,
          name: file.name.split('.')[0] || "Character Design"
        });
      } catch (err) {
        console.error("Char Ref Error:", err);
      }
    }

    setSettings(prev => ({
      ...prev,
      characterReferences: [...prev.characterReferences, ...newRefs]
    }));
    if (charRefInputRef.current) charRefInputRef.current.value = "";
  };

  const handleAutoAnalyzeStyle = async () => {
    if (!settings.styleReference) return;
    setIsAnalyzingStyle(true);
    try {
      const prompt = await analyzeStyleFromImage(settings.styleReference);
      setSettings(prev => ({ ...prev, targetStyle: prompt }));
    } catch (err) {
      console.error("Style Analysis Error:", err);
    } finally {
      setIsAnalyzingStyle(false);
    }
  };

  const startStoryCreation = async () => {
    if (!settings.fullScript) return;
    setCurrentStep('settings');
  };

  const handleDesignCharacters = async () => {
    if (!settings.fullScript) return;
    setIsAnalyzingScript(true);
    try {
      const characters = await identifyAndDesignCharacters(settings.fullScript, settings.targetStyle, settings.styleReference);
      setSettings(prev => ({ ...prev, characterReferences: characters }));
      setCurrentStep('characters');
    } catch (err) {
      console.error("Character Design Error:", err);
    } finally {
      setIsAnalyzingScript(false);
    }
  };

  const handlePlanAndMap = async () => {
    if (!settings.fullScript) return;
    setIsAnalyzingScript(true);
    try {
      const plan = await planStoryScenes(settings.fullScript, settings.characterReferences);
      const newPages: BookPage[] = plan.pages.map(p => {
        const pageAssignments: CharacterAssignment[] = p.mappedCharacterNames.map(name => {
          const match = settings.characterReferences.find(r => r.name.toLowerCase().includes(name.toLowerCase()));
          return {
            refId: match?.id || settings.characterReferences[0]?.id || '',
            description: name
          };
        });

        return {
          id: Math.random().toString(36).substring(7),
          originalText: p.text,
          status: 'idle',
          assignments: pageAssignments,
          isSpread: p.isSpread
        };
      });
      setPages(newPages);
      setCurrentStep('mapping');
    } catch (err) {
      console.error("Scene Planning Error:", err);
    } finally {
      setIsAnalyzingScript(false);
    }
  };

  const processSinglePage = async (pageId: string) => {
    if (settings.useProModel) {
       const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
       if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    }
    setPages(current => current.map(p => p.id === pageId ? { ...p, status: 'processing' } : p));
    try {
      const page = pages.find(p => p.id === pageId)!;
      let translatedText = page.translatedText;
      if (!translatedText && settings.targetLanguage !== 'NONE_CLEAN_BG' && settings.targetLanguage !== 'English') {
        translatedText = await translateText(page.originalText, settings.targetLanguage);
      }
      const activePrompt = page.overrideStylePrompt || settings.targetStyle;
      const processedImage = await restyleIllustration(
        page.originalImage,
        activePrompt,
        settings.styleReference,
        settings.embedTextInImage && settings.targetLanguage !== 'NONE_CLEAN_BG' ? (translatedText || page.originalText) : undefined,
        settings.characterReferences,
        page.assignments,
        settings.useProModel,
        settings.targetLanguage === 'NONE_CLEAN_BG',
        page.isSpread
      );
      setPages(current => current.map(p => p.id === pageId ? { ...p, status: 'completed', processedImage, translatedText } : p));
    } catch (e: any) {
      setPages(current => current.map(p => p.id === pageId ? { ...p, status: 'error' } : p));
    }
    setEditingPageId(null);
  };

  const processBulk = async (retryOnly: boolean = false) => {
    if (settings.useProModel) {
       const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
       if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    }
    setIsProcessing(true);
    setCurrentStep('generate');
    const pagesToProcess = retryOnly 
      ? pages.filter(p => p.status === 'error' || p.status === 'idle')
      : pages.filter(p => p.status !== 'completed');

    for (const pageToUpdate of pagesToProcess) {
      const pageId = pageToUpdate.id;
      setPages(current => current.map(p => p.id === pageId ? { ...p, status: 'processing' } : p));
      try {
        const p = pages.find(pg => pg.id === pageId)!;
        let translatedText = p.translatedText;
        if (!translatedText && settings.targetLanguage !== 'NONE_CLEAN_BG' && settings.targetLanguage !== 'English') {
          translatedText = await translateText(p.originalText, settings.targetLanguage);
        }
        const activePrompt = p.overrideStylePrompt || settings.targetStyle;
        const processedImage = await restyleIllustration(
          p.originalImage,
          activePrompt,
          settings.styleReference,
          settings.embedTextInImage && settings.targetLanguage !== 'NONE_CLEAN_BG' ? (translatedText || p.originalText) : undefined,
          settings.characterReferences,
          p.assignments,
          settings.useProModel,
          settings.targetLanguage === 'NONE_CLEAN_BG',
          p.isSpread
        );
        setPages(current => current.map(pg => pg.id === pageId ? { ...pg, status: 'completed', processedImage, translatedText } : pg));
      } catch (e: any) { 
        setPages(current => current.map(pg => pg.id === pageId ? { ...pg, status: 'error' } : pg));
      }
    }
    setIsProcessing(false);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'landing':
        return (
          <div className="max-w-6xl mx-auto space-y-20 py-12 animate-in fade-in duration-700">
            <div className="text-center space-y-6">
              <h2 className="text-6xl font-black text-slate-900 tracking-tight">Industrial Story Production</h2>
              <p className="text-slate-500 text-xl font-medium max-w-2xl mx-auto leading-relaxed">Create and manage your professional children's book library with persistent cloud-grade storage.</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
               <div className="lg:col-span-2 space-y-10">
                  <div className="flex items-center justify-between">
                     <h3 className="text-2xl font-black flex items-center gap-3">
                        <FolderOpen className="text-indigo-600" /> Recent Cloud Projects
                     </h3>
                  </div>
                  
                  {savedProjects.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {savedProjects.sort((a,b) => b.lastModified - a.lastModified).map(project => (
                        <div 
                          key={project.id} 
                          onClick={() => loadProject(project)}
                          className="group bg-white border-2 border-slate-100 rounded-[3.5rem] p-6 hover:border-indigo-600 hover:shadow-2xl transition-all cursor-pointer relative overflow-hidden"
                        >
                           <div className="aspect-video rounded-[2.5rem] bg-slate-50 overflow-hidden mb-6 relative">
                              {project.thumbnail ? (
                                <img src={project.thumbnail} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={project.name} />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-200"><BookOpen size={48} /></div>
                              )}
                              <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full text-[10px] font-black text-white uppercase tracking-widest border border-white/10">
                                {project.pages.length} Pages
                              </div>
                           </div>
                           <div className="flex justify-between items-start">
                              <div>
                                 <h4 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">{project.name}</h4>
                                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Modified {new Date(project.lastModified).toLocaleDateString()}</p>
                              </div>
                              <button onClick={(e) => deleteProject(project.id, e)} className="p-3 text-slate-300 hover:text-red-500 transition-colors">
                                 <Trash2 size={20} />
                              </button>
                           </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-[400px] bg-slate-50 border-4 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center text-center px-12 gap-4">
                       <Cloud className="text-slate-200" size={64} />
                       <div className="space-y-1">
                          <p className="font-black text-slate-400 text-lg">Your production library is empty</p>
                          <p className="text-sm font-medium text-slate-400">Start a new project from the right panel to begin.</p>
                       </div>
                    </div>
                  )}
               </div>

               <div className="space-y-8">
                  <h3 className="text-2xl font-black flex items-center gap-3">
                     <Plus className="text-indigo-600" /> Start New
                  </h3>
                  <div className="space-y-6">
                    <button 
                      onClick={() => { setProjectId(Math.random().toString(36).substring(7)); setProjectName("Restyle Project"); setSettings({...settings, mode: 'restyle'}); setCurrentStep('upload'); }}
                      className="w-full group p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:shadow-xl transition-all"
                    >
                      <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all mb-6">
                        <Palette size={24} />
                      </div>
                      <h4 className="text-xl font-black mb-2">Restyle Existing</h4>
                      <p className="text-slate-400 text-sm font-medium leading-relaxed">Upgrade original assets into a new master aesthetic.</p>
                    </button>
                    
                    <button 
                      onClick={() => { setProjectId(Math.random().toString(36).substring(7)); setProjectName("Script Project"); setSettings({...settings, mode: 'create'}); setCurrentStep('script'); }}
                      className="w-full group p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:shadow-xl transition-all"
                    >
                      <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all mb-6">
                        <Rocket size={24} />
                      </div>
                      <h4 className="text-xl font-black mb-2">Create From Script</h4>
                      <p className="text-slate-400 text-sm font-medium leading-relaxed">Build a full book from raw text script to A-grade render.</p>
                    </button>
                  </div>
               </div>
            </div>
          </div>
        );

      case 'upload':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold mb-2 text-slate-900">1. Import Story Pages</h2>
              <p className="text-slate-500 text-lg">Upload single pages or panorama spreads from your original book.</p>
            </div>
            
            <div 
              onClick={() => !isUploading && fileInputRef.current?.click()} 
              className={`h-[400px] bg-white border-4 border-dashed rounded-[4rem] flex flex-col items-center justify-center gap-6 cursor-pointer transition-all group ${isUploading ? 'border-slate-100 opacity-50 cursor-wait' : 'border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/10'}`}
            >
              {isUploading ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="animate-spin text-indigo-600" size={64} />
                  <p className="text-indigo-600 font-bold animate-pulse text-xl">Analyzing & OCR...</p>
                </div>
              ) : (
                <>
                  <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-xl group-hover:scale-110">
                    <Upload size={40} />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-slate-900 text-2xl">Select Illustration Files</p>
                    <p className="text-slate-400 mt-2 font-medium">Supports JPG, PNG, WEBP</p>
                  </div>
                </>
              )}
              <input type="file" multiple hidden ref={fileInputRef} accept="image/*" onChange={handleFileUpload} />
            </div>

            <div className="flex justify-between pt-12">
              <button onClick={() => setCurrentStep('landing')} className="px-10 py-5 rounded-[2rem] font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-3 transition-all text-lg">Back</button>
              <button 
                disabled={pages.length === 0 || isUploading} 
                onClick={() => setCurrentStep('settings')} 
                className="bg-indigo-600 text-white px-12 py-5 rounded-[2rem] font-bold text-lg flex items-center gap-3 hover:bg-indigo-700 shadow-2xl transition-all active:scale-95 disabled:opacity-50"
              >
                Choose Style <ChevronRight size={24} />
              </button>
            </div>
          </div>
        );

      case 'script':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold mb-2 text-slate-900">1. Story Script Input</h2>
              <p className="text-slate-500 text-lg">Paste your story text. AI will build the world around it.</p>
            </div>
            
            <div className="bg-white rounded-[4rem] border-2 border-slate-100 p-12 shadow-sm space-y-6 relative overflow-hidden">
              <textarea 
                className="w-full bg-slate-50/50 border-none rounded-3xl p-8 text-lg font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 min-h-[400px] resize-none italic"
                placeholder="Once upon a time..."
                value={settings.fullScript || ""}
                onChange={(e) => setSettings({...settings, fullScript: e.target.value})}
              />
              <div className="flex justify-between items-center pt-8">
                <button onClick={() => setCurrentStep('landing')} className="px-10 py-5 rounded-[2.5rem] font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-3 transition-all text-lg">Back</button>
                <button 
                  disabled={!settings.fullScript}
                  onClick={startStoryCreation}
                  className="bg-indigo-600 text-white px-14 py-6 rounded-[3rem] font-black text-xl flex items-center gap-4 hover:bg-indigo-700 shadow-2xl transition-all"
                >
                  Define Style <ChevronRight size={24} />
                </button>
              </div>
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-4">
              <h2 className="text-4xl font-bold mb-2 text-slate-900">Global Visual Direction</h2>
              <p className="text-slate-500 text-lg">Characters and scenes will be generated following this aesthetic anchor.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <label className="block text-sm font-bold text-slate-400 uppercase tracking-[0.2em]">Aesthetic Reference</label>
                <div 
                  className="aspect-video bg-white border-4 border-dashed border-slate-200 rounded-[3.5rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 overflow-hidden relative shadow-inner group transition-all"
                  onClick={() => styleRefInputRef.current?.click()}
                >
                   {settings.styleReference ? (
                     <img src={settings.styleReference} className="w-full h-full object-cover" alt="Master Style" />
                   ) : (
                     <div className="text-center">
                        <Palette size={56} className="text-slate-100 mx-auto mb-4" />
                        <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Upload Aesthetic Anchor</span>
                     </div>
                   )}
                   <input type="file" hidden ref={styleRefInputRef} accept="image/*" onChange={(e) => {
                     const file = e.target.files?.[0];
                     if (file) {
                       const reader = new FileReader();
                       reader.onload = () => setSettings({...settings, styleReference: reader.result as string});
                       reader.readAsDataURL(file);
                     }
                   }} />
                </div>
                
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Global Artistic Prompt</label>
                    {settings.styleReference && (
                      <button onClick={handleAutoAnalyzeStyle} disabled={isAnalyzingStyle} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full">
                        {isAnalyzingStyle ? <Loader2 className="animate-spin" size={12} /> : "Auto-Sync"}
                      </button>
                    )}
                  </div>
                  <textarea 
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 h-[100px] resize-none" 
                    value={settings.targetStyle} 
                    onChange={(e) => setSettings({...settings, targetStyle: e.target.value})} 
                  />
                </div>
              </div>
              <div className="bg-white p-12 rounded-[4rem] border-2 border-slate-100 shadow-xl space-y-8">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-4 uppercase tracking-widest border-b border-slate-100 pb-2">Industrial Format</label>
                  <select 
                    className="w-full bg-slate-50 border-none rounded-[1.5rem] p-5 font-bold text-slate-700 outline-none text-lg shadow-inner cursor-pointer" 
                    value={settings.exportFormat} 
                    onChange={(e) => setSettings({...settings, exportFormat: e.target.value as any})}
                  >
                    {Object.entries(PRINT_FORMATS).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-4 uppercase tracking-widest border-b border-slate-100 pb-2">Language Preset</label>
                  <select 
                    className="w-full bg-slate-50 border-none rounded-[1.5rem] p-5 font-bold text-slate-700 outline-none shadow-inner cursor-pointer" 
                    value={settings.targetLanguage} 
                    onChange={(e) => setSettings({...settings, targetLanguage: e.target.value})}
                  >
                    <option value="English">English</option>
                    <option value="French">French</option>
                    <option value="Spanish">Spanish</option>
                    <option value="German">German</option>
                    <option value="NONE_CLEAN_BG">None (Clean Plate)</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-between pt-10">
              <button onClick={() => setCurrentStep(settings.mode === 'create' ? 'script' : 'upload')} className="px-10 py-5 rounded-[2rem] font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-3 text-lg">Back</button>
              <button 
                onClick={settings.mode === 'create' ? handleDesignCharacters : () => setCurrentStep('characters')}
                disabled={isAnalyzingScript}
                className="bg-indigo-600 text-white px-12 py-5 rounded-[2rem] font-bold text-lg flex items-center gap-3 hover:bg-indigo-700 shadow-2xl"
              >
                {isAnalyzingScript ? <Loader2 className="animate-spin" size={24} /> : "Design Identities"} <ChevronRight size={24} />
              </button>
            </div>
          </div>
        );

      case 'characters':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold mb-2">Character Identity Design</h2>
              <p className="text-slate-500 text-lg">AI has generated character sheets in your target style. Verify consistency before building scenes.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
              <div 
                onClick={() => charRefInputRef.current?.click()} 
                className="aspect-square bg-white border-4 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 shadow-sm"
              >
                <Plus size={48} className="text-slate-200" />
                <span className="text-sm font-bold text-slate-400 mt-3 uppercase tracking-wider">New Identity</span>
                <input type="file" multiple hidden ref={charRefInputRef} accept="image/*" onChange={handleCharRefUpload} />
              </div>
              {settings.characterReferences.map((ref, idx) => (
                <div key={ref.id} className="aspect-square relative bg-white rounded-[3rem] border-2 border-slate-100 overflow-hidden shadow-sm hover:shadow-xl transition-all group">
                  <img src={ref.image} className="w-full h-full object-cover" alt={ref.name} />
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 p-4 backdrop-blur-md">
                    <input 
                      className="w-full bg-transparent text-white text-xs font-bold outline-none border-none focus:ring-1 focus:ring-white rounded px-1" 
                      value={ref.name} 
                      onChange={(e) => { 
                        const n = [...settings.characterReferences]; 
                        n[idx].name = e.target.value; 
                        setSettings({...settings, characterReferences: n}); 
                      }} 
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-16">
              <button onClick={() => setCurrentStep('settings')} className="px-10 py-5 rounded-[2rem] font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-3 text-lg">Back</button>
              <button 
                onClick={settings.mode === 'create' ? handlePlanAndMap : () => setCurrentStep('mapping')} 
                disabled={isAnalyzingScript}
                className="bg-indigo-600 text-white px-12 py-5 rounded-[2rem] font-bold text-lg flex items-center gap-3 hover:bg-indigo-700 shadow-2xl"
              >
                {isAnalyzingScript ? <Loader2 className="animate-spin" size={24} /> : "Auto-Map to Scenes"} <ChevronRight size={24} />
              </button>
            </div>
          </div>
        );

      case 'mapping':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-40">
            <div className="text-center mb-10">
              <h2 className="text-4xl font-bold mb-2 text-slate-900">Scene Logic & Mapping</h2>
              <p className="text-slate-500 text-lg">AI has mapped characters to scenes. Review and adjust placements below.</p>
            </div>
            <div className="space-y-12">
              {pages.map((page, idx) => (
                <div key={page.id} className="bg-white rounded-[4rem] border-2 border-slate-100 overflow-hidden flex flex-col md:flex-row shadow-sm hover:shadow-2xl transition-all">
                  <div className="md:w-1/3 aspect-square relative bg-slate-50">
                    {page.originalImage ? (
                      <img src={page.originalImage} className="w-full h-full object-cover" alt={`Scene ${idx+1}`} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-100 text-slate-400">
                        <Sparkles size={48} className="opacity-20 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Planned Scene {idx+1}</span>
                      </div>
                    )}
                    <button 
                      onClick={() => setPages(pages.map(p => p.id === page.id ? {...p, isSpread: !p.isSpread} : p))} 
                      className={`absolute bottom-8 left-8 flex items-center gap-3 px-6 py-3 rounded-full text-xs font-bold transition-all shadow-2xl ${page.isSpread ? 'bg-indigo-600 text-white scale-110' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}
                    >
                      <Layers size={18} /> {page.isSpread ? 'Panoramic Spread' : 'Single Illustration'}
                    </button>
                  </div>
                  <div className="md:w-2/3 p-12 flex flex-col justify-between space-y-10">
                    <div className="space-y-6">
                      <div className="flex justify-between items-center border-b-2 border-slate-50 pb-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em]">Identity Map</span>
                        <button 
                          onClick={() => setPages(pages.map(p => p.id === page.id ? {...p, assignments: [...p.assignments, {refId: settings.characterReferences[0]?.id || '', description: ''}]} : p))} 
                          className="bg-indigo-50 text-indigo-600 px-5 py-2.5 rounded-2xl text-xs font-bold hover:bg-indigo-100"
                        >
                          + Add Character
                        </button>
                      </div>
                      <div className="space-y-4 max-h-[250px] overflow-y-auto pr-4 scrollbar-hide">
                        {page.assignments.map((a, ai) => (
                          <div key={ai} className="flex gap-4 items-center bg-slate-50 p-5 rounded-[2rem] border border-slate-100 shadow-inner">
                            <MapPin size={20} className="text-indigo-400 shrink-0" />
                            <input 
                              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-medium" 
                              placeholder="Role/Action (e.g. main girl)..." 
                              value={a.description} 
                              onChange={(e) => { const n = [...pages]; n[idx].assignments[ai].description = e.target.value; setPages(n); }} 
                            />
                            <select 
                              className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none cursor-pointer" 
                              value={a.refId} 
                              onChange={(e) => { const n = [...pages]; n[idx].assignments[ai].refId = e.target.value; setPages(n); }}
                            >
                              {settings.characterReferences.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                            <button 
                              onClick={() => { const n = [...pages]; n[idx].assignments.splice(ai, 1); setPages(n); }} 
                              className="text-red-400 hover:text-red-600 p-2"
                            >
                              <Trash2 size={20} />
                            </button>
                          </div>
                        ))}
                        {page.assignments.length === 0 && (
                          <div className="py-10 text-center text-slate-300 italic text-sm">No main characters assigned to this scene.</div>
                        )}
                      </div>
                    </div>
                    <div className="bg-slate-900 rounded-[3rem] p-10 shadow-2xl">
                       <label className="block text-[10px] font-black text-indigo-300 uppercase tracking-[0.4em] mb-4">Industrial Script Fragment</label>
                       <textarea 
                        className="w-full bg-white/5 border-none rounded-xl text-sm font-medium text-white/70 outline-none min-h-[80px] p-2 resize-none italic" 
                        value={page.originalText} 
                        onChange={(e) => setPages(pages.map(p => p.id === page.id ? {...p, originalText: e.target.value} : p))} 
                       />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-3xl border-t-2 border-slate-100 p-10 z-50 shadow-[0_-30px_60px_rgba(0,0,0,0.08)] rounded-t-[5rem]">
               <div className="max-w-6xl mx-auto flex justify-between items-center px-10">
                  <button onClick={() => setCurrentStep('characters')} className="px-12 py-5 rounded-[2.5rem] font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-3 transition-all text-xl"><ChevronLeft size={32} /> Back</button>
                  <button 
                    onClick={() => processBulk()} 
                    className="bg-indigo-600 text-white px-16 py-7 rounded-[3rem] font-black text-2xl flex items-center gap-5 hover:bg-indigo-700 shadow-[0_25px_50px_rgba(79,70,229,0.35)] transition-all scale-110 active:scale-100"
                  >
                    <Sparkles size={36} /> RENDER FULL STORY
                  </button>
               </div>
            </div>
          </div>
        );

      case 'generate':
        return (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-56">
            <div className="sticky top-28 z-40 bg-[#F8FAFC]/90 backdrop-blur-md py-6 border-b border-slate-200">
               <div className="max-w-5xl mx-auto px-4 space-y-6">
                  <div className="flex justify-between items-end">
                     <div className="space-y-1">
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                           Production Progress {isProcessing && <Loader2 className="animate-spin text-indigo-600" size={24} />}
                        </h2>
                        <p className="text-sm font-medium text-slate-500">
                           {stats.completed} of {stats.total} pages industrial-rendered.
                        </p>
                     </div>
                     <div className="flex gap-4">
                        {stats.errors > 0 && !isProcessing && (
                           <button 
                              onClick={() => processBulk(true)} 
                              className="flex items-center gap-2 bg-red-50 text-red-600 px-6 py-3 rounded-2xl font-bold text-xs hover:bg-red-100 transition-all border border-red-100"
                           >
                              <RefreshCw size={14} /> Retry {stats.errors} Failed
                           </button>
                        )}
                        {!isProcessing && stats.completed < stats.total && (
                           <button 
                              onClick={() => processBulk()} 
                              className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-3xl font-bold text-sm shadow-xl hover:bg-indigo-700 transition-all"
                           >
                              <Sparkles size={18} /> Resume All
                           </button>
                        )}
                     </div>
                  </div>
                  <div className="h-4 bg-slate-200 rounded-full overflow-hidden shadow-inner border border-white">
                     <div 
                        className="h-full bg-indigo-600 transition-all duration-1000 ease-out shadow-[0_0_20px_rgba(79,70,229,0.5)] flex items-center justify-end px-4"
                        style={{ width: `${stats.progress}%` }}
                     >
                        {stats.progress > 5 && <span className="text-[9px] font-black text-white">{stats.progress}%</span>}
                     </div>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {pages.map((page, idx) => (
                <div key={page.id} className={`bg-white rounded-[5rem] border-4 border-slate-50 overflow-hidden shadow-sm hover:shadow-2xl transition-all group flex flex-col ${editingPageId === page.id ? 'ring-4 ring-indigo-500 border-indigo-500' : ''}`}>
                  <div className="aspect-square relative bg-slate-50 overflow-hidden">
                    <img 
                      src={page.processedImage || page.originalImage || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1000"} 
                      className={`w-full h-full object-cover transition-all duration-[2000ms] ${page.status === 'processing' ? 'blur-[80px] opacity-40 scale-125' : 'scale-100'} ${page.processedImage ? '' : 'grayscale opacity-30'}`} 
                      alt={`Render Pg ${idx+1}`}
                    />
                    
                    {page.status === 'processing' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-indigo-600/5">
                        <div className="relative">
                           <div className="w-32 h-32 border-[12px] border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <span className="text-sm font-black text-indigo-900 uppercase tracking-[0.5em] animate-pulse">Rendering {idx+1}...</span>
                      </div>
                    )}
                    
                    <div className="absolute top-10 left-10 flex gap-3">
                      <div className="bg-black/70 text-white text-[10px] px-6 py-3 rounded-full font-black backdrop-blur-xl shadow-2xl uppercase tracking-[0.3em] border border-white/10">
                        Pg {idx+1} {page.isSpread ? '— Spread' : ''}
                      </div>
                      {page.status === 'completed' && (
                        <div className="bg-green-600/90 text-white text-[10px] px-6 py-3 rounded-full font-black backdrop-blur-xl shadow-2xl uppercase tracking-[0.3em]">
                          Ready
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="fixed bottom-0 inset-x-0 bg-slate-900 text-white p-14 shadow-[0_-40px_80px_rgba(0,0,0,0.6)] z-50 rounded-t-[7rem]">
               <div className="max-w-6xl mx-auto flex flex-col xl:flex-row items-center justify-between gap-12 px-10">
                  <div className="flex flex-col sm:flex-row items-center gap-12 text-center xl:text-left">
                     <button onClick={() => setCurrentStep('mapping')} className="bg-white/10 hover:bg-white/20 p-5 rounded-full transition-all text-white mr-6">
                        <ChevronLeft size={32} />
                     </button>
                     <div className="space-y-4">
                        <div className="flex items-center justify-center xl:justify-start gap-8">
                           <BookOpen className="text-indigo-400" size={56} />
                           <span className="text-4xl font-black uppercase tracking-tight font-display">{PRINT_FORMATS[settings.exportFormat].name}</span>
                        </div>
                     </div>
                  </div>
                  <button 
                    disabled={isProcessing || !pages.every(p => p.status === 'completed')} 
                    onClick={() => generateBookPDF(pages, settings.exportFormat, "Production_Book_Export", !settings.embedTextInImage && settings.targetLanguage !== 'NONE_CLEAN_BG', settings.estimatedPageCount, settings.spreadExportMode)} 
                    className="bg-indigo-600 text-white px-20 py-8 rounded-[3.5rem] font-black text-2xl flex items-center gap-8 hover:bg-indigo-500 shadow-[0_40px_80px_rgba(79,70,229,0.5)] transition-all scale-110 active:scale-100 disabled:opacity-30 disabled:grayscale disabled:scale-100"
                  >
                    <Download size={40} /> PRINT READY PDF
                  </button>
               </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="bg-white/90 backdrop-blur-2xl border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-8 lg:px-12 h-28 flex items-center justify-between gap-12">
          <div className="flex items-center gap-6 cursor-pointer shrink-0" onClick={() => setCurrentStep('landing')}>
            <div className="w-14 h-14 bg-indigo-600 rounded-[1.2rem] flex items-center justify-center text-white shadow-xl rotate-3 hover:rotate-0 transition-transform shadow-indigo-200"><Sparkles size={28} /></div>
            <div className="hidden sm:block">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-none font-display">StoryFlow <span className="text-indigo-600">Pro</span></h1>
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.5em] mt-1.5">Industrial Pipeline</p>
            </div>
          </div>

          <div className="flex-1 max-w-md hidden md:flex items-center gap-4 bg-slate-50 border border-slate-100 px-6 py-3 rounded-2xl group focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
             <input 
               className="bg-transparent border-none outline-none font-bold text-slate-700 flex-1 text-sm"
               value={projectName}
               onChange={(e) => setProjectName(e.target.value)}
               placeholder="Project Name..."
             />
             <div className="flex items-center gap-3">
               {isSaving ? (
                 <Loader2 size={16} className="text-indigo-600 animate-spin" />
               ) : (
                 <div className="flex items-center gap-2">
                    {lastSaved && (
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest hidden lg:block">Saved {new Date(lastSaved).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    )}
                    <CheckCircle2 size={16} className={lastSaved ? "text-green-500" : "text-slate-200"} />
                 </div>
               )}
               <button 
                 onClick={handleSaveProject} 
                 disabled={isSaving}
                 className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
               >
                 <Save size={18} />
               </button>
             </div>
          </div>

          <div className="hidden lg:flex items-center gap-6 shrink-0">
            {['landing', 'upload', 'script', 'settings', 'characters', 'mapping', 'generate'].filter(s => {
              if (s === 'landing') return false;
              if (settings.mode === 'restyle' && s === 'script') return false;
              if (settings.mode === 'create' && (s === 'upload')) return false;
              return true;
            }).map((s, i) => (
              <React.Fragment key={s}>
                <div 
                  onClick={() => !isProcessing && currentStep !== 'landing' && setCurrentStep(s as Step)}
                  className={`w-11 h-11 rounded-full flex items-center justify-center text-xs font-black transition-all cursor-pointer ${currentStep === s ? 'bg-indigo-600 text-white scale-110 shadow-lg ring-4 ring-indigo-50' : (currentStep !== 'landing' ? 'bg-white border-2 border-slate-100 text-slate-400 hover:border-indigo-200' : 'bg-slate-50 text-slate-200 cursor-not-allowed')}`}
                >
                  {i + 1}
                </div>
                {i < (settings.mode === 'restyle' ? 4 : 4) && <div className="w-6 h-[2px] bg-slate-100 rounded-full" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-8 lg:px-12 py-12">{renderStep()}</main>
    </div>
  );
};

export default App;