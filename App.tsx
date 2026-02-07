
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, Sparkles, BookOpen, Download, Trash2, Save,
  Loader2, AlertCircle, CheckCircle2, ChevronRight, 
  ChevronLeft, Plus, MapPin, Layers, Palette, Columns, Wand2, Edit3, RefreshCw, X, Rocket, Clock, Cloud, FolderOpen, MoreVertical, Maximize2, Zap, FileText, ClipboardList, UserCheck, Layout, Info, Image as ImageIcon, Heart, LogIn, LogOut, User, Lock, Mail, DatabaseZap, Database, Globe, ArrowRight, ShieldCheck, Link2, Settings2, KeyRound, FileUp, FileDown, Monitor, MessageSquareCode
} from 'lucide-react';
import { BookPage, AppSettings, PRINT_FORMATS, CharacterRef, CharacterAssignment, AppMode, Project, SeriesPreset } from './types';
import { restyleIllustration, translateText, extractTextFromImage, analyzeStyleFromImage, identifyAndDesignCharacters, planStoryScenes, upscaleIllustration, parsePromptPack, refineIllustration } from './geminiService';
import { generateBookPDF } from './utils/pdfGenerator';
import { persistenceService } from './persistenceService';
import { SERIES_PRESETS, GLOBAL_STYLE_LOCK } from './seriesData';
import { supabase, isSupabaseConfigured, supabaseService } from './supabaseService';

