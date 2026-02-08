
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, Sparkles, BookOpen, Download, Trash2, Save,
  Loader2, AlertCircle, CheckCircle2, ChevronRight, 
  ChevronLeft, Plus, MapPin, Layers, Palette, Columns, Wand2, Edit3, RefreshCw, X, Rocket, Clock, Cloud, FolderOpen, MoreVertical, Maximize2, Zap, FileText, ClipboardList, UserCheck, Layout, Info, Image as ImageIcon, Heart, LogIn, LogOut, User, Lock, Mail, DatabaseZap, Database, Globe, ArrowRight, ShieldCheck, Link2, Settings2, KeyRound, FileUp, FileDown, Monitor, MessageSquareCode, Scissors, ToggleLeft as Toggle, Settings, Check, Frame, BookMarked, Megaphone, QrCode, FileCheck
} from 'lucide-react';
import { BookPage, AppSettings, PRINT_FORMATS, CharacterRef, CharacterAssignment, AppMode, Project, SeriesPreset } from './types';
import { restyleIllustration, translateText, extractTextFromImage, analyzeStyleFromImage, identifyAndDesignCharacters, planStoryScenes, upscaleIllustration, parsePromptPack, refineIllustration, generateBookCover } from './geminiService';
import { generateBookPDF } from './utils/pdfGenerator';
import { persistenceService } from './persistenceService';
import { SERIES_PRESETS, GLOBAL_STYLE_LOCK } from './seriesData';
import { supabase, isSupabaseConfigured, supabaseService } from './supabaseService';

