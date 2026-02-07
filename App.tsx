
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, Sparkles, BookOpen, Download, Trash2, Save,
  Loader2, AlertCircle, CheckCircle2, ChevronRight, 
  ChevronLeft, Plus, MapPin, Layers, Palette, Columns, Wand2, Edit3, RefreshCw, X, Rocket, Clock, Cloud, FolderOpen, MoreVertical, Maximize2, Zap, FileText, ClipboardList, UserCheck, Layout, Info, Image as ImageIcon, Heart, LogIn, LogOut, User, Lock, Mail, DatabaseZap, Database, Globe, ArrowRight, ShieldCheck, Link2, Settings2, KeyRound, FileUp, FileDown, Monitor, MessageSquareCode, Scissors
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
    // DEFAULT TO THE BEAUTIFUL RAMADAN STYLE
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
  }, []);

  const refreshProjects = async () => {
    const projs = await persistenceService.getAllProjects();
    setSavedProjects(projs);
  };

  const handleExportProjectFile = () => {
    const thumbnail = pages.find(p => p.processedImage || p.originalImage)?.processedImage || pages.find(p => p.originalImage)?.originalImage;
    const project: Project = { id: projectId, name: projectName, lastModified: Date.now(), settings, pages, thumbnail };
    // Fix: Explicitly use window.Blob and window.URL to avoid potential shadowing/conflicts and resolve 'unknown' type issues
    const blob = new window.Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}.storyflow`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleImportProjectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = event.target?.result;
        // Fix: Ensure result is a string before parsing to avoid 'unknown' errors
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

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    refreshProjects();
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
      // Fix: Line 219 and surrounding area often trigger type errors if the project structure isn't perfectly mapped
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
          // DEFAULT PROMPT TO STYLE LOCK
          overrideStylePrompt: settings.targetStyle 
        };
        newPages.push(p);
        loaded++;
        if (loaded === files.length) {
          setPages(prev => [...prev, ...newPages]);
          setCurrentStep('restyle-editor');
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
        // Use refinement if we have an image and a short corrective prompt
        const prompt = p.overrideStylePrompt || settings.targetStyle;
        const isCorrection = prompt.length < 100 || prompt.includes("add") || prompt.includes("change");
        
        if (p.originalImage && isCorrection) {
          result = await refineIllustration(p.originalImage, prompt, p.isSpread);
        } else {
          result = await restyleIllustration(
            p.originalImage,
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
              <p className="text-slate-500 text-xl max-w-2xl mx-auto">Professional continuity dashboard for children's illustrators.</p>
              
              <div className="flex justify-center gap-4 pt-4">
                <button 
                  onClick={() => importFileInputRef.current?.click()}
                  className="px-10 py-5 bg-indigo-600 text-white rounded-[2.5rem] font-black text-lg flex items-center gap-3 hover:scale-105 transition-all shadow-xl shadow-indigo-100"
                >
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

      case 'upload':
        return (
          <div className="max-w-4xl mx-auto py-12 space-y-8 animate-in slide-in-from-bottom duration-500">
            <div className="text-center"><h2 className="text-4xl font-black">Import Existing Artwork</h2><p className="text-slate-500">Upload the illustrations you want to correct or restyle.</p></div>
            <div 
              onClick={() => restyleInputRef.current?.click()}
              className="aspect-[2/1] bg-white border-4 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-600 transition-all group"
            >
              <Upload size={64} className="text-slate-200 group-hover:text-indigo-600 mb-6" />
              <p className="text-slate-400 font-bold uppercase tracking-widest">Drop Illustrations or Click to Browse</p>
              <input type="file" multiple hidden ref={restyleInputRef} accept="image/*" onChange={handleRestyleUpload} />
            </div>
            <button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold hover:text-slate-600 block mx-auto">Cancel</button>
          </div>
        );

      case 'restyle-editor':
        return (
          <div className="max-w-7xl mx-auto py-12 space-y-12 animate-in fade-in duration-500 pb-40 px-8">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-black">Feature Correction Board</h2>
              <p className="text-slate-500 text-lg">Specify the changes for each image. The prompt is pre-filled with your **Ramadan Series** style lock.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {pages.map((p, idx) => (
                <div key={p.id} className="bg-white p-8 rounded-[4rem] border-2 border-slate-100 shadow-xl space-y-8 group hover:border-indigo-400 transition-all">
                  <div className="flex justify-between items-center">
                    <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black">IMAGE {idx+1}</div>
                    <button onClick={() => setPages(pages.filter(pg => pg.id !== p.id))} className="text-slate-200 hover:text-red-500"><Trash2 size={24} /></button>
                  </div>
                  <div className="aspect-[4/3] bg-slate-50 rounded-3xl overflow-hidden relative shadow-inner">
                    {p.originalImage && <img src={p.originalImage} className="w-full h-full object-cover" alt="Preview" />}
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-slate-100">
                      <span className="text-[10px] font-black uppercase text-indigo-600">Locked Style Active</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Modification Instructions (e.g. "Add a hijab")</label>
                    <textarea 
                      className="w-full h-40 bg-slate-50 border-none rounded-3xl p-6 text-sm font-medium outline-none resize-none shadow-inner"
                      placeholder="Add a hijab, change colors, etc."
                      value={p.overrideStylePrompt}
                      onChange={(e) => { const n = [...pages]; n[idx].overrideStylePrompt = e.target.value; setPages(n); }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-3xl p-12 z-50 border-t-2 border-slate-100 flex justify-center gap-6 shadow-2xl rounded-t-[5rem]">
               <button onClick={() => setCurrentStep('landing')} className="px-12 py-7 rounded-[3rem] font-bold text-slate-400">Discard All</button>
               <button onClick={processBulkRender} className="bg-indigo-600 text-white px-20 py-7 rounded-[3rem] font-black text-2xl flex items-center gap-4 shadow-2xl hover:scale-105 transition-all"><Sparkles size={32} /> GENERATE MODIFICATIONS</button>
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
                  <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden">
                    {(p.processedImage || p.originalImage) && <img src={p.processedImage || p.originalImage} className={`w-full h-full object-cover transition-all duration-1000 ${p.status === 'processing' ? 'opacity-30 blur-xl' : 'opacity-100'}`} alt={`Scene ${idx+1}`} />}
                    {p.status === 'processing' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-600/5"><div className="w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div><span className="text-indigo-600 font-black text-xs uppercase tracking-widest">Rendering...</span></div>}
                  </div>
                  <div className="p-12 space-y-6">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Scene {idx+1}</span>
                      <div className="flex gap-2">
                        <button disabled={p.status === 'processing'} onClick={() => setActiveRefineId(p.id)} className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-[10px] font-black flex items-center gap-2 hover:bg-indigo-100 transition-colors"><MessageSquareCode size={16} /> QUICK TWEAK</button>
                        <button disabled={p.status === 'processing'} onClick={() => regenerateScene(p.id)} className="bg-indigo-600/5 text-indigo-600 p-2 rounded-xl hover:bg-indigo-100 transition-colors"><RefreshCw size={16} className={p.status === 'processing' ? 'animate-spin' : ''} /></button>
                      </div>
                    </div>
                    {activeRefineId === p.id && (
                      <div className="bg-indigo-50 p-6 rounded-[2rem] space-y-4 animate-in slide-in-from-top-4 duration-300">
                        <textarea 
                          className="w-full bg-white border-none rounded-2xl p-4 text-xs font-bold outline-none resize-none shadow-sm"
                          placeholder="Small correction? (e.g., 'Add a hijab to the woman')"
                          value={refinePrompt}
                          onChange={(e) => setRefinePrompt(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setActiveRefineId(null); setRefinePrompt(""); }} className="text-[10px] font-bold text-slate-400 px-4 py-2">CANCEL</button>
                          <button onClick={() => handleRefineScene(p.id)} className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-[10px] font-black shadow-lg">APPLY</button>
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