type Step = 'landing' | 'upload' | 'script' | 'prompt-pack' | 'prompt-pack-editor' | 'characters' | 'generate' | 'direct-upscale';
type WizardStep = 'master-key' | 'provider' | 'credentials' | 'verifying' | 'success';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>('landing');
  const [projectId, setProjectId] = useState<string>(Math.random().toString(36).substring(7));
  const [projectName, setProjectName] = useState<string>("Untitled Masterpiece");
  const [pages, setPages] = useState<BookPage[]>([]);
  const [rawPackText, setRawPackText] = useState("");
  const [user, setUser] = useState<any>(null);
  
  // Database Wizard States
  const [showDatabaseWizard, setShowDatabaseWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('master-key');
  const [masterKeyInput, setMasterKeyInput] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<'supabase' | 'firebase' | null>(null);
  const [dbUrl, setDbUrl] = useState("");
  const [dbKey, setDbKey] = useState("");
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
    // DEFAULT TO RAMADAN PROJECT STYLE
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

  const directUpscaleInputRef = useRef<HTMLInputElement>(null);
  const restyleInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const charUploadRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

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

    let subscription: any = null;
    if (isSupabaseConfigured && supabase) {
      const authSub = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        refreshProjects();
      });
      subscription = authSub.data.subscription;
    }

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  const refreshProjects = async () => {
    const projs = await persistenceService.getAllProjects();
    setSavedProjects(projs);
  };

  const handleExportProjectFile = () => {
    const thumbnail = pages.find(p => p.processedImage || p.originalImage)?.processedImage || pages.find(p => p.originalImage)?.originalImage;
    const project: Project = { id: projectId, name: projectName, lastModified: Date.now(), settings, pages, thumbnail };
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
        const project = JSON.parse(event.target?.result as string) as Project;
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
    if (isSupabaseConfigured) {
      if (user) { action(); } 
      else { setShowLoginModal(true); }
    } else { action(); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthLoading(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    setAuthLoading(false);
    if (error) { setAuthError(error.message); } 
    else {
      setShowLoginModal(false);
      setLoginEmail("");
      setLoginPassword("");
    }
  };

  const handleLogout = async () => {
    if (supabase) { await supabase.auth.signOut(); }
    setUser(null);
    refreshProjects();
  };

  const handleMasterKeyVerify = () => {
    if (masterKeyInput === "admin123" || masterKeyInput === "storyflow") {
      setWizardStep('provider');
      setWizardError("");
    } else { setWizardError("Incorrect Master Setup Key. Hint: storyflow"); }
  };

  const handleConnectDatabase = async () => {
    if (selectedProvider === 'supabase') {
      setWizardStep('verifying');
      setWizardError("");
      const result = await supabaseService.testConnection(dbUrl, dbKey);
      if (result.success) {
        setWizardStep('success');
        setTimeout(() => { supabaseService.saveConfig(dbUrl, dbKey); }, 1500);
      } else {
        setWizardStep('credentials');
        setWizardError(result.message);
      }
    }
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
        originalText: "",
        status: 'idle',
        assignments: [],
        isSpread: s.isSpread,
        overrideStylePrompt: s.prompt
      })));
      setCurrentStep('prompt-pack-editor');
    } catch (e: any) { 
      console.error(e);
      if (e?.message?.includes("Requested entity was not found")) {
        await (window as any).aistudio?.openSelectKey();
      }
    }
    finally { setIsParsing(false); }
  };

  const handleCharacterImageUpload = (charId: string, file: Blob) => {
    const reader = new FileReader();
    reader.onload = () => {
      setSettings(prev => ({
        ...prev,
        characterReferences: prev.characterReferences.map(c => 
          c.id === charId ? { ...c, images: [...c.images, reader.result as string] } : c
        )
      }));
    };
    reader.readAsDataURL(file);
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
        result = await restyleIllustration(
          p.originalImage,
          p.overrideStylePrompt || settings.targetStyle,
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

      const result = await refineIllustration(imgToRefine, refinePrompt, p.isSpread);
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'completed', processedImage: result } : pg));
      setRefinePrompt("");
    } catch (e: any) {
      console.error(e);
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'error' } : pg));
    }
  };

  const processBulkRender = async () => {
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    setIsProcessing(true);
    setCurrentStep('generate');
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].status === 'completed') continue;
      await regenerateScene(pages[i].id);
    }
    setIsProcessing(false);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'landing':
        return (
          <div className="max-w-6xl mx-auto py-16 space-y-16 animate-in fade-in duration-700 pb-32">
            <div className="text-center space-y-6">
              <h2 className="text-7xl font-black text-slate-900 tracking-tighter">Series <span className="text-indigo-600">Master</span></h2>
              <p className="text-slate-500 text-xl max-w-2xl mx-auto">High-continuity production dashboard for consistent book series.</p>
              
              <div className="flex justify-center gap-4 pt-4">
                <button 
                  onClick={() => importFileInputRef.current?.click()}
                  className="px-10 py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-lg flex items-center gap-3 hover:scale-105 transition-all shadow-xl shadow-indigo-100"
                >
                  <FileUp size={24} /> RESTORE PRODUCTION FILE (.storyflow)
                </button>
                <input type="file" ref={importFileInputRef} onChange={handleImportProjectFile} accept=".storyflow" className="hidden" />
              </div>
            </div>
            
            <div className="space-y-12">
              <div className="flex items-center gap-4">
                <Heart className="text-red-500 fill-red-500" size={24} />
                <h3 className="text-3xl font-black text-slate-900">Featured Series Packs</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {SERIES_PRESETS.map(preset => (
                  <button 
                    key={preset.id}
                    onClick={() => handleApplyPreset(preset)}
                    className="p-10 bg-white border-2 border-slate-100 rounded-[4rem] text-left hover:border-indigo-600 hover:scale-[1.02] transition-all group relative overflow-hidden shadow-sm"
                  >
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
                <h3 className="text-3xl font-black text-slate-900">Utility Workflows</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <button onClick={() => checkAuthAndExecute(() => { setSettings({...settings, mode: 'prompt-pack'}); setCurrentStep('prompt-pack'); })} className="p-8 bg-indigo-600 text-white rounded-[3rem] text-left hover:scale-[1.05] transition-all shadow-xl relative overflow-hidden group">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6"><ClipboardList size={24} /></div>
                  <h4 className="text-xl font-black mb-2 leading-tight">Prompt Pack</h4>
                  <p className="text-white/60 text-[10px] uppercase font-bold tracking-widest">Manual Script Flow</p>
                </button>

                <button onClick={() => checkAuthAndExecute(() => { setSettings({...settings, mode: 'restyle'}); setCurrentStep('upload'); })} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:scale-[1.05] transition-all group relative">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-400 group-hover:text-indigo-600"><Palette size={24} /></div>
                  <h4 className="text-xl font-black mb-2 text-slate-800 leading-tight">Restyler</h4>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Artwork Conversion</p>
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

      case 'generate':
        return (
          <div className="max-w-7xl mx-auto py-12 space-y-12 animate-in fade-in duration-500 pb-60 px-8">
            <div className="text-center"><h2 className="text-5xl font-black">Industrial Rendering Active</h2><p className="text-slate-500 text-xl font-medium tracking-tight">Processing {stats.completed} of {stats.total} master scenes.</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {pages.map((p, idx) => (
                <div key={p.id} className="bg-white rounded-[5rem] border-4 border-slate-50 overflow-hidden shadow-2xl relative group">
                  <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden">
                    {(p.processedImage || p.originalImage) && <img src={p.processedImage || p.originalImage} className={`w-full h-full object-cover transition-all duration-1000 ${p.status === 'processing' ? 'opacity-30 blur-xl' : 'opacity-100'}`} alt={`Scene ${idx+1}`} />}
                    {p.status === 'processing' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-600/5"><div className="w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div><span className="text-indigo-600 font-black text-xs uppercase tracking-widest">Processing...</span></div>}
                  </div>
                  <div className="p-12 space-y-6">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Scene {idx+1}</span>
                      <div className="flex gap-2">
                        <button disabled={p.status === 'processing'} onClick={() => setActiveRefineId(p.id)} className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-[10px] font-black flex items-center gap-2 hover:bg-indigo-100 transition-colors"><MessageSquareCode size={16} /> REFINE DETAILS</button>
                        <button disabled={p.status === 'processing'} onClick={() => regenerateScene(p.id)} className="bg-indigo-600/5 text-indigo-600 p-2 rounded-xl hover:bg-indigo-100 transition-colors"><RefreshCw size={16} className={p.status === 'processing' ? 'animate-spin' : ''} /></button>
                      </div>
                    </div>
                    {activeRefineId === p.id && (
                      <div className="bg-indigo-50 p-6 rounded-[2rem] space-y-4 animate-in slide-in-from-top-4 duration-300">
                        <textarea 
                          className="w-full bg-white border-none rounded-2xl p-4 text-xs font-bold outline-none resize-none shadow-sm"
                          placeholder="What would you like to correct? (e.g., 'Add a hijab to the woman')"
                          value={refinePrompt}
                          onChange={(e) => setRefinePrompt(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setActiveRefineId(null); setRefinePrompt(""); }} className="text-[10px] font-bold text-slate-400 px-4 py-2">CANCEL</button>
                          <button onClick={() => handleRefineScene(p.id)} className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-[10px] font-black shadow-lg">APPLY CORRECTION</button>
                        </div>
                      </div>
                    )}
                    <p className="text-sm text-slate-600 font-medium italic leading-relaxed line-clamp-3">{p.overrideStylePrompt || p.originalText}</p>
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
          
          {isSupabaseConfigured ? (
            user ? (
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-slate-900">{user.email}</p>
                  <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest">Admin Access</p>
                </div>
                <button onClick={handleLogout} className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center"><LogOut size={20} /></button>
              </div>
            ) : (
              <button onClick={() => setShowLoginModal(true)} className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg">ADMIN LOGIN</button>
            )
          ) : (
            <button onClick={() => { setWizardStep('master-key'); setShowDatabaseWizard(true); }} className="flex items-center gap-2 px-6 py-3 bg-indigo-50 rounded-2xl border border-indigo-200 text-indigo-600 font-black text-xs uppercase tracking-widest"><Settings2 size={16} /> SYSTEM SETUP</button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1600px] mx-auto">{renderStep() || <div></div>}</main>

      {/* Setup Wizard */}
      {showDatabaseWizard && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowDatabaseWizard(false)}></div>
          <div className="bg-white w-full max-w-xl rounded-[4rem] p-12 shadow-2xl relative z-10 space-y-10">
            {wizardStep === 'master-key' && (
              <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
                <div className="text-center space-y-2">
                  <div className="w-20 h-20 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-indigo-600 mx-auto mb-6"><ShieldCheck size={40} /></div>
                  <h3 className="text-4xl font-black text-slate-900">Admin Gate</h3>
                  <p className="text-slate-500 font-medium italic">Hint: 'storyflow'</p>
                </div>
                <input 
                  type="password" 
                  className="w-full h-20 bg-slate-50 rounded-[2rem] px-8 font-bold text-slate-800 outline-none focus:ring-2 ring-indigo-500 transition-all text-xl tracking-[0.5em] text-center" 
                  placeholder="••••••••" 
                  value={masterKeyInput} 
                  onChange={e => setMasterKeyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleMasterKeyVerify()}
                />
                <button onClick={handleMasterKeyVerify} className="w-full h-20 bg-indigo-600 text-white rounded-[2rem] font-black text-xl hover:bg-indigo-700 transition-all shadow-xl">ENTER SETUP MODE</button>
              </div>
            )}
            {/* ... other wizard steps (credentials, verifying, etc.) omitted for brevity but preserved in functionality ... */}
            {wizardStep === 'provider' && (
              <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                <div className="text-center space-y-2"><Database size={40} className="mx-auto text-indigo-600 mb-6" /><h3 className="text-4xl font-black text-slate-900">Link Database</h3></div>
                <button onClick={() => { setSelectedProvider('supabase'); setWizardStep('credentials'); }} className="w-full p-8 border-2 border-slate-100 rounded-[3rem] text-left hover:border-emerald-500 transition-all flex items-center justify-between group">
                   <div><h4 className="text-xl font-black text-slate-800">Supabase Cloud</h4><p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Recommended for Enterprise Sync</p></div>
                   <ChevronRight className="text-slate-200 group-hover:text-emerald-500" />
                </button>
              </div>
            )}
            {wizardStep === 'credentials' && (
              <div className="space-y-8">
                <h3 className="text-3xl font-black">Credentials</h3>
                <input className="w-full h-16 bg-slate-50 rounded-2xl px-6 font-bold" placeholder="Supabase URL" value={dbUrl} onChange={e => setDbUrl(e.target.value)} />
                <input type="password" className="w-full h-16 bg-slate-50 rounded-2xl px-6 font-bold" placeholder="Anon Key" value={dbKey} onChange={e => setDbKey(e.target.value)} />
                <button onClick={handleConnectDatabase} className="w-full h-20 bg-indigo-600 text-white rounded-[2rem] font-black">TEST CONNECTION</button>
              </div>
            )}
            {wizardStep === 'verifying' && <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-indigo-600" size={64} /><p className="mt-4 font-black">Handshake Active...</p></div>}
            {wizardStep === 'success' && <div className="py-20 text-center text-emerald-500"><CheckCircle2 className="mx-auto" size={80} /><h4 className="text-3xl font-black mt-4">Linked Successfully</h4></div>}
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