type Step = 'landing' | 'upload' | 'restyle-editor' | 'script' | 'prompt-pack' | 'prompt-pack-editor' | 'characters' | 'generate' | 'direct-upscale' | 'cover-master';
type WizardStep = 'master-key' | 'provider' | 'credentials' | 'verifying' | 'success';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>('landing');
  const [projectId, setProjectId] = useState<string>(Math.random().toString(36).substring(7));
  const [projectName, setProjectName] = useState<string>("Untitled Masterpiece");
  const [pages, setPages] = useState<BookPage[]>([]);
  const [rawPackText, setRawPackText] = useState("");
  const [fullScript, setFullScript] = useState("");
  const [projectContext, setProjectContext] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  
  // Production Dashboard States
  const [isReferencedMode, setIsReferencedMode] = useState(true);
  const [globalFixPrompt, setGlobalFixPrompt] = useState("Keep facial features and clothing consistent with reference images.");
  const [selectedForProduction, setSelectedForProduction] = useState<Set<string>>(new Set());
  const [targetAspectRatio, setTargetAspectRatio] = useState<'4:3' | '16:9' | '1:1' | '9:16'>('4:3');
  const [targetResolution, setTargetResolution] = useState<'1K' | '2K' | '4K'>('1K');

  // Refinement UI
  const [activeRefineId, setActiveRefineId] = useState<string | null>(null);
  const [refinePrompt, setRefinePrompt] = useState("");

  // System Setup
  const [showDatabaseWizard, setShowDatabaseWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('master-key');
  const [masterKeyInput, setMasterKeyInput] = useState("");
  const [wizardError, setWizardError] = useState("");

  const [settings, setSettings] = useState<AppSettings>({
    mode: 'restyle',
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
  const charImageInputRef = useRef<HTMLInputElement>(null);
  const [activeCharId, setActiveCharId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = pages.length;
    const completed = pages.filter(p => p.status === 'completed').length;
    const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, progress };
  }, [pages]);

  useEffect(() => {
    const init = async () => {
      const projs = await persistenceService.getAllProjects();
      setSavedProjects(projs);
    };
    init();
  }, []);

  const handleExportProjectFile = () => {
    const thumbnail = coverImage || pages.find(p => p.processedImage || p.originalImage)?.processedImage;
    const project: Project = { id: projectId, name: projectName, lastModified: Date.now(), settings, pages, thumbnail };
    const blob = new window.Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}.storyflow`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSaveProject = async () => {
    setIsSaving(true);
    try {
      const thumbnail = coverImage || pages.find(p => p.processedImage || p.originalImage)?.processedImage;
      const project: Project = { id: projectId, name: projectName, lastModified: Date.now(), settings, pages, thumbnail };
      await persistenceService.saveProject(project);
      const projs = await persistenceService.getAllProjects();
      setSavedProjects(projs);
    } catch (e) { console.error(e); }
    finally { setIsSaving(false); }
  };

  const handleCharImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] as unknown as Blob | undefined;
    if (!file || !activeCharId) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setSettings(prev => ({
        ...prev,
        characterReferences: prev.characterReferences.map(c => 
          c.id === activeCharId ? { ...c, images: [base64] } : c
        )
      }));
      setActiveCharId(null);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateCoverDesign = async () => {
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    setIsProcessing(true);
    try {
      const res = await generateBookCover(projectContext, settings.characterReferences, settings.targetStyle);
      setCoverImage(res);
    } catch (e) { alert("Cover generation failed."); }
    finally { setIsProcessing(false); }
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
    } catch (e) { alert("Story planning failed."); }
    finally { setIsParsing(false); }
  };

  const handleParsePack = async () => {
    if (!rawPackText) return;
    setIsParsing(true);
    try {
      const result = await parsePromptPack(rawPackText);
      setSettings(prev => ({
        ...prev,
        masterBible: result.masterBible || prev.masterBible,
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
      setCurrentStep('characters');
    } catch (e) { alert("Prompt pack parsing failed."); }
    finally { setIsParsing(false); }
  };

  const handleRestyleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as unknown as Blob[];
    let loaded = 0;
    const newPages: BookPage[] = [];
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => {
        newPages.push({
          id: Math.random().toString(36).substring(7),
          originalImage: reader.result as string,
          originalText: "",
          status: 'idle',
          assignments: [],
          isSpread: targetAspectRatio === '16:9',
          overrideStylePrompt: settings.targetStyle
        });
        loaded++;
        if (loaded === files.length) {
          setPages(prev => [...prev, ...newPages]);
          setSelectedForProduction(prev => {
            const next = new Set(prev);
            newPages.forEach(p => next.add(p.id));
            return next;
          });
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
      if (!p) return;
      let result;
      if (settings.mode === 'upscale' && p.originalImage) {
        result = await upscaleIllustration(p.originalImage, p.overrideStylePrompt || settings.targetStyle, p.isSpread, targetResolution);
      } else {
        const basePrompt = (isReferencedMode ? globalFixPrompt : p.overrideStylePrompt) || settings.targetStyle;
        const outpaintingInstruction = `REFORMAT TO ${targetAspectRatio} RATIO. ${basePrompt}`;
        if (p.originalImage) {
          const others = pages.filter(pg => pg.id !== pageId && (pg.processedImage || pg.originalImage)).slice(0, 3).map(pg => ({ base64: (pg.processedImage || pg.originalImage)!, index: pages.indexOf(pg) + 1 }));
          result = await refineIllustration(p.originalImage, outpaintingInstruction, others, p.isSpread, targetResolution);
        } else {
          result = await restyleIllustration(undefined, outpaintingInstruction, undefined, undefined, settings.characterReferences, [], true, false, p.isSpread, settings.masterBible, targetResolution);
        }
      }
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'completed', processedImage: result } : pg));
    } catch (e) {
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'error' } : pg));
    }
  };

  const handleRefineScene = async (pageId: string) => {
    if (!refinePrompt) return;
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    
    setPages(curr => curr.map(p => p.id === pageId ? { ...p, status: 'processing' } : p));
    try {
      const p = pages.find(pg => pg.id === pageId);
      if (!p) return;
      const targetImg = p.processedImage || p.originalImage;
      if (!targetImg) throw new Error("No image to refine");

      const res = await refineIllustration(targetImg, refinePrompt, [], p.isSpread, targetResolution);
      
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'completed', processedImage: res } : pg));
      setActiveRefineId(null);
      setRefinePrompt("");
    } catch (e) {
      console.error(e);
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'error' } : pg));
    }
  };

  const processBulkRender = async () => {
    setIsProcessing(true);
    setCurrentStep('generate');
    const targets = pages.filter(p => selectedForProduction.has(p.id));
    for (const target of targets) {
      await regenerateScene(target.id);
    }
    setIsProcessing(false);
  };

  const handleMasterKeyVerify = () => {
    if (masterKeyInput.toLowerCase() === 'storyflow') setWizardStep('provider');
    else setWizardError("Incorrect key.");
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'landing':
        return (
          <div className="max-w-6xl mx-auto py-16 space-y-16 animate-in fade-in duration-700 pb-32">
            <div className="text-center space-y-6">
              <h2 className="text-7xl font-black text-slate-900 tracking-tighter">Series <span className="text-indigo-600">Master</span></h2>
              <p className="text-slate-500 text-xl max-w-2xl mx-auto font-medium">Professional Children's Book Production Dashboard.</p>
              <div className="flex justify-center gap-4 pt-4">
                <button onClick={() => { setSettings({...settings, mode: 'restyle'}); setCurrentStep('upload'); }} className="px-10 py-5 bg-indigo-600 text-white rounded-[2.5rem] font-black text-lg flex items-center gap-3 hover:scale-105 transition-all shadow-xl shadow-indigo-100">
                  <Palette size={24} /> NEW PROJECT
                </button>
              </div>
            </div>
            
            <div className="space-y-12">
              <div className="flex items-center gap-4">
                <Layout className="text-indigo-600" size={24} />
                <h3 className="text-3xl font-black text-slate-900">Module Selection</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <button onClick={() => setCurrentStep('cover-master')} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:scale-[1.05] transition-all group shadow-sm">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 text-indigo-600"><BookMarked size={24} /></div>
                  <h4 className="text-xl font-black mb-2 text-slate-800 leading-tight">Cover Designer</h4>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Synthesis & Marketing</p>
                </button>
                <button onClick={() => { setSettings({...settings, mode: 'restyle'}); setPages([]); setCurrentStep('upload'); }} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:scale-[1.05] transition-all group shadow-sm">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-400"><Palette size={24} /></div>
                  <h4 className="text-xl font-black mb-2 text-slate-800 leading-tight">Feature Fixer</h4>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Bulk Consistency</p>
                </button>
                <button onClick={() => { setSettings({...settings, mode: 'upscale'}); setPages([]); setCurrentStep('direct-upscale'); }} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:scale-[1.05] transition-all group shadow-sm">
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-6 text-emerald-600"><Maximize2 size={24} /></div>
                  <h4 className="text-xl font-black mb-2 text-slate-800 leading-tight">4K Master</h4>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Print Ready High-Res</p>
                </button>
                <button onClick={() => { setSettings({...settings, mode: 'create'}); setPages([]); setCurrentStep('script'); }} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:scale-[1.05] transition-all group shadow-sm">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 text-indigo-600"><Rocket size={24} /></div>
                  <h4 className="text-xl font-black mb-2 text-slate-800 leading-tight">Script-to-Book</h4>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">AI Storyboarding</p>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 <button onClick={() => { setSettings({...settings, mode: 'prompt-pack'}); setPages([]); setCurrentStep('prompt-pack'); }} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 hover:scale-[1.05] transition-all group shadow-sm">
                  <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mb-6 text-amber-600"><Zap size={24} /></div>
                  <h4 className="text-xl font-black mb-2 text-slate-800 leading-tight">Prompt Pack Parser</h4>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Industrial Data Intake</p>
                </button>
              </div>
            </div>
          </div>
        );

      case 'cover-master':
        return (
          <div className="max-w-7xl mx-auto py-12 space-y-12 animate-in fade-in duration-500 pb-56 px-8">
            <div className="flex flex-col md:flex-row gap-12 items-start">
              <div className="flex-1 space-y-8 sticky top-36">
                <div className="space-y-4">
                  <h2 className="text-5xl font-black">Cover Designer Pro</h2>
                  <p className="text-slate-500 text-lg font-medium">Inject marketing brief and character likeness for a production cover.</p>
                </div>
                <div className="bg-white border-2 border-slate-100 rounded-[4rem] p-10 shadow-2xl space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600 flex items-center gap-2"><Megaphone size={16} /> Production Context Brief</h3>
                    <textarea className="w-full h-80 bg-slate-50 border-none rounded-3xl p-8 text-sm font-medium outline-none resize-none shadow-inner leading-relaxed" placeholder="Paste marketing info, educational goals, and story unique features..." value={projectContext} onChange={e => setProjectContext(e.target.value)} />
                  </div>
                  <button disabled={isProcessing || !projectContext} onClick={handleGenerateCoverDesign} className="w-full py-7 bg-indigo-600 text-white rounded-[2.5rem] font-black text-xl flex items-center justify-center gap-4 shadow-2xl hover:scale-105 transition-all disabled:opacity-30">
                    {isProcessing ? <Loader2 className="animate-spin" size={28} /> : <Sparkles size={28} />} GENERATE PRODUCTION COVER
                  </button>
                </div>
              </div>
              <div className="w-full md:w-2/5 space-y-8">
                <div className="bg-white p-10 rounded-[4rem] border-4 border-slate-50 shadow-2xl space-y-8 relative overflow-hidden">
                  <div className="aspect-[3/4] bg-slate-100 rounded-[3rem] overflow-hidden shadow-inner flex items-center justify-center relative">
                    {coverImage ? <img src={coverImage} className="w-full h-full object-cover" /> : <BookMarked size={64} className="text-slate-200" />}
                    {isProcessing && <div className="absolute inset-0 bg-indigo-600/20 backdrop-blur-md flex items-center justify-center"><Loader2 size={64} className="animate-spin text-white" /></div>}
                  </div>
                  {coverImage && (
                    <button onClick={() => { const a = document.createElement('a'); a.href = coverImage; a.download = 'book_cover.png'; a.click(); }} className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-lg uppercase tracking-widest flex items-center justify-center gap-4 shadow-xl hover:scale-[1.02] transition-all">
                      <Download size={24} /> EXPORT COVER IMAGE
                    </button>
                  )}
                </div>
                <div className="bg-white p-8 rounded-[4rem] border-2 border-slate-100 space-y-6">
                  <div className="flex justify-between items-center"><h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Cast Consistency Refs</h3><button onClick={() => setCurrentStep('characters')} className="text-indigo-600 font-bold text-xs uppercase underline">Update Lab</button></div>
                  <div className="grid grid-cols-2 gap-4">
                    {settings.characterReferences.map(char => (
                      <div key={char.id} className="aspect-square bg-slate-50 rounded-2xl overflow-hidden border-2 border-slate-100 flex items-center justify-center">
                        {char.images[0] ? <img src={char.images[0]} className="w-full h-full object-cover" /> : <ImageIcon className="text-slate-200" />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'script':
        return (
          <div className="max-w-4xl mx-auto py-16 space-y-12 animate-in slide-in-from-bottom duration-500 px-8">
            <div className="text-center space-y-4"><h2 className="text-5xl font-black">Script-to-Book</h2><p className="text-slate-500 text-lg font-medium">Auto-Storyboard your full narrative into production frames.</p></div>
            <textarea className="w-full h-96 bg-white border-2 border-slate-100 rounded-[3rem] p-10 font-medium text-lg outline-none shadow-inner leading-relaxed" placeholder="Write or paste your story script here..." value={fullScript} onChange={e => setFullScript(e.target.value)} />
            <div className="flex gap-4">
               <button onClick={() => setCurrentStep('landing')} className="flex-1 py-8 bg-slate-100 text-slate-500 rounded-[2.5rem] font-black text-xl hover:bg-slate-200 transition-all">CANCEL</button>
               <button disabled={isParsing || !fullScript} onClick={handlePlanStory} className="flex-[2] py-8 bg-indigo-600 text-white rounded-[2.5rem] font-black text-2xl shadow-xl flex items-center justify-center gap-4 hover:scale-[1.02] transition-all disabled:opacity-50">
                {isParsing ? <Loader2 className="animate-spin" /> : <Rocket />} DEVELOP PRODUCTION STORYBOARD
              </button>
            </div>
          </div>
        );

      case 'prompt-pack':
        return (
          <div className="max-w-4xl mx-auto py-16 space-y-12 animate-in slide-in-from-bottom duration-500 px-8">
            <div className="text-center space-y-4"><h2 className="text-5xl font-black">Prompt Pack Parser</h2><p className="text-slate-500 text-lg font-medium">Extract consistent character identities and scene prompts from your data pack.</p></div>
            <textarea className="w-full h-96 bg-white border-2 border-slate-100 rounded-[3rem] p-10 font-medium text-lg outline-none shadow-inner leading-relaxed" placeholder="Paste your structural prompt pack data here..." value={rawPackText} onChange={e => setRawPackText(e.target.value)} />
            <div className="flex gap-4">
               <button onClick={() => setCurrentStep('landing')} className="flex-1 py-8 bg-slate-100 text-slate-500 rounded-[2.5rem] font-black text-xl">CANCEL</button>
               <button disabled={isParsing || !rawPackText} onClick={handleParsePack} className="flex-[2] py-8 bg-amber-500 text-white rounded-[2.5rem] font-black text-2xl shadow-xl flex items-center justify-center gap-4 hover:scale-[1.02] transition-all disabled:opacity-50">
                {isParsing ? <Loader2 className="animate-spin" /> : <Zap />} PARSE INDUSTRIAL PACK
              </button>
            </div>
          </div>
        );

      case 'direct-upscale':
        return (
          <div className="max-w-4xl mx-auto py-16 space-y-12 animate-in slide-in-from-bottom duration-500 px-8">
            <div className="text-center space-y-4"><h2 className="text-5xl font-black">4K Master Enhancement</h2><p className="text-slate-500 text-lg font-medium">Restore and upscale illustrations to print-quality 4K.</p></div>
            <div className="bg-white border-2 border-slate-100 rounded-[4rem] p-12 shadow-2xl space-y-8">
               <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">Select Upscale Precision</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {(['1K', '2K', '4K'] as const).map(res => (
                      <button key={res} onClick={() => setTargetResolution(res)} className={`p-6 rounded-3xl border-2 font-black text-xl flex flex-col items-center gap-2 ${targetResolution === res ? 'border-emerald-600 bg-emerald-50 text-emerald-600 shadow-lg shadow-emerald-100' : 'border-slate-50 text-slate-400 opacity-60'}`}>
                        {res} {res === '4K' && <Sparkles size={16} className="text-amber-500" />}
                      </button>
                    ))}
                  </div>
                </div>
                <div onClick={() => restyleInputRef.current?.click()} className="aspect-[2/1] bg-slate-50 border-4 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center cursor-pointer hover:border-emerald-600 transition-all group shadow-inner">
                  <Upload size={64} className="text-slate-200 group-hover:text-emerald-600 mb-6 transition-colors" />
                  <p className="text-slate-400 font-bold uppercase tracking-widest group-hover:text-emerald-600 transition-colors">Select Files to Master</p>
                  <input type="file" multiple hidden ref={restyleInputRef} accept="image/*" onChange={handleRestyleUpload} />
                </div>
            </div>
            <button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold hover:text-slate-600 block mx-auto underline">Back to Modules</button>
          </div>
        );

      case 'characters':
        return (
          <div className="max-w-7xl mx-auto py-12 space-y-12 pb-40 px-8">
            <div className="text-center space-y-4"><h2 className="text-5xl font-black">Character Continuity Lab</h2><p className="text-slate-500 text-lg font-medium">Define and upload your cast to lock visual features for generation.</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {settings.characterReferences.map(char => (
                <div key={char.id} className="bg-white p-8 rounded-[4rem] border-2 border-slate-100 shadow-xl space-y-6 group transition-all hover:scale-[1.02]">
                  <div className="aspect-square bg-slate-50 rounded-[3rem] overflow-hidden relative shadow-inner flex items-center justify-center">
                    {char.images[0] ? <img src={char.images[0]} className="w-full h-full object-cover" /> : <ImageIcon className="w-12 h-12 text-slate-200" />}
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                       <button onClick={() => { setActiveCharId(char.id); charImageInputRef.current?.click(); }} className="p-3 bg-white rounded-xl text-indigo-600 shadow-xl"><Upload size={18} /></button>
                       <button onClick={() => setSettings(s => ({...s, characterReferences: s.characterReferences.map(c => c.id === char.id ? {...c, images: []} : c)}))} className="p-3 bg-white rounded-xl text-red-500 shadow-xl"><Trash2 size={18} /></button>
                    </div>
                  </div>
                  <div className="space-y-4 text-center">
                    <h4 className="text-xl font-black text-slate-800">{char.name}</h4>
                    <p className="text-[10px] text-slate-500 line-clamp-2 h-8">{char.description}</p>
                    <div className="flex gap-2">
                      <button onClick={() => { setActiveCharId(char.id); charImageInputRef.current?.click(); }} className="flex-1 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm">Upload Ref</button>
                      <button onClick={() => identifyAndDesignCharacters(char.description || char.name, settings.targetStyle).then(res => {
                        setSettings(s => ({...s, characterReferences: s.characterReferences.map(c => c.id === char.id ? {...c, images: res[0].images} : c)}));
                      })} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all shadow-sm">AI Design</button>
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={() => setSettings({...settings, characterReferences: [...settings.characterReferences, { id: Math.random().toString(36).substring(7), name: "New Character", description: "Describe physique...", images: [] }]})} className="border-4 border-dashed border-slate-100 rounded-[4rem] p-10 flex flex-col items-center justify-center gap-4 text-slate-300 hover:border-indigo-600 transition-all bg-white/50 group">
                <Plus size={48} className="group-hover:scale-110 transition-transform" /><span className="font-black uppercase tracking-widest">Add Character</span>
              </button>
            </div>
            <input type="file" ref={charImageInputRef} className="hidden" accept="image/*" onChange={handleCharImageUpload} />
            <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-3xl p-12 z-50 flex justify-center gap-6 border-t border-slate-100">
               <button onClick={() => setCurrentStep('restyle-editor')} className="bg-indigo-600 text-white px-24 py-7 rounded-[3rem] font-black text-2xl flex items-center gap-4 shadow-2xl hover:scale-105 transition-all">CONFIRM CAST & PROCEED</button>
            </div>
          </div>
        );

      case 'restyle-editor':
        return (
          <div className="max-w-7xl mx-auto py-12 space-y-12 animate-in fade-in duration-500 pb-56 px-8">
            <div className="flex flex-col md:flex-row gap-12 items-start">
              <div className="flex-1 space-y-8 sticky top-36">
                <div className="flex justify-between items-end">
                  <h2 className="text-5xl font-black">{settings.mode === 'upscale' ? 'Master Prep' : 'Production Setup'}</h2>
                  <button onClick={() => setIsReferencedMode(!isReferencedMode)} className={`px-8 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-3 transition-all ${isReferencedMode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {isReferencedMode ? <Layers size={18} /> : <Scissors size={18} />} {isReferencedMode ? 'Continuity Mode' : 'Individual Mode'}
                  </button>
                </div>
                <div className="bg-white border-2 border-slate-100 rounded-[4rem] p-10 shadow-2xl space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Output Specs</h3>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                       {(['1K', '2K', '4K'] as const).map(res => (
                        <button key={res} onClick={() => setTargetResolution(res)} className={`p-4 rounded-2xl border-2 font-black text-xs flex flex-col items-center gap-1 ${targetResolution === res ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-slate-50 text-slate-400'}`}>{res}</button>
                      ))}
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      {(['1:1', '4:3', '16:9', '9:16'] as const).map(ratio => (
                        <button key={ratio} onClick={() => setTargetAspectRatio(ratio)} className={`p-4 rounded-2xl border-2 font-black text-xs flex flex-col items-center gap-2 ${targetAspectRatio === ratio ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-50 text-slate-400'}`}><Frame size={20} />{ratio}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Global Directive</h3>
                    <textarea className="w-full h-48 bg-slate-50 border-none rounded-3xl p-8 text-xl font-medium outline-none resize-none shadow-inner" placeholder="Coordinate facial features and outfit consistency..." value={globalFixPrompt} onChange={e => setGlobalFixPrompt(e.target.value)} />
                  </div>
                  <button disabled={selectedForProduction.size === 0 || isProcessing} onClick={processBulkRender} className="bg-indigo-600 text-white px-12 py-7 rounded-[2.5rem] font-black text-xl flex items-center gap-4 shadow-2xl hover:scale-105 transition-all w-full justify-center disabled:opacity-30">
                    {isProcessing ? <Loader2 className="animate-spin" size={28} /> : <Sparkles size={28} />} {settings.mode === 'upscale' ? 'START 4K MASTER RENDER' : 'START PRODUCTION RENDER'}
                  </button>
                </div>
              </div>
              <div className="w-full md:w-2/5 grid grid-cols-1 gap-8">
                {pages.map((p, idx) => (
                  <div key={p.id} onClick={() => setSelectedForProduction(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} className={`bg-white p-6 rounded-[3.5rem] border-4 transition-all cursor-pointer group relative ${selectedForProduction.has(p.id) ? 'border-indigo-600 shadow-2xl scale-[1.02]' : 'border-slate-50 opacity-60 grayscale hover:opacity-100 hover:grayscale-0'}`}>
                    <div className="absolute top-8 left-8 z-10 w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black shadow-2xl text-xl">#{idx + 1}</div>
                    <div className="aspect-[4/3] bg-slate-100 rounded-[2.5rem] overflow-hidden shadow-inner">
                      {(p.processedImage || p.originalImage) && <img src={p.processedImage || p.originalImage} className="w-full h-full object-cover" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'generate':
        return (
          <div className="max-w-7xl mx-auto py-12 space-y-12 animate-in fade-in duration-500 pb-60 px-8">
            <div className="text-center"><h2 className="text-5xl font-black text-slate-900">Final Processing</h2><p className="text-slate-500 text-xl font-medium tracking-tight">Industrializing your illustration frames at {targetResolution}.</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {pages.map((p, idx) => (
                <div key={p.id} className="bg-white rounded-[5rem] border-4 border-slate-50 overflow-hidden shadow-2xl relative group">
                  <div className="absolute top-8 left-8 z-10 w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black shadow-2xl">#{idx + 1}</div>
                  <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                    {(p.processedImage || p.originalImage) && <img src={p.processedImage || p.originalImage} className={`w-full h-full object-cover transition-all duration-1000 ${p.status === 'processing' ? 'opacity-30 blur-xl' : 'opacity-100'}`} />}
                    {p.status === 'processing' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-600/5"><div className="w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div><span className="text-indigo-600 font-black text-xs uppercase tracking-widest">Rendering Frame...</span></div>}
                  </div>
                  <div className="p-12 space-y-6">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Frame {idx+1}</span>
                      <div className="flex gap-2">
                        {p.processedImage && <button onClick={() => { const a = document.createElement('a'); a.href = p.processedImage!; a.download = `frame_${idx+1}.png`; a.click(); }} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"><Download size={18} /></button>}
                        <button disabled={p.status === 'processing'} onClick={() => setActiveRefineId(p.id)} className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">Tweak</button>
                      </div>
                    </div>
                    {activeRefineId === p.id && (
                      <div className="bg-indigo-50 p-6 rounded-[2rem] space-y-4 animate-in slide-in-from-top duration-300">
                        <textarea className="w-full bg-white border-none rounded-2xl p-4 text-xs font-bold outline-none shadow-sm" placeholder="e.g., 'Make eyes bigger', 'Change hair to brown'..." value={refinePrompt} onChange={e => setRefinePrompt(e.target.value)} />
                        <div className="flex justify-end gap-2"><button onClick={() => setActiveRefineId(null)} className="text-[10px] font-bold text-slate-400 px-4 py-2 uppercase">Cancel</button><button onClick={() => handleRefineScene(p.id)} className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase">Apply Fix</button></div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="fixed bottom-0 inset-x-0 bg-slate-900 text-white p-14 z-50 rounded-t-[7rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-12 border-t border-white/5">
                <div className="flex items-center gap-8"><div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center text-indigo-400 font-black text-3xl shadow-inner border border-white/10">{stats.progress}%</div><span className="text-3xl font-black uppercase tracking-tighter">Production Status</span></div>
                <div className="flex gap-6">
                  <button onClick={() => setCurrentStep('landing')} className="px-12 py-10 bg-white/5 rounded-[4rem] font-black text-xl hover:bg-white/10 transition-all uppercase tracking-widest">Back</button>
                  <button onClick={handleSaveProject} className="p-10 bg-white/5 rounded-[2.5rem] hover:bg-white/10 transition-all text-white"><Save size={40} /></button>
                  <button disabled={stats.completed === 0 || isProcessing} onClick={() => generateBookPDF(pages, settings.exportFormat, projectName, false, settings.estimatedPageCount, settings.spreadExportMode)} className="bg-indigo-600 px-24 py-10 rounded-[4rem] font-black text-3xl flex items-center gap-8 hover:bg-indigo-500 transition-all disabled:opacity-30 shadow-2xl scale-105 active:scale-100"><Download size={48} /> FULL BOOK EXPORT</button>
                </div>
            </div>
          </div>
        );

      case 'upload':
        return (
          <div className="max-w-4xl mx-auto py-12 space-y-8 animate-in slide-in-from-bottom duration-500 px-8">
            <div className="text-center space-y-4"><h2 className="text-5xl font-black text-slate-900">Upload Illustrations</h2><p className="text-slate-500 text-xl font-medium">Batch process your existing series frames.</p></div>
            <div onClick={() => restyleInputRef.current?.click()} className="aspect-[2/1] bg-white border-4 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-600 transition-all group shadow-sm">
              <Upload size={64} className="text-slate-200 group-hover:text-indigo-600 mb-6" />
              <p className="text-slate-400 font-bold uppercase tracking-widest group-hover:text-indigo-600 transition-colors">Select Files to Load</p>
              <input type="file" multiple hidden ref={restyleInputRef} accept="image/*" onChange={handleRestyleUpload} />
            </div>
            <div className="flex justify-center gap-6"><button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold hover:text-slate-600 underline">Cancel</button></div>
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
            <input className="bg-transparent border-none outline-none font-black text-slate-800 text-lg w-64" value={projectName} onChange={e => setProjectName(e.target.value)} />
            <div className="flex items-center gap-3">
              <button onClick={handleSaveProject} className="text-indigo-600 p-2 bg-white rounded-xl shadow-sm border border-slate-100 hover:scale-110 transition-transform"><Save size={20} /></button>
              <button onClick={handleExportProjectFile} className="text-emerald-600 p-2 bg-white rounded-xl shadow-sm border border-slate-100 hover:scale-110 transition-transform"><FileDown size={20} /></button>
            </div>
          </div>
          <div className="h-14 border-l border-slate-200 mx-4"></div>
          <button onClick={() => setShowDatabaseWizard(true)} className="flex items-center gap-2 px-6 py-3 bg-indigo-50 rounded-2xl border border-indigo-200 text-indigo-600 font-black text-xs uppercase tracking-widest"><Settings2 size={16} /> SYSTEM</button>
        </div>
      </header>
      <main className="flex-1 w-full max-w-[1600px] mx-auto">{renderStep()}</main>

      {showDatabaseWizard && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowDatabaseWizard(false)}></div>
          <div className="bg-white w-full max-w-xl rounded-[4rem] p-12 shadow-2xl relative z-10 space-y-10">
            <div className="space-y-8 text-center">
              <div className="w-20 h-20 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-indigo-600 mx-auto mb-6"><ShieldCheck size={40} /></div>
              <h3 className="text-4xl font-black text-slate-900">Admin Mode</h3>
              <input type="password" placeholder="••••••••" className="w-full h-20 bg-slate-50 rounded-[2rem] px-8 font-bold text-slate-800 outline-none text-xl tracking-[0.5em] text-center" value={masterKeyInput} onChange={e => setMasterKeyInput(e.target.value)} />
              <button onClick={handleMasterKeyVerify} className="w-full h-20 bg-indigo-600 text-white rounded-[2rem] font-black text-xl shadow-xl">PROCEED</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
