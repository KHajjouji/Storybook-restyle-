
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, Sparkles, BookOpen, Download, Trash2, Save,
  Loader2, AlertCircle, CheckCircle2, ChevronRight, 
  ChevronLeft, Plus, MapPin, Layers, Palette, Columns, Wand2, Edit3, RefreshCw, X, Rocket, Clock, Cloud, FolderOpen, MoreVertical, Maximize2, Zap, FileText, ClipboardList, UserCheck, Layout, Info, Image as ImageIcon, Heart, LogIn, LogOut, User, Lock, Mail, DatabaseZap, Database, Globe, ArrowRight, ShieldCheck, Link2, Settings2, KeyRound, FileUp, FileDown, Monitor, MessageSquareCode, Scissors, ToggleLeft as Toggle, Settings, Check
} from 'lucide-react';
import { BookPage, AppSettings, PRINT_FORMATS, CharacterRef, CharacterAssignment, AppMode, Project, SeriesPreset } from './types';
import { restyleIllustration, translateText, extractTextFromImage, analyzeStyleFromImage, identifyAndDesignCharacters, planStoryScenes, upscaleIllustration, parsePromptPack, refineIllustration } from './geminiService';
import { generateBookPDF } from './utils/pdfGenerator';
import { persistenceService } from './persistenceService';
import { SERIES_PRESETS, GLOBAL_STYLE_LOCK } from './seriesData';
import { supabase, isSupabaseConfigured, supabaseService } from './supabaseService';

