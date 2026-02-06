
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, Sparkles, BookOpen, Download, Trash2, Save,
  Loader2, AlertCircle, CheckCircle2, ChevronRight, 
  ChevronLeft, Plus, MapPin, Layers, Palette, Columns, Wand2, Edit3, RefreshCw, X, Rocket, Clock, Cloud, FolderOpen, MoreVertical, Maximize2, Zap, FileText, ClipboardList, UserCheck, Layout, Info, Image as ImageIcon, Heart, LogIn, LogOut, User, Lock, Mail, DatabaseZap, Database, Globe, ArrowRight, ShieldCheck, Link2, Settings2, KeyRound, FileUp, FileDown, Monitor
} from 'lucide-react';
import { BookPage, AppSettings, PRINT_FORMATS, CharacterRef, CharacterAssignment, AppMode, Project, SeriesPreset } from './types';
import { restyleIllustration, translateText, extractTextFromImage, analyzeStyleFromImage, identifyAndDesignCharacters, planStoryScenes, upscaleIllustration, parsePromptPack } from './geminiService';
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

  // Added missing authentication state variables
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
    estimatedPageCount: 32
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
          // Also save it locally automatically
          await persistenceService.saveProject(project);
          await refreshProjects();
        } else {
          alert("Invalid StoryFlow file structure.");
        }
      } catch (err) {
        alert("Failed to parse project file.");
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const checkAuthAndExecute = (action: () => void) => {
    if (isSupabaseConfigured) {
      if (user) {
        action();
      } else {
        setShowLoginModal(true);
      }
    } else {
      action();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthLoading(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    setAuthLoading(false);
    if (error) {
      setAuthError(error.message);
    } else {
      setShowLoginModal(false);
      setLoginEmail("");
      setLoginPassword("");
    }
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    refreshProjects();
  };

  const handleMasterKeyVerify = () => {
    // Standard setup key for prototype is 'storyflow'
    if (masterKeyInput === "admin123" || masterKeyInput === "storyflow") {
      setWizardStep('provider');
      setWizardError("");
    } else {
      setWizardError("Incorrect Master Setup Key. Try 'storyflow'.");
    }
  };

  const handleConnectDatabase = async () => {
    if (selectedProvider === 'supabase') {
      setWizardStep('verifying');
      setWizardError("");
      const result = await supabaseService.testConnection(dbUrl, dbKey);
      if (result.success) {
        setWizardStep('success');
        setTimeout(() => {
          supabaseService.saveConfig(dbUrl, dbKey);
        }, 1500);
      } else {
        setWizardStep('credentials');
        setWizardError(result.message);
      }
    } else if (selectedProvider === 'firebase') {
      setWizardError("Firebase integration is coming soon. Please use Supabase for now.");
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

  const handleScriptPlanning = async (script: string) => {
    setIsParsing(true);
    try {
      const plan = await planStoryScenes(script, settings.characterReferences);
      setPages(plan.pages.map(p => ({
        id: Math.random().toString(36).substring(7),
        originalText: p.text,
        status: 'idle',
        assignments: [],
        isSpread: p.isSpread
      })));
      setCurrentStep('generate');
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

  const removeCharacterImage = (charId: string, imgIdx: number) => {
    setSettings(prev => ({
      ...prev,
      characterReferences: prev.characterReferences.map(c => 
        c.id === charId ? { ...c, images: c.images.filter((_, i) => i !== imgIdx) } : c
      )
    }));
  };

  const designIndividualCharacter = async (idx: number) => {
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { 
      await (window as any).aistudio?.openSelectKey(); 
    }
    
    const char = settings.characterReferences[idx];
    try {
      const designedList = await identifyAndDesignCharacters(char.description || char.name, settings.targetStyle);
      if (designedList[0] && designedList[0].images.length > 0) {
        const updated = [...settings.characterReferences];
        updated[idx] = { ...char, images: [...char.images, ...designedList[0].images] };
        setSettings({ ...settings, characterReferences: updated });
      }
    } catch (err: any) { 
      console.error(err);
      if (err?.message?.includes("Requested entity was not found")) {
        await (window as any).aistudio?.openSelectKey();
      }
    }
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
        result = await upscaleIllustration(
          p.originalImage, 
          p.overrideStylePrompt || settings.targetStyle, 
          p.isSpread
        );
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
      if (e?.message?.includes("Requested entity was not found")) {
        await (window as any).aistudio?.openSelectKey();
      }
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'error' } : pg));
    }
  };

  const processBulkRender = async () => {
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    setIsProcessing(true);
    setCurrentStep('generate');
    
    for (let i = 0; i < pages.length; i++) {
      const pageId = pages[i].id;
      if (pages[i].status === 'completed') continue;
      await regenerateScene(pageId);
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
                  className="px-8 py-4 bg-white border-2 border-slate-100 rounded-3xl font-black text-sm flex items-center gap-3 hover:border-indigo-600 transition-all shadow-sm text-slate-600"
                >
                  <FileUp size={20} className="text-indigo-600" /> RESTORE ARCHIVE (.storyflow)
                </button>
                <input 
                  type="file" 
                  ref={importFileInputRef} 
                  onChange={handleImportProjectFile} 
                  accept=".storyflow" 
                  className="hidden" 
                />
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
                    <div className="flex gap-2">
                      {preset.characters.map((c, i) => (
                        <div key={i} className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-[8px] font-black text-slate-400 uppercase">{c.name[0]}</div>
                      ))}
                    </div>
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
                  {!user && isSupabaseConfigured && <Lock className="absolute top-8 right-8 text-white/20" size={16} />}
                </button>

                <button onClick={() => checkAuthAndExecute(() => { setSettings({...settings, mode: 'restyle'}); setCurrentStep('upload'); })} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:scale-[1.05] transition-all group relative">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-400 group-hover:text-indigo-600"><Palette size={24} /></div>
                  <h4 className="text-xl font-black mb-2 text-slate-800 leading-tight">Restyler</h4>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Artwork Conversion</p>
                  {!user && isSupabaseConfigured && <Lock className="absolute top-8 right-8 text-slate-100" size={16} />}
                </button>

                <button onClick={() => checkAuthAndExecute(() => { setSettings({...settings, mode: 'upscale'}); setPages([]); setCurrentStep('direct-upscale'); })} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:scale-[1.05] transition-all group relative">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-400 group-hover:text-indigo-600"><Maximize2 size={24} /></div>
                  <h4 className="text-xl font-black mb-2 text-slate-800 leading-tight">4K Upscale</h4>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Print Mastery</p>
                  {!user && isSupabaseConfigured && <Lock className="absolute top-8 right-8 text-slate-100" size={16} />}
                </button>

                <button onClick={() => checkAuthAndExecute(() => { setSettings({...settings, mode: 'create'}); setCurrentStep('script'); })} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:scale-[1.05] transition-all group relative">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-400 group-hover:text-indigo-600"><Rocket size={24} /></div>
                  <h4 className="text-xl font-black mb-2 text-slate-800 leading-tight">Script-to-Book</h4>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Text Storyboards</p>
                  {!user && isSupabaseConfigured && <Lock className="absolute top-8 right-8 text-slate-100" size={16} />}
                </button>
              </div>
            </div>

            {savedProjects.length > 0 && (
              <div className="pt-12 space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-3xl font-black text-slate-900">Recent Productions</h3>
                  {user && <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm"><Cloud size={16} /> Cloud Synced</div>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {savedProjects.map(proj => (
                    <div key={proj.id} onClick={() => checkAuthAndExecute(() => { setPages(proj.pages); setSettings(proj.settings); setProjectName(proj.name); setProjectId(proj.id); setCurrentStep('generate'); })} className="bg-white p-6 rounded-[3rem] border-2 border-slate-100 cursor-pointer hover:shadow-xl transition-all group relative">
                      <div className="aspect-video bg-slate-50 rounded-3xl mb-4 overflow-hidden shadow-inner">
                        {proj.thumbnail && <img src={proj.thumbnail} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={proj.name} />}
                      </div>
                      <h5 className="font-black text-slate-800 text-lg">{proj.name}</h5>
                      <div className="flex justify-between items-center mt-2">
                        <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{proj.settings.mode}</p>
                        <p className="text-[10px] text-slate-400">{new Date(proj.lastModified).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'upload':
        return (
          <div className="max-w-4xl mx-auto py-12 space-y-8 animate-in slide-in-from-bottom duration-500">
            <div className="text-center"><h2 className="text-4xl font-black">Import Existing Artwork</h2><p className="text-slate-500">Upload the illustrations you want to restyle.</p></div>
            <div 
              onClick={() => restyleInputRef.current?.click()}
              className="aspect-[2/1] bg-white border-4 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-600 transition-all group"
            >
              <Upload size={64} className="text-slate-200 group-hover:text-indigo-600 mb-6" />
              <p className="text-slate-400 font-bold uppercase tracking-widest">Drop Master Files or Click to Browse</p>
              <input 
                type="file" 
                multiple 
                hidden 
                ref={restyleInputRef} 
                accept="image/*" 
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const files = Array.from(e.target.files || []);
                  const newPages: BookPage[] = files.map(f => {
                    const reader = new FileReader();
                    const pageId = Math.random().toString(36).substring(7);
                    reader.onload = () => {
                      setPages(prev => prev.map(p => p.id === pageId ? { ...p, originalImage: reader.result as string } : p));
                    };
                    reader.readAsDataURL(f);
                    return { id: pageId, originalText: "", status: 'idle', assignments: [], isSpread: false };
                  });
                  setPages(newPages);
                  setCurrentStep('generate');
                }}
              />
            </div>
            <button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold hover:text-slate-600 block mx-auto">Cancel</button>
          </div>
        );

      case 'script':
        return (
          <div className="max-w-4xl mx-auto py-12 space-y-8 animate-in slide-in-from-bottom duration-500">
             <div className="text-center"><h2 className="text-4xl font-black">Story Script Input</h2><p className="text-slate-500">Paste your raw story. AI will plan the scenes and spreads.</p></div>
             <div className="bg-white p-10 rounded-[4rem] shadow-2xl border-2 border-slate-100">
                <textarea 
                  className="w-full h-80 bg-slate-50 border-none rounded-[2.5rem] p-8 text-sm outline-none resize-none shadow-inner"
                  placeholder="Once upon a time..."
                  value={settings.fullScript}
                  onChange={(e) => setSettings({...settings, fullScript: e.target.value})}
                />
                <button 
                  onClick={() => handleScriptPlanning(settings.fullScript || "")}
                  className="w-full bg-indigo-600 text-white py-6 rounded-[2.5rem] mt-8 font-black text-xl hover:bg-indigo-700 transition-all shadow-xl"
                >
                  PLAN STORYBOARD
                </button>
             </div>
             <button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold hover:text-slate-600 block mx-auto">Cancel</button>
          </div>
        );

      case 'prompt-pack':
        return (
          <div className="max-w-5xl mx-auto py-12 space-y-12 animate-in slide-in-from-bottom duration-500">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-black">Industrial Script Import</h2>
              <p className="text-slate-500">Automate your entire production from a single "Prompt Pack".</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 flex items-start gap-4">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 font-black">1</div>
                <div><h6 className="font-bold text-slate-800 text-sm mb-1">Paste Script</h6><p className="text-slate-400 text-xs">AI extracts your Global Style Lock and Character Bible.</p></div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 flex items-start gap-4">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 font-black">2</div>
                <div><h6 className="font-bold text-slate-800 text-sm mb-1">Lock Identity</h6><p className="text-slate-400 text-xs">AI or Manual Upload of character sheets for absolute continuity.</p></div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 flex items-start gap-4">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 font-black">3</div>
                <div><h6 className="font-bold text-slate-800 text-sm mb-1">Batch Render</h6><p className="text-slate-400 text-xs">Execute all scenes at once using the locked visual anchors.</p></div>
              </div>
            </div>

            <div className="bg-white p-12 rounded-[5rem] shadow-2xl border-2 border-slate-100 space-y-8">
              <textarea 
                className="w-full h-[500px] bg-slate-50 border-none rounded-[3rem] p-10 font-medium text-sm outline-none resize-none italic shadow-inner"
                placeholder="Paste Scene 1, Scene 2... with Master Style Lock and Consistent Characters..."
                value={rawPackText}
                onChange={(e) => setRawPackText(e.target.value)}
              />
              <button 
                disabled={!rawPackText || isParsing}
                onClick={handleParsePack}
                className="w-full bg-indigo-600 text-white py-8 rounded-[3rem] font-black text-2xl flex items-center justify-center gap-4 hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                {isParsing ? <><Loader2 className="animate-spin" /> ANALYZING PRODUCTION...</> : <><Sparkles /> INITIALIZE MASTER RENDER</>}
              </button>
            </div>
            <button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold hover:text-slate-600 block mx-auto">Cancel</button>
          </div>
        );

      case 'prompt-pack-editor':
        return (
          <div className="max-w-6xl mx-auto py-12 space-y-12 animate-in fade-in duration-500 pb-40">
            <div className="bg-white p-12 rounded-[4rem] border-2 border-slate-100 space-y-6">
              <div className="flex justify-between items-center"><h3 className="text-2xl font-black text-slate-900">Master Style Bible</h3><div className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full font-black text-xs uppercase">Global Lock</div></div>
              <textarea 
                className="w-full h-40 bg-slate-50 border-none rounded-[2rem] p-6 text-sm font-medium italic outline-none resize-none shadow-inner"
                value={settings.masterBible}
                onChange={(e) => setSettings({...settings, masterBible: e.target.value})}
              />
            </div>
            <div className="space-y-8">
              <h3 className="text-3xl font-black">Drafting Board</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {pages.map((p, idx) => (
                  <div key={p.id} className="bg-white p-8 rounded-[3.5rem] border-2 border-slate-100 shadow-sm space-y-6 group hover:border-indigo-400 transition-all">
                    <div className="flex justify-between items-center"><div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black">S{idx+1}</div><button onClick={() => setPages(pages.filter(pg => pg.id !== p.id))} className="text-slate-200 hover:text-red-500"><Trash2 size={20} /></button></div>
                    <textarea 
                      className="w-full h-32 bg-slate-50 border-none rounded-2xl p-4 text-xs font-medium outline-none resize-none shadow-inner"
                      value={p.overrideStylePrompt}
                      onChange={(e) => { const n = [...pages]; n[idx].overrideStylePrompt = e.target.value; setPages(n); }}
                    />
                    <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Layout</span>
                      <div className="flex gap-2">
                        <button onClick={() => { const n = [...pages]; n[idx].isSpread = false; setPages(n); }} className={`px-4 py-2 rounded-xl text-[10px] font-black ${!p.isSpread ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400'}`}>SINGLE</button>
                        <button onClick={() => { const n = [...pages]; n[idx].isSpread = true; setPages(n); }} className={`px-4 py-2 rounded-xl text-[10px] font-black ${p.isSpread ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400'}`}>SPREAD</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-3xl p-10 z-50 border-t-2 border-slate-100 flex justify-center gap-6 shadow-2xl rounded-t-[5rem]">
               <button onClick={() => setCurrentStep('landing')} className="px-12 py-7 rounded-[3rem] font-bold text-slate-400">Cancel</button>
               <button onClick={() => setCurrentStep('characters')} className="bg-indigo-600 text-white px-20 py-7 rounded-[3rem] font-black text-2xl flex items-center gap-4 shadow-2xl hover:scale-105 transition-all"><UserCheck size={32} /> LOCK CHARACTER IDENTITIES</button>
            </div>
          </div>
        );

      case 'characters':
        return (
          <div className="max-w-6xl mx-auto py-12 space-y-12 animate-in fade-in duration-500 pb-40">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-black">Consistent Identity Anchors</h2>
              <p className="text-slate-500 text-lg">Upload multiple reference scenes OR generate AI sheets. Every image you add strengthens face consistency.</p>
            </div>
            
            <div className="space-y-12">
              {settings.characterReferences.map((char, idx) => (
                <div key={char.id} className="bg-white p-12 rounded-[4rem] border-2 border-slate-100 shadow-xl space-y-8">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-6">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-black text-2xl">{idx + 1}</div>
                      <div>
                        <h5 className="font-black text-3xl text-slate-800">{char.name}</h5>
                        <p className="text-sm text-slate-400 font-medium italic">{char.description}</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button onClick={() => designIndividualCharacter(idx)} className="bg-indigo-50 text-indigo-600 px-8 py-4 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-indigo-100 transition-all shadow-sm"><Wand2 size={16} /> GENERATE SHEET</button>
                      <button onClick={() => charUploadRefs.current[char.id]?.click()} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg"><Plus size={16} /> ADD REFERENCE</button>
                      <input 
                        type="file" 
                        hidden 
                        ref={el => { charUploadRefs.current[char.id] = el; }}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            // Fixed: Type narrowing/assertion for Blob call
                            handleCharacterImageUpload(char.id, file as Blob);
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                    {char.images.map((img, imgIdx) => (
                      <div key={imgIdx} className="aspect-square bg-slate-50 rounded-3xl overflow-hidden relative border-2 border-slate-100 group shadow-sm">
                        <img src={img} className="w-full h-full object-cover" alt={`${char.name} ref ${imgIdx}`} />
                        <button 
                          onClick={() => removeCharacterImage(char.id, imgIdx)}
                          className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {char.images.length === 0 && (
                      <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-200 italic border-4 border-dashed border-slate-50 rounded-[3rem]">
                        <ImageIcon size={64} className="mb-4 opacity-20" />
                        <p className="font-bold text-lg">No visual anchors locked for this character</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="fixed bottom-0 inset-x-0 bg-slate-900 text-white p-12 z-50 rounded-t-[5rem] shadow-2xl border-t border-white/5">
              <div className="max-w-6xl mx-auto flex justify-between items-center">
                <button onClick={() => setCurrentStep('landing')} className="text-white/50 font-black flex items-center gap-2 hover:text-white"><ChevronLeft /> Dashboard</button>
                <button 
                  disabled={!settings.characterReferences.every(c => c.images.length > 0)}
                  onClick={processBulkRender}
                  className="bg-indigo-600 text-white px-16 py-7 rounded-[3rem] font-black text-2xl flex items-center gap-4 hover:bg-indigo-500 shadow-2xl disabled:opacity-30 transition-all"
                >
                  <Sparkles size={36} /> EXECUTE BULK RENDER
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
                    {p.status === 'processing' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-600/5"><div className="w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div><span className="text-indigo-600 font-black text-xs uppercase tracking-widest">Rendering...</span></div>}
                    {p.status === 'error' && <div className="absolute inset-0 bg-red-50 flex items-center justify-center text-red-500"><AlertCircle size={48} /></div>}
                  </div>
                  <div className="p-12 space-y-6">
                    <div className="flex justify-between items-center"><span className="text-xs font-black text-slate-400 uppercase tracking-widest">Scene {idx+1} {p.isSpread ? '— Panoramic' : '— Single'}</span><button disabled={p.status === 'processing'} onClick={() => regenerateScene(p.id)} className="bg-indigo-600/5 text-indigo-600 p-3 rounded-full hover:bg-indigo-100 transition-colors shadow-sm"><RefreshCw size={20} className={p.status === 'processing' ? 'animate-spin' : ''} /></button></div>
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

      case 'direct-upscale':
        const targetPageUpscale = pages[0];
        return (
          <div className="max-w-5xl mx-auto py-12 space-y-12 animate-in fade-in duration-500">
             <div className="flex justify-between items-center"><button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold flex items-center gap-2 hover:text-slate-600"><ChevronLeft /> Dashboard</button><div className="bg-indigo-50 px-6 py-3 rounded-full flex items-center gap-2"><Zap size={18} className="text-indigo-600" /><span className="text-indigo-600 font-black text-xs uppercase">Direct 4K Engine</span></div></div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="bg-white p-12 rounded-[4rem] border-2 border-slate-100 shadow-xl space-y-8">
                   <h3 className="text-2xl font-black">1. Upload Source</h3>
                   <div onClick={() => directUpscaleInputRef.current?.click()} className="aspect-square bg-slate-50 border-4 border-dashed rounded-[3rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-600 transition-all overflow-hidden group">
                      {targetPageUpscale?.originalImage ? <img src={targetPageUpscale.originalImage} className="w-full h-full object-cover" alt="Source image" /> : <div className="text-center text-slate-300"><Upload className="mx-auto mb-4" /><span>DROP MASTER</span></div>}
                      <input 
                        type="file" 
                        hidden 
                        ref={directUpscaleInputRef} 
                        accept="image/*" 
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { 
                          const file = e.target.files?.[0]; 
                          if (file) { 
                            const reader = new FileReader(); 
                            reader.onload = () => {
                              if (typeof reader.result === 'string') {
                                setPages([{id:'u', originalImage: reader.result, status:'idle', assignments:[], isSpread:false, originalText:''}]);
                              }
                            }; 
                            reader.readAsDataURL(file); 
                          } 
                        }} 
                      />
                   </div>
                </div>
                <div className="bg-slate-900 rounded-[5rem] p-4 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden">
                   {targetPageUpscale?.status === 'processing' && <Loader2 className="animate-spin text-indigo-500" size={64} />}
                   {targetPageUpscale?.processedImage ? <img src={targetPageUpscale.processedImage} className="w-full h-full object-contain rounded-[3rem]" alt="Processed" /> : <span className="text-white/20 font-black uppercase">Ready for Enhance</span>}
                   {targetPageUpscale?.originalImage && targetPageUpscale.status !== 'processing' && !targetPageUpscale.processedImage && <button onClick={() => regenerateScene(targetPageUpscale.id)} className="absolute bottom-10 bg-indigo-600 text-white px-10 py-5 rounded-full font-black">PERFORM 4K UPSCALE</button>}
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
              <button onClick={handleSaveProject} disabled={isSaving} className="text-indigo-600 hover:scale-110 transition-transform p-2 bg-white rounded-xl shadow-sm border border-slate-100">
                {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              </button>
              <button onClick={handleExportProjectFile} className="text-emerald-600 hover:scale-110 transition-transform p-2 bg-white rounded-xl shadow-sm border border-slate-100" title="Export to File (iPad/PC)">
                <FileDown size={20} />
              </button>
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
                <button onClick={handleLogout} className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center">
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowLoginModal(true)}
                className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg"
              >
                <LogIn size={18} /> ADMIN LOGIN
              </button>
            )
          ) : (
            <button 
              onClick={() => { setWizardStep('master-key'); setShowDatabaseWizard(true); }}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-50 hover:bg-indigo-100 transition-colors rounded-2xl border border-indigo-200 text-indigo-600 font-black text-xs uppercase tracking-widest"
            >
              <Settings2 size={16} /> SYSTEM SETUP
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 w-full max-w-[1600px] mx-auto">{renderStep()}</main>

      {/* Database Wizard Modal (Admin Protected) */}
      {showDatabaseWizard && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowDatabaseWizard(false)}></div>
          <div className="bg-white w-full max-w-xl rounded-[4rem] p-12 shadow-2xl relative z-10 space-y-10 animate-in zoom-in-95 duration-300">
            
            {wizardStep === 'master-key' && (
              <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
                <div className="text-center space-y-2">
                  <div className="w-20 h-20 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-indigo-600 mx-auto mb-6">
                    <ShieldCheck size={40} />
                  </div>
                  <h3 className="text-4xl font-black tracking-tight text-slate-900">Admin Gate</h3>
                  <p className="text-slate-500 font-medium">Please enter your Master Setup Key to configure the database.</p>
                  <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Default Key: storyflow</p>
                </div>
                <div className="space-y-6">
                  <div className="relative">
                    <KeyRound className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input 
                      type="password"
                      className="w-full h-20 bg-slate-50 rounded-[2rem] pl-16 pr-6 font-bold text-slate-800 outline-none focus:ring-2 ring-indigo-500 transition-all text-xl tracking-[0.5em]"
                      placeholder="••••••••"
                      value={masterKeyInput}
                      onChange={e => setMasterKeyInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleMasterKeyVerify()}
                    />
                  </div>
                  {wizardError && (
                    <div className="bg-red-50 text-red-500 p-4 rounded-2xl flex items-center gap-3 text-xs font-bold animate-in shake duration-300">
                      <AlertCircle size={16} />
                      {wizardError}
                    </div>
                  )}
                  <button 
                    onClick={handleMasterKeyVerify}
                    className="w-full h-20 bg-indigo-600 text-white rounded-[2rem] font-black text-xl flex items-center justify-center gap-4 hover:bg-indigo-700 transition-all shadow-xl"
                  >
                    ENTER SETUP MODE <ChevronRight />
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 'provider' && (
              <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                <div className="text-center space-y-2">
                  <div className="w-20 h-20 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-indigo-600 mx-auto mb-6">
                    <Database size={40} />
                  </div>
                  <h3 className="text-4xl font-black tracking-tight text-slate-900">Link your Database</h3>
                  <p className="text-slate-500 font-medium">Choose a provider to enable cloud sync and persistence.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <button 
                    onClick={() => { setSelectedProvider('supabase'); setWizardStep('credentials'); }}
                    className="p-8 border-2 border-slate-100 rounded-[3rem] text-left hover:border-emerald-500 hover:bg-emerald-50/30 transition-all group"
                  >
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-6"><Globe size={24} /></div>
                    <h4 className="text-xl font-black text-slate-800">Supabase</h4>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Recommended</p>
                  </button>
                  <button 
                    onClick={() => { setSelectedProvider('firebase'); setWizardStep('credentials'); }}
                    className="p-8 border-2 border-slate-100 rounded-[3rem] text-left hover:border-orange-500 hover:bg-orange-50/30 transition-all group opacity-50 cursor-not-allowed"
                  >
                    <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mb-6"><Zap size={24} /></div>
                    <h4 className="text-xl font-black text-slate-800">Firebase</h4>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Coming Soon</p>
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 'credentials' && (
              <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-4">
                  <button onClick={() => setWizardStep('provider')} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors"><ChevronLeft /></button>
                  <div>
                    <h3 className="text-3xl font-black text-slate-900">{selectedProvider === 'supabase' ? 'Supabase' : 'Firebase'} Credentials</h3>
                    <p className="text-slate-500 text-sm">Enter your project access details from your dashboard.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">API URL / PROJECT URL</label>
                    <div className="relative">
                      <Globe className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                      <input 
                        className="w-full h-16 bg-slate-50 rounded-2xl pl-16 pr-6 font-bold text-slate-800 outline-none focus:ring-2 ring-indigo-500 transition-all"
                        placeholder="https://xyz.supabase.co"
                        value={dbUrl}
                        onChange={e => setDbUrl(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">ANON / PUBLIC KEY</label>
                    <div className="relative">
                      <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                      <input 
                        type="password"
                        className="w-full h-16 bg-slate-50 rounded-2xl pl-16 pr-6 font-bold text-slate-800 outline-none focus:ring-2 ring-indigo-500 transition-all"
                        placeholder="eyJhbGciOiJIUzI1NiIsInR..."
                        value={dbKey}
                        onChange={e => setDbKey(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {wizardError && (
                  <div className="bg-red-50 text-red-500 p-6 rounded-3xl flex flex-col gap-2 text-xs font-black italic">
                    <div className="flex items-center gap-4"><AlertCircle size={20} /> CONNECTION ERROR</div>
                    <p className="font-normal opacity-80">{wizardError}</p>
                  </div>
                )}

                <button 
                  onClick={handleConnectDatabase}
                  disabled={!dbUrl || !dbKey}
                  className="w-full h-20 bg-indigo-600 text-white rounded-[2.5rem] font-black text-xl flex items-center justify-center gap-4 hover:bg-indigo-700 transition-all shadow-xl disabled:opacity-50"
                >
                  RUN CONNECTION TEST <ChevronRight />
                </button>
              </div>
            )}

            {wizardStep === 'verifying' && (
              <div className="py-20 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-500">
                <div className="relative">
                  <div className="w-24 h-24 border-8 border-indigo-100 rounded-full"></div>
                  <div className="w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin absolute inset-0"></div>
                </div>
                <div className="text-center">
                  <h4 className="text-2xl font-black text-slate-900">Testing Handshake</h4>
                  <p className="text-slate-400 font-medium">Validating project access and schema...</p>
                </div>
              </div>
            )}

            {wizardStep === 'success' && (
              <div className="py-20 flex flex-col items-center justify-center space-y-8 animate-in zoom-in-95 duration-500">
                <div className="w-24 h-24 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-2xl shadow-emerald-200 animate-bounce">
                  <CheckCircle2 size={48} />
                </div>
                <div className="text-center">
                  <h4 className="text-3xl font-black text-slate-900">System Linked!</h4>
                  <p className="text-slate-500 font-medium">StoryFlow is now enterprise-enabled. Reloading production state...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Login Modal (Supplied by Supabase) */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowLoginModal(false)}></div>
          <div className="bg-white w-full max-w-md rounded-[3.5rem] p-12 shadow-2xl relative z-10 space-y-8 animate-in zoom-in-95 duration-300">
            <div className="text-center space-y-2">
              <div className="w-20 h-20 bg-indigo-50 rounded-[2rem] flex items-center justify-center text-indigo-600 mx-auto mb-6">
                <Lock size={36} />
              </div>
              <h3 className="text-3xl font-black text-slate-900">Production Access</h3>
              <p className="text-slate-500 text-sm">Login with your database account to access project workflows.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="email" 
                    placeholder="Email Address" 
                    className="w-full h-16 bg-slate-50 rounded-2xl pl-16 pr-6 outline-none focus:ring-2 ring-indigo-500 transition-all"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="password" 
                    placeholder="Password" 
                    className="w-full h-16 bg-slate-50 rounded-2xl pl-16 pr-6 outline-none focus:ring-2 ring-indigo-500 transition-all"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {authError && (
                <div className="bg-red-50 text-red-500 p-4 rounded-2xl flex items-center gap-3 text-xs font-bold animate-in shake duration-300">
                  <AlertCircle size={16} />
                  {authError}
                </div>
              )}

              <button 
                type="submit" 
                disabled={authLoading}
                className="w-full h-20 bg-indigo-600 text-white rounded-[2rem] font-black text-xl flex items-center justify-center gap-4 hover:bg-indigo-700 transition-all shadow-xl disabled:opacity-50"
              >
                {authLoading ? <Loader2 className="animate-spin" /> : <>AUTHENTICATE <ChevronRight /></>}
              </button>
            </form>

            <button onClick={() => setShowLoginModal(false)} className="w-full text-slate-400 font-bold text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