type Step = 'landing' | 'upload' | 'restyle-editor' | 'script' | 'prompt-pack' | 'prompt-pack-editor' | 'characters' | 'generate' | 'direct-upscale';
type WizardStep = 'master-key' | 'provider' | 'credentials' | 'verifying' | 'success';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>('landing');
  const [projectId, setProjectId] = useState<string>(Math.random().toString(36).substring(7));
  const [projectName, setProjectName] = useState<string>("Untitled Masterpiece");
  const [pages, setPages] = useState<BookPage[]>([]);
  const [rawPackText, setRawPackText] = useState("");
  const [fullScript, setFullScript] = useState("");
  const [user, setUser] = useState<any>(null);
  
  // Referenced Mode States
  const [isReferencedMode, setIsReferencedMode] = useState(true);
  const [globalFixPrompt, setGlobalFixPrompt] = useState("Ensure the man in Image 2 has the exact same facial features as the man in Image 1.");
  const [selectedForProduction, setSelectedForProduction] = useState<Set<string>>(new Set());

  // Database Wizard States
  const [showDatabaseWizard, setShowDatabaseWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('master-key');
  const [masterKeyInput, setMasterKeyInput] = useState("");
  const [wizardError, setWizardError] = useState("");

  // Refinement UI States
  const [activeRefineId, setActiveRefineId] = useState<string | null>(null);
  const [refinePrompt, setRefinePrompt] = useState("");

  // Authentication
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [settings, setSettings] = useState<AppSettings>({
    mode: 'prompt-pack',
    targetStyle: 'soft vibrant children’s storybook illustration, painterly, rounded shapes, big expressive eyes, gentle glow lighting, soft gradients, minimal hard outlines, warm pastel palette, cozy atmosphere',
    targetLanguage: 'NONE_CLEAN_BG',
    exportFormat: 'KDP_SQUARE',
    spreadExportMode: 'WIDE_SPREAD',
    useProModel: true,
    embedTextInImage: false,
    characterReferences: [],
    estimatedPageCount: 32,
    masterBible: GLOBAL_STYLE_LOCK
  });
  
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  const restyleInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const total = pages.length;
    const completed = pages.filter(p => p.status === 'completed').length;
    const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, progress };
  }, [pages]);

  useEffect(() => {
    const init = async () => {
      if (isSupabaseConfigured && supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
      }
      const projs = await persistenceService.getAllProjects();
      setSavedProjects(projs);
    };
    init();
  }, []);

  const refreshProjects = async () => {
    const projs = await persistenceService.getAllProjects();
    setSavedProjects(projs);
  };

  const handleExportProjectFile = () => {
    const thumbnail = pages.find(p => p.processedImage || p.originalImage)?.processedImage || pages.find(p => p.originalImage)?.originalImage;
    const project: Project = { id: projectId, name: projectName, lastModified: Date.now(), settings, pages, thumbnail };
    // Fix: Use global Blob and URL to avoid type mismatches that can occur with window-prefixed objects in strict environments
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}.storyflow`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportProjectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = event.target?.result;
        if (typeof result !== 'string') return;
        const project = JSON.parse(result) as Project;
        if (project.id && project.pages && project.settings) {
          setProjectId(project.id);
          setProjectName(project.name);
          setSettings(project.settings);
          setPages(project.pages);
          setCurrentStep('generate');
          await persistenceService.saveProject(project);
          await refreshProjects();
        } else { alert("Invalid StoryFlow file."); }
      } catch (err) { alert("Failed to parse project file."); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const checkAuthAndExecute = (action: () => void) => {
    if (isSupabaseConfigured && !user) { setShowLoginModal(true); } 
    else { action(); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    setAuthLoading(false);
    if (error) { setAuthError(error.message); } 
    else { setShowLoginModal(false); }
  };

  const handleMasterKeyVerify = () => {
    if (masterKeyInput === "admin123" || masterKeyInput === "storyflow") {
      setWizardStep('provider');
    } else { setWizardError("Incorrect Master Setup Key. Try 'storyflow'."); }
  };

  const handleSaveProject = async () => {
    setIsSaving(true);
    try {
      const thumbnail = pages.find(p => p.processedImage || p.originalImage)?.processedImage || pages.find(p => p.originalImage)?.originalImage;
      const project: Project = { id: projectId, name: projectName, lastModified: Date.now(), settings, pages, thumbnail };
      await persistenceService.saveProject(project);
      await refreshProjects();
    } catch (e) { console.error(e); }
    finally { setIsSaving(false); }
  };

  const handleApplyPreset = (preset: SeriesPreset) => {
    setProjectName(preset.title);
    setProjectId(Math.random().toString(36).substring(7));
    setSettings(prev => ({
      ...prev,
      mode: 'prompt-pack',
      masterBible: preset.masterBible,
      characterReferences: preset.characters.map(c => ({
        id: Math.random().toString(36).substring(7),
        name: c.name,
        description: c.description,
        images: []
      }))
    }));
    setPages(preset.scenes.map(s => ({
      id: Math.random().toString(36).substring(7),
      originalText: s.text,
      status: 'idle',
      assignments: [],
      isSpread: s.isSpread,
      overrideStylePrompt: s.prompt
    })));
    setCurrentStep('characters');
  };

  const handleParsePack = async () => {
    if (!rawPackText) return;
    setIsParsing(true);
    try {
      const result = await parsePromptPack(rawPackText);
      setSettings(prev => ({
        ...prev,
        masterBible: result.masterBible,
        characterReferences: result.characterIdentities.map(c => ({
          id: Math.random().toString(36).substring(7),
          name: c.name,
          description: c.description,
          images: []
        }))
      }));
      setPages(result.scenes.map(s => ({
        id: Math.random().toString(36).substring(7),
        originalText: s.prompt,
        status: 'idle',
        assignments: [],
        isSpread: s.isSpread,
        overrideStylePrompt: s.prompt
      })));
      setCurrentStep('prompt-pack-editor');
    } catch (e) {
      alert("Failed to parse prompt pack.");
    } finally {
      setIsParsing(false);
    }
  };

  const handlePlanStory = async () => {
    if (!fullScript) return;
    setIsParsing(true);
    try {
      const result = await planStoryScenes(fullScript, settings.characterReferences);
      setPages(result.pages.map(p => ({
        id: Math.random().toString(36).substring(7),
        originalText: p.text,
        status: 'idle',
        assignments: p.mappedCharacterNames.map(name => ({ refId: name, description: "" })),
        isSpread: p.isSpread,
        overrideStylePrompt: p.text
      })));
      setCurrentStep('characters');
    } catch (e) {
      alert("Failed to plan story.");
    } finally {
      setIsParsing(false);
    }
  };

  const generateCharacterReference = async (charId: string) => {
    const char = settings.characterReferences.find(c => c.id === charId);
    if (!char) return;

    // Check for API key selection before using Pro models (Mandatory for gemini-3-pro-image-preview)
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }

    setSettings(prev => ({
      ...prev,
      characterReferences: prev.characterReferences.map(c => 
        c.id === charId ? { ...c, images: ["LOADING"] } : c
      )
    }));

    try {
      const result = await identifyAndDesignCharacters(char.description || char.name, settings.targetStyle);
      if (result[0]?.images?.[0]) {
        setSettings(prev => ({
          ...prev,
          characterReferences: prev.characterReferences.map(c => 
            c.id === charId ? { ...c, images: [result[0].images[0]] } : c
          )
        }));
      }
    } catch (e: any) {
      console.error(e);
      // Handle the case where the key might have been revoked or lost
      if (e?.message?.includes("Requested entity was not found")) { await (window as any).aistudio?.openSelectKey(); }
      alert("Failed to design character.");
      setSettings(prev => ({
        ...prev,
        characterReferences: prev.characterReferences.map(c => 
          c.id === charId ? { ...c, images: [] } : c
        )
      }));
    }
  };

  const handleRestyleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    let loaded = 0;
    const newPages: BookPage[] = [];

    files.forEach((f) => {
      const reader = new FileReader();
      const pageId = Math.random().toString(36).substring(7);
      reader.onload = () => {
        const p: BookPage = { 
          id: pageId, 
          originalImage: reader.result as string, 
          originalText: "", 
          status: 'idle', 
          assignments: [], 
          isSpread: false,
          overrideStylePrompt: settings.targetStyle 
        };
        newPages.push(p);
        loaded++;
        if (loaded === files.length) {
          setPages(prev => [...prev, ...newPages]);
          // Default all newly uploaded images as active for production in fixer
          setSelectedForProduction(prev => {
            const next = new Set(prev);
            newPages.forEach(pg => next.add(pg.id));
            return next;
          });
          setCurrentStep(settings.mode === 'upscale' ? 'generate' : 'restyle-editor');
        }
      };
      reader.readAsDataURL(f);
    });
  };

  const regenerateScene = async (pageId: string) => {
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    
    setPages(curr => curr.map(p => p.id === pageId ? { ...p, status: 'processing' } : p));
    
    try {
      const p = pages.find(pg => pg.id === pageId);
      if (!p) throw new Error("Page not found");

      let result;
      if (settings.mode === 'upscale' && p.originalImage) {
        result = await upscaleIllustration(p.originalImage, p.overrideStylePrompt || settings.targetStyle, p.isSpread);
      } else {
        // Feature Fixer Logic
        const prompt = (isReferencedMode ? globalFixPrompt : p.overrideStylePrompt) || settings.targetStyle;
        const targetImg = p.originalImage;

        if (targetImg) {
          // Send ALL images from the fixer workspace as potential context
          const allReferences = pages
            .filter(pg => pg.originalImage)
            .map((pg) => ({ 
              base64: pg.originalImage!, 
              index: pages.indexOf(pg) + 1 
            }));
            
          result = await refineIllustration(targetImg, prompt, allReferences, p.isSpread);
        } else {
          result = await restyleIllustration(
            undefined,
            prompt,
            settings.styleReference,
            undefined,
            settings.characterReferences,
            [],
            true,
            true,
            p.isSpread,
            settings.masterBible
          );
        }
      }
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'completed', processedImage: result } : pg));
    } catch (e: any) {
      console.error(e);
      if (e?.message?.includes("Requested entity was not found")) { await (window as any).aistudio?.openSelectKey(); }
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'error' } : pg));
    }
  };

  const handleRefineScene = async (pageId: string) => {
    if (!refinePrompt) return;
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    
    setPages(curr => curr.map(p => p.id === pageId ? { ...p, status: 'processing' } : p));
    setActiveRefineId(null);
    
    try {
      const p = pages.find(pg => pg.id === pageId);
      const imgToRefine = p?.processedImage || p?.originalImage;
      if (!imgToRefine) throw new Error("No image to refine");

      const allReferences = pages
        .filter(pg => (pg.processedImage || pg.originalImage))
        .map((pg) => ({ 
          base64: (pg.processedImage || pg.originalImage)!, 
          index: pages.indexOf(pg) + 1 
        }));

      const result = await refineIllustration(imgToRefine, refinePrompt, allReferences, p.isSpread);
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'completed', processedImage: result } : pg));
      setRefinePrompt("");
    } catch (e: any) {
      console.error(e);
      if (e?.message?.includes("Requested entity was not found")) { await (window as any).aistudio?.openSelectKey(); }
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'error' } : pg));
    }
  };

  const processBulkRender = async () => {
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    setIsProcessing(true);
    
    // Only process pages that are selected and either not completed or need re-run
    const targets = pages.filter(p => selectedForProduction.has(p.id));
    
    setCurrentStep('generate');
    
    for (let i = 0; i < targets.length; i++) {
      await regenerateScene(targets[i].id);
    }
    setIsProcessing(false);
  };

  const toggleProductionSelection = (id: string) => {
    setSelectedForProduction(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'landing':
        return (
          <div className="max-w-6xl mx-auto py-16 space-y-16 animate-in fade-in duration-700 pb-32">
            <div className="text-center space-y-6">
              <h2 className="text-7xl font-black text-slate-900 tracking-tighter">Series <span className="text-indigo-600">Master</span></h2>
              <p className="text-slate-500 text-xl max-w-2xl mx-auto">Professional continuity dashboard for children's illustrators.</p>
              <div className="flex justify-center gap-4 pt-4">
                <button onClick={() => importFileInputRef.current?.click()} className="px-10 py-5 bg-indigo-600 text-white rounded-[2.5rem] font-black text-lg flex items-center gap-3 hover:scale-105 transition-all shadow-xl shadow-indigo-100">
                  <FileUp size={24} /> RESTORE PRODUCTION FILE (.storyflow)
                </button>
                <input type="file" ref={importFileInputRef} onChange={handleImportProjectFile} accept=".storyflow" className="hidden" />
              </div>
            </div>
            
            <div className="space-y-12">
              <div className="flex items-center gap-4">
                <Heart className="text-red-500 fill-red-500" size={24} />
                <h3 className="text-3xl font-black text-slate-900">Featured Projects</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {SERIES_PRESETS.map(preset => (
                  <button key={preset.id} onClick={() => handleApplyPreset(preset)} className="p-10 bg-white border-2 border-slate-100 rounded-[4rem] text-left hover:border-indigo-600 hover:scale-[1.02] transition-all group relative overflow-hidden shadow-sm">
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <BookOpen size={32} />
                      </div>
                      <div className="bg-slate-100 px-4 py-1 rounded-full text-[10px] font-black uppercase text-slate-500">{preset.scenes.length} Scenes</div>
                    </div>
                    <h4 className="text-3xl font-black mb-3 text-slate-800 leading-tight">{preset.title}</h4>
                    <p className="text-slate-400 text-sm font-medium leading-relaxed mb-6">{preset.description}</p>
                    <ChevronRight className="absolute bottom-10 right-10 text-slate-200 group-hover:text-indigo-600 group-hover:translate-x-2 transition-all" size={32} />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-12">
              <div className="flex items-center gap-4">
                <Layout className="text-indigo-600" size={24} />
                <h3 className="text-3xl font-black text-slate-900">Industrial Tools</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <button onClick={() => checkAuthAndExecute(() => { setSettings({...settings, mode: 'restyle'}); setPages([]); setCurrentStep('upload'); })} className="p-8 bg-indigo-600 text-white rounded-[3rem] text-left hover:scale-[1.05] transition-all shadow-xl relative overflow-hidden group">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6"><Palette size={24} /></div>
                  <h4 className="text-xl font-black mb-2 leading-tight">Feature Fixer</h4>
                  <p className="text-white/60 text-[10px] uppercase font-bold tracking-widest">Upload & Correct</p>
                </button>
                <button onClick={() => checkAuthAndExecute(() => { setSettings({...settings, mode: 'prompt-pack'}); setCurrentStep('prompt-pack'); })} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:scale-[1.05] transition-all group relative">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-400 group-hover:text-indigo-600"><ClipboardList size={24} /></div>
                  <h4 className="text-xl font-black mb-2 text-slate-800 leading-tight">Prompt Pack</h4>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Manual Script Flow</p>
                </button>
                <button onClick={() => checkAuthAndExecute(() => { setSettings({...settings, mode: 'upscale'}); setPages([]); setCurrentStep('direct-upscale'); })} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:scale-[1.05] transition-all group relative">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-400 group-hover:text-indigo-600"><Maximize2 size={24} /></div>
                  <h4 className="text-xl font-black mb-2 text-slate-800 leading-tight">4K Upscale</h4>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Print Mastery</p>
                </button>
                <button onClick={() => checkAuthAndExecute(() => { setSettings({...settings, mode: 'create'}); setCurrentStep('script'); })} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:scale-[1.05] transition-all group relative">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-400 group-hover:text-indigo-600"><Rocket size={24} /></div>
                  <h4 className="text-xl font-black mb-2 text-slate-800 leading-tight">Script-to-Book</h4>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Text Storyboards</p>
                </button>
              </div>
            </div>
          </div>
        );

      case 'restyle-editor':
        return (
          <div className="max-w-7xl mx-auto py-12 space-y-12 animate-in fade-in duration-500 pb-56 px-8">
            <div className="flex flex-col md:flex-row gap-12 items-start">
              <div className="flex-1 space-y-8 sticky top-36">
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <h2 className="text-5xl font-black">Feature Fixer</h2>
                    <button 
                      onClick={() => setIsReferencedMode(!isReferencedMode)}
                      className={`px-8 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-3 transition-all ${isReferencedMode ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200' : 'bg-slate-100 text-slate-400'}`}
                    >
                      {isReferencedMode ? <Layers size={18} /> : <Scissors size={18} />}
                      {isReferencedMode ? 'Referenced Mode: ON' : 'Individual Mode'}
                    </button>
                  </div>
                  <p className="text-slate-500 text-lg">
                    {isReferencedMode 
                      ? "The Global Workspace Prompt can see all numbered images. Coordinate features between them." 
                      : "Modify each illustration individually. Numbers act as source identifiers."}
                  </p>
                </div>

                <div className="bg-white border-2 border-slate-100 rounded-[4rem] p-10 shadow-2xl space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Transformation Prompt</h3>
                    {isReferencedMode && <span className="bg-emerald-50 text-emerald-600 px-4 py-1 rounded-full text-[10px] font-black">MULTI-IMAGE CONTEXT ACTIVE</span>}
                  </div>
                  <textarea 
                    className="w-full h-48 bg-slate-50 border-none rounded-3xl p-8 text-xl font-medium outline-none resize-none shadow-inner leading-relaxed"
                    placeholder={isReferencedMode ? "e.g. 'Use the facial features from Image 1 for the man in Image 2...'" : "General instructions for all images..."}
                    value={isReferencedMode ? globalFixPrompt : "Processing..."}
                    onChange={(e) => isReferencedMode && setGlobalFixPrompt(e.target.value)}
                    disabled={!isReferencedMode}
                  />
                  <div className="flex gap-4">
                    <div className="flex-1 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                       <span className="text-[10px] font-black text-slate-400 block mb-2">TARGET SELECTION</span>
                       <p className="text-xs font-bold text-slate-600">Select images in the grid to apply this transformation to.</p>
                    </div>
                    <button onClick={processBulkRender} className="bg-indigo-600 text-white px-12 py-7 rounded-[2.5rem] font-black text-xl flex items-center gap-4 shadow-2xl hover:scale-105 transition-all">
                      <Sparkles size={28} /> RUN SELECTION
                    </button>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-2/5 grid grid-cols-1 gap-8">
                {pages.map((p, idx) => (
                  <div 
                    key={p.id} 
                    onClick={() => toggleProductionSelection(p.id)}
                    className={`bg-white p-6 rounded-[3.5rem] border-4 transition-all cursor-pointer group relative ${selectedForProduction.has(p.id) ? 'border-indigo-600 shadow-2xl scale-[1.02]' : 'border-slate-50 opacity-60 grayscale hover:opacity-100 hover:grayscale-0'}`}
                  >
                    <div className="absolute top-8 left-8 z-10 w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black shadow-2xl text-xl">#{idx + 1}</div>
                    <div className="absolute top-8 right-8 z-10 flex gap-2">
                       {selectedForProduction.has(p.id) && <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-xl"><Check size={24} /></div>}
                       <button onClick={(e) => { e.stopPropagation(); setPages(pages.filter(pg => pg.id !== p.id)); }} className="w-12 h-12 bg-white text-slate-200 rounded-2xl flex items-center justify-center shadow-lg hover:text-red-500 transition-colors"><Trash2 size={20} /></button>
                    </div>
                    <div className="aspect-[4/3] bg-slate-100 rounded-[2.5rem] overflow-hidden shadow-inner">
                      {p.originalImage && <img src={p.originalImage} className="w-full h-full object-cover" alt={`Source ${idx + 1}`} />}
                    </div>
                    {!isReferencedMode && (
                      <div className="mt-6">
                        <textarea 
                          className="w-full bg-slate-50 rounded-2xl p-4 text-xs font-bold outline-none border-none shadow-inner"
                          placeholder="Individual override..."
                          value={p.overrideStylePrompt}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => { const n = [...pages]; n[idx].overrideStylePrompt = e.target.value; setPages(n); }}
                        />
                      </div>
                    )}
                  </div>
                ))}
                <button 
                  onClick={() => restyleInputRef.current?.click()}
                  className="aspect-[4/3] border-4 border-dashed border-slate-200 rounded-[3.5rem] flex flex-col items-center justify-center gap-4 text-slate-300 hover:border-indigo-600 hover:text-indigo-600 transition-all bg-white/50"
                >
                  <Plus size={48} />
                  <span className="font-black text-xs uppercase tracking-widest">Add Image</span>
                  <input type="file" multiple hidden ref={restyleInputRef} accept="image/*" onChange={handleRestyleUpload} />
                </button>
              </div>
            </div>
          </div>
        );

      case 'generate':
        return (
          <div className="max-w-7xl mx-auto py-12 space-y-12 animate-in fade-in duration-500 pb-60 px-8">
            <div className="text-center"><h2 className="text-5xl font-black">Production Rendering</h2><p className="text-slate-500 text-xl font-medium tracking-tight">Processing {stats.completed} of {stats.total} master scenes.</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {pages.map((p, idx) => (
                <div key={p.id} className="bg-white rounded-[5rem] border-4 border-slate-50 overflow-hidden shadow-2xl relative group">
                  <div className="absolute top-8 left-8 z-10 w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black shadow-2xl">#{idx + 1}</div>
                  <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden">
                    {(p.processedImage || p.originalImage) && <img src={p.processedImage || p.originalImage} className={`w-full h-full object-cover transition-all duration-1000 ${p.status === 'processing' ? 'opacity-30 blur-xl' : 'opacity-100'}`} alt={`Scene ${idx+1}`} />}
                    {p.status === 'processing' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-600/5"><div className="w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div><span className="text-indigo-600 font-black text-xs uppercase tracking-widest">Rendering...</span></div>}
                  </div>
                  <div className="p-12 space-y-6">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Modified Scene {idx+1}</span>
                      <div className="flex gap-2">
                        <button disabled={p.status === 'processing'} onClick={() => setActiveRefineId(p.id)} className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-[10px] font-black flex items-center gap-2 hover:bg-indigo-100 transition-colors"><MessageSquareCode size={16} /> QUICK TWEAK</button>
                        <button disabled={p.status === 'processing'} onClick={() => regenerateScene(p.id)} className="bg-indigo-600/5 text-indigo-600 p-2 rounded-xl hover:bg-indigo-100 transition-colors"><RefreshCw size={16} className={p.status === 'processing' ? 'animate-spin' : ''} /></button>
                      </div>
                    </div>
                    {activeRefineId === p.id && (
                      <div className="bg-indigo-50 p-6 rounded-[2rem] space-y-4 animate-in slide-in-from-top-4 duration-300">
                        <textarea 
                          className="w-full bg-white border-none rounded-2xl p-4 text-xs font-bold outline-none resize-none shadow-sm"
                          placeholder="Small correction? (e.g., 'Make the eyes match Image 1')"
                          value={refinePrompt}
                          onChange={(e) => setRefinePrompt(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setActiveRefineId(null); setRefinePrompt(""); }} className="text-[10px] font-bold text-slate-400 px-4 py-2">CANCEL</button>
                          <button onClick={() => handleRefineScene(p.id)} className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-[10px] font-black shadow-lg">APPLY</button>
                        </div>
                      </div>
                    )}
                    <p className="text-sm text-slate-600 font-medium italic leading-relaxed line-clamp-3">{isReferencedMode ? globalFixPrompt : (p.overrideStylePrompt || p.originalText)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="fixed bottom-0 inset-x-0 bg-slate-900 text-white p-14 z-50 rounded-t-[7rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-12">
                <div className="flex items-center gap-8"><div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center text-indigo-400 font-black text-3xl shadow-inner">{stats.progress}%</div><span className="text-3xl font-black uppercase tracking-tighter">Progress</span></div>
                <div className="flex gap-8">
                  <button onClick={handleSaveProject} className="p-10 bg-white/10 rounded-[2.5rem] hover:bg-white/20 transition-all text-white"><Save size={40} /></button>
                  <button disabled={stats.completed < stats.total} onClick={() => generateBookPDF(pages, settings.exportFormat, projectName, false, settings.estimatedPageCount, settings.spreadExportMode)} className="bg-indigo-600 px-24 py-10 rounded-[4rem] font-black text-3xl flex items-center gap-8 hover:bg-indigo-500 transition-all disabled:opacity-30 shadow-2xl scale-105"><Download size={48} /> MASTER EXPORT</button>
                </div>
            </div>
          </div>
        );

      case 'prompt-pack':
        return (
          <div className="max-w-4xl mx-auto py-16 space-y-12 animate-in slide-in-from-bottom duration-500">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-black">Industrial Prompt Pack</h2>
              <p className="text-slate-500">Paste your structured script here. The AI will extract scenes and style locks.</p>
            </div>
            <textarea 
              className="w-full h-96 bg-white border-2 border-slate-100 rounded-[3rem] p-10 font-mono text-sm outline-none shadow-inner"
              placeholder="PASTE SCRIPT HERE..."
              value={rawPackText}
              onChange={(e) => setRawPackText(e.target.value)}
            />
            <button 
              disabled={isParsing || !rawPackText}
              onClick={handleParsePack}
              className="w-full py-8 bg-indigo-600 text-white rounded-[2.5rem] font-black text-2xl shadow-xl flex items-center justify-center gap-4 hover:scale-[1.02] transition-all disabled:opacity-50"
            >
              {isParsing ? <Loader2 className="animate-spin" /> : <ClipboardList />} PARSE AND BUILD WORKSPACE
            </button>
          </div>
        );

      case 'prompt-pack-editor':
        return (
          <div className="max-w-7xl mx-auto py-12 space-y-12 pb-40">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-black text-slate-900">Workspace Verification</h2>
              <p className="text-slate-500">The AI parsed {pages.length} scenes. Verify details before starting production.</p>
            </div>
            <div className="bg-white border-2 border-slate-100 rounded-[4rem] p-12 space-y-8">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-widest">Master Style Bible</h3>
              <textarea className="w-full bg-slate-50 border-none rounded-2xl p-6 text-sm italic font-medium" value={settings.masterBible} onChange={(e) => setSettings({...settings, masterBible: e.target.value})} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {pages.map((p, idx) => (
                <div key={p.id} className="bg-white p-10 rounded-[4rem] border-2 border-slate-100 shadow-sm space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="bg-slate-900 text-white px-4 py-1 rounded-full text-xs font-black">SCENE {idx+1}</span>
                    <button onClick={() => { const n = [...pages]; n[idx].isSpread = !n[idx].isSpread; setPages(n); }} className={`px-4 py-1 rounded-full text-[10px] font-black uppercase ${p.isSpread ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>SPREAD: {p.isSpread ? 'ON' : 'OFF'}</button>
                  </div>
                  <textarea className="w-full bg-slate-50 border-none rounded-2xl p-6 text-sm outline-none h-32" value={p.overrideStylePrompt} onChange={(e) => { const n = [...pages]; n[idx].overrideStylePrompt = e.target.value; setPages(n); }} />
                </div>
              ))}
            </div>
            <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-3xl p-12 z-50 flex justify-center gap-6">
               <button onClick={processBulkRender} className="bg-indigo-600 text-white px-24 py-7 rounded-[3rem] font-black text-2xl flex items-center gap-4 shadow-2xl hover:scale-105 transition-all"><Rocket size={32} /> START BULK PRODUCTION</button>
            </div>
          </div>
        );

      case 'script':
        return (
          <div className="max-w-4xl mx-auto py-16 space-y-12 animate-in slide-in-from-bottom duration-500">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-black">Story Script Lab</h2>
              <p className="text-slate-500">Write your story here. The AI will plan the illustrations and character sheets.</p>
            </div>
            <textarea 
              className="w-full h-96 bg-white border-2 border-slate-100 rounded-[3rem] p-10 font-medium text-lg outline-none shadow-inner leading-relaxed"
              placeholder="Once upon a time..."
              value={fullScript}
              onChange={(e) => setFullScript(e.target.value)}
            />
            <button 
              disabled={isParsing || !fullScript}
              onClick={handlePlanStory}
              className="w-full py-8 bg-indigo-600 text-white rounded-[2.5rem] font-black text-2xl shadow-xl flex items-center justify-center gap-4 hover:scale-[1.02] transition-all disabled:opacity-50"
            >
              {isParsing ? <Loader2 className="animate-spin" /> : <Rocket />} DEVELOP STORYBOARD
            </button>
          </div>
        );

      case 'characters':
        return (
          <div className="max-w-7xl mx-auto py-12 space-y-12 pb-40">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-black">Character Lab</h2>
              <p className="text-slate-500 text-lg font-medium">Design the consistent cast for your series.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {settings.characterReferences.map((char) => (
                <div key={char.id} className="bg-white p-10 rounded-[4rem] border-2 border-slate-100 shadow-xl space-y-8 group transition-all">
                  <div className="aspect-square bg-slate-50 rounded-[3rem] overflow-hidden relative shadow-inner flex items-center justify-center">
                    {char.images[0] === "LOADING" ? (
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-tighter text-indigo-600">Generating Sheet...</span>
                      </div>
                    ) : char.images[0] ? (
                      <img src={char.images[0]} className="w-full h-full object-cover" alt={char.name} />
                    ) : (
                      <ImageIcon className="w-16 h-16 text-slate-200" />
                    )}
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-2xl font-black text-slate-800">{char.name}</h4>
                    <p className="text-sm text-slate-500 h-20 overflow-y-auto pr-2 scrollbar-hide">{char.description}</p>
                    <button onClick={() => generateCharacterReference(char.id)} className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">Generate Sheet</button>
                  </div>
                </div>
              ))}
              <button onClick={() => setSettings({...settings, characterReferences: [...settings.characterReferences, { id: Math.random().toString(36).substring(7), name: "New Character", description: "Describe personality and look...", images: [] }]})} className="border-4 border-dashed border-slate-100 rounded-[4rem] p-10 flex flex-col items-center justify-center gap-4 text-slate-300 hover:border-indigo-600 hover:text-indigo-600 transition-all">
                <Plus size={48} />
                <span className="font-black uppercase tracking-widest">Add Character</span>
              </button>
            </div>
            <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-3xl p-12 z-50 flex justify-center gap-6">
               <button onClick={() => setCurrentStep('prompt-pack-editor')} className="bg-indigo-600 text-white px-24 py-7 rounded-[3rem] font-black text-2xl flex items-center gap-4 shadow-2xl hover:scale-105 transition-all">CONFIRM CAST AND CONTINUE</button>
            </div>
          </div>
        );

      case 'direct-upscale':
        return (
          <div className="max-w-4xl mx-auto py-12 space-y-8 animate-in slide-in-from-bottom duration-500">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-black">4K Master Upscale</h2>
              <p className="text-slate-500">Enhance your existing illustrations to print-quality 4K resolution.</p>
            </div>
            <div onClick={() => restyleInputRef.current?.click()} className="aspect-[2/1] bg-white border-4 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-600 transition-all group shadow-sm">
              <Upload size={64} className="text-slate-200 group-hover:text-indigo-600 mb-6" />
              <p className="text-slate-400 font-bold uppercase tracking-widest">Upload Rendered Art to Upscale</p>
              <input type="file" multiple hidden ref={restyleInputRef} accept="image/*" onChange={handleRestyleUpload} />
            </div>
            <button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold hover:text-slate-600 block mx-auto">Cancel</button>
          </div>
        );

      case 'upload':
        return (
          <div className="max-w-4xl mx-auto py-12 space-y-8 animate-in slide-in-from-bottom duration-500">
            <div className="text-center"><h2 className="text-4xl font-black">Import Existing Artwork</h2><p className="text-slate-500">Upload the illustrations you want to correct or restyle.</p></div>
            <div onClick={() => restyleInputRef.current?.click()} className="aspect-[2/1] bg-white border-4 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-600 transition-all group">
              <Upload size={64} className="text-slate-200 group-hover:text-indigo-600 mb-6" />
              <p className="text-slate-400 font-bold uppercase tracking-widest">Drop Illustrations or Click to Browse</p>
              <input type="file" multiple hidden ref={restyleInputRef} accept="image/*" onChange={handleRestyleUpload} />
            </div>
            <button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold hover:text-slate-600 block mx-auto">Cancel</button>
          </div>
        );

      default:
        return <div></div>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="h-28 bg-white/80 backdrop-blur-3xl border-b border-slate-100 sticky top-0 z-[60] px-12 flex items-center justify-between shadow-sm">
        <div onClick={() => setCurrentStep('landing')} className="flex items-center gap-4 cursor-pointer group">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-2xl group-hover:rotate-6 transition-transform"><Sparkles size={28} /></div>
          <h1 className="text-3xl font-black tracking-tighter text-slate-900">StoryFlow <span className="text-indigo-600">Pro</span></h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="bg-slate-50 border border-slate-100 rounded-2xl px-8 py-3 flex items-center gap-6 shadow-inner">
            <input className="bg-transparent border-none outline-none font-black text-slate-800 text-lg w-64" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            <div className="flex items-center gap-3">
              <button onClick={handleSaveProject} className="text-indigo-600 p-2 bg-white rounded-xl shadow-sm border border-slate-100 hover:scale-110 transition-transform"><Save size={20} /></button>
              <button onClick={handleExportProjectFile} className="text-emerald-600 p-2 bg-white rounded-xl shadow-sm border border-slate-100 hover:scale-110 transition-transform"><FileDown size={20} /></button>
            </div>
          </div>
          <div className="h-14 border-l border-slate-200 mx-4"></div>
          <button onClick={() => { setWizardStep('master-key'); setShowDatabaseWizard(true); }} className="flex items-center gap-2 px-6 py-3 bg-indigo-50 rounded-2xl border border-indigo-200 text-indigo-600 font-black text-xs uppercase tracking-widest"><Settings2 size={16} /> SYSTEM SETUP</button>
        </div>
      </header>
      <main className="flex-1 w-full max-w-[1600px] mx-auto">{renderStep()}</main>

      {/* Setup Wizard */}
      {showDatabaseWizard && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowDatabaseWizard(false)}></div>
          <div className="bg-white w-full max-w-xl rounded-[4rem] p-12 shadow-2xl relative z-10 space-y-10">
            {wizardStep === 'master-key' && (
              <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300 text-center">
                <div className="w-20 h-20 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-indigo-600 mx-auto mb-6"><ShieldCheck size={40} /></div>
                <h3 className="text-4xl font-black text-slate-900">Admin Gate</h3>
                <p className="text-slate-500 font-medium italic">Hint: 'storyflow'</p>
                <input type="password" className="w-full h-20 bg-slate-50 rounded-[2rem] px-8 font-bold text-slate-800 outline-none focus:ring-2 ring-indigo-500 transition-all text-xl tracking-[0.5em] text-center" placeholder="••••••••" value={masterKeyInput} onChange={e => setMasterKeyInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleMasterKeyVerify()} />
                <button onClick={handleMasterKeyVerify} className="w-full h-20 bg-indigo-600 text-white rounded-[2rem] font-black text-xl shadow-xl">ENTER SETUP MODE</button>
              </div>
            )}
            {wizardStep === 'provider' && (
              <div className="space-y-8 text-center animate-in slide-in-from-right-4 duration-300">
                <div className="w-20 h-20 bg-emerald-50 rounded-[2.5rem] flex items-center justify-center text-emerald-600 mx-auto mb-6"><CheckCircle2 size={40} /></div>
                <h3 className="text-4xl font-black text-slate-900">Gate Unlocked</h3>
                <p className="text-slate-500">You are in system configuration mode. Proceed to cloud linking or local persistence settings.</p>
                <button onClick={() => setShowDatabaseWizard(false)} className="w-full h-20 bg-slate-900 text-white rounded-[2rem] font-black text-xl">PROCEED TO DASHBOARD</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowLoginModal(false)}></div>
          <div className="bg-white w-full max-w-md rounded-[3.5rem] p-12 shadow-2xl relative z-10 space-y-8 animate-in zoom-in-95 duration-300">
            <h3 className="text-3xl font-black text-center">Production Access</h3>
            <form onSubmit={handleLogin} className="space-y-4">
              <input type="email" placeholder="Email" className="w-full h-16 bg-slate-50 rounded-2xl px-6" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
              <input type="password" placeholder="Password" className="w-full h-16 bg-slate-50 rounded-2xl px-6" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
              <button type="submit" className="w-full h-16 bg-indigo-600 text-white rounded-2xl font-black">AUTHENTICATE</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
