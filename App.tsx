
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, Sparkles, BookOpen, Download, Trash2, Save,
  Loader2, AlertCircle, CheckCircle2, ChevronRight, 
  ChevronLeft, Plus, MapPin, Layers, Palette, Columns, Wand2, Edit3, RefreshCw, X, Rocket, Clock, Cloud, FolderOpen, MoreVertical, Maximize2, Zap, FileText, ClipboardList, UserCheck, Layout, Info, Image as ImageIcon, Heart, LogIn, LogOut, User, Lock, Mail, DatabaseZap, Database, Globe, ArrowRight, ShieldCheck, Link2, Settings2, KeyRound, FileUp, FileDown, Monitor, MessageSquareCode, Scissors, ToggleLeft as Toggle, Settings, Check, Frame, BookMarked, Megaphone, QrCode, FileCheck, Ruler, Book, PenTool, Eraser, Maximize
} from 'lucide-react';
import { BookPage, AppSettings, PRINT_FORMATS, CharacterRef, CharacterAssignment, AppMode, Project, SeriesPreset, ExportFormat } from './types';
import { restyleIllustration, translateText, extractTextFromImage, analyzeStyleFromImage, identifyAndDesignCharacters, planStoryScenes, upscaleIllustration, parsePromptPack, refineIllustration, generateBookCover } from './geminiService';
import { generateBookPDF } from './utils/pdfGenerator';
import { persistenceService } from './persistenceService';
import { SERIES_PRESETS, GLOBAL_STYLE_LOCK } from './seriesData';

type Step = 'landing' | 'upload' | 'restyle-editor' | 'script' | 'prompt-pack' | 'characters' | 'generate' | 'direct-upscale' | 'cover-master' | 'production-layout';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>('landing');
  const [projectId, setProjectId] = useState<string>(Math.random().toString(36).substring(7));
  const [projectName, setProjectName] = useState<string>("Untitled Masterpiece");
  const [pages, setPages] = useState<BookPage[]>([]);
  const [fullScript, setFullScript] = useState("");
  const [projectContext, setProjectContext] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  
  // Global Production Bible Settings
  const [globalFixPrompt, setGlobalFixPrompt] = useState("Keep character facial features, outfits, and color schemes exactly as shown in reference images.");
  const [targetAspectRatio, setTargetAspectRatio] = useState<'4:3' | '16:9' | '1:1' | '9:16'>('4:3');
  const [targetResolution, setTargetResolution] = useState<'1K' | '2K' | '4K'>('1K');
  const [selectedForProduction, setSelectedForProduction] = useState<Set<string>>(new Set());
  const [showBibleEditor, setShowBibleEditor] = useState(false);
  
  // The Fixer & Outpainter State
  const [activeRefineId, setActiveRefineId] = useState<string | null>(null);
  const [refinePrompt, setRefinePrompt] = useState("");
  const [isOutpainting, setIsOutpainting] = useState(false);

  const [settings, setSettings] = useState<AppSettings>({
    mode: 'restyle',
    targetStyle: 'soft vibrant children’s storybook illustration, painterly, rounded shapes, big expressive eyes, gentle glow lighting, warm pastel palette, minimal outlines, high readability',
    targetLanguage: 'NONE_CLEAN_BG',
    exportFormat: 'KDP_SQUARE',
    spreadExportMode: 'WIDE_SPREAD',
    useProModel: true,
    embedTextInImage: false,
    characterReferences: [],
    estimatedPageCount: 32,
    masterBible: GLOBAL_STYLE_LOCK
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const restyleInputRef = useRef<HTMLInputElement>(null);
  const charImageInputRef = useRef<HTMLInputElement>(null);
  const [activeCharId, setActiveCharId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = pages.length;
    const completed = pages.filter(p => p.status === 'completed').length;
    return { total, completed, progress: total === 0 ? 0 : Math.round((completed / total) * 100) };
  }, [pages]);

  // Handlers
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
    } catch (e) { alert("Script analysis failed."); }
    finally { setIsParsing(false); }
  };

  const handleRestyleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as unknown as Blob[];
    const newPages: BookPage[] = [];
    let loaded = 0;
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
          setCurrentStep('restyle-editor');
        }
      };
      reader.readAsDataURL(f);
    });
  };

  const handleCharImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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

  const handleSaveProject = async () => {
    const project: Project = {
      id: projectId,
      name: projectName,
      lastModified: Date.now(),
      settings,
      pages,
      thumbnail: pages.find(p => p.processedImage)?.processedImage || pages[0]?.originalImage
    };
    try { await persistenceService.saveProject(project); } catch (e) { console.error(e); }
  };

  const renderScene = async (pageId: string) => {
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    
    setPages(curr => curr.map(p => p.id === pageId ? { ...p, status: 'processing' } : p));
    try {
      const p = pages.find(pg => pg.id === pageId);
      if (!p) return;

      const narrativeContext = p.originalText ? `STORY LINE: "${p.originalText}". ${globalFixPrompt}` : (p.overrideStylePrompt || settings.targetStyle);
      
      let result;
      if (p.originalImage) {
        // Refinement/Restyling of existing layout
        const others = pages.filter(pg => pg.id !== pageId && pg.processedImage).slice(0, 3).map(pg => ({ base64: pg.processedImage!, index: pages.indexOf(pg) + 1 }));
        result = await refineIllustration(p.originalImage, narrativeContext, others, p.isSpread, targetResolution, settings.masterBible, projectContext, settings.characterReferences);
      } else {
        // Fresh generation from script
        result = await restyleIllustration(undefined, narrativeContext, undefined, undefined, settings.characterReferences, [], true, false, p.isSpread, settings.masterBible, targetResolution, projectContext);
      }
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'completed', processedImage: result } : pg));
    } catch (e) {
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'error' } : pg));
    }
  };

  // NARRATIVE FIXER & OUTPAINTER LOGIC
  const handleApplyNarrativeFix = async (pageId: string, transformMode: boolean = false) => {
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    
    setPages(curr => curr.map(p => p.id === pageId ? { ...p, status: 'processing' } : p));
    try {
      const p = pages.find(pg => pg.id === pageId)!;
      const targetImg = p.processedImage || p.originalImage!;
      
      let instruction = "";
      if (transformMode) {
        // Outpainting logic: Expand the scene to the new ratio
        const newRatio = p.isSpread ? "4:3 Single Page" : "16:9 Wide Spread";
        instruction = `FORMAT TRANSFORMATION: Outpaint and expand this scene to a ${newRatio}. Keep the existing central composition and characters intact, but intelligently extend the environment to the left and right to fill the new width. Narrative: "${p.originalText || 'General Scene'}"`;
        // Toggle the internal spread state for the metadata
        setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, isSpread: !pg.isSpread } : pg));
      } else {
        // Targeted detail fix
        instruction = `TARGETED DETAIL FIX for script line: "${p.originalText || 'General Scene'}". USER EDIT: "${refinePrompt}". Ensure the change matches character refs and style bible perfectly.`;
      }

      const others = pages.filter(pg => pg.id !== pageId && pg.processedImage).slice(0, 2).map(pg => ({ base64: pg.processedImage!, index: pages.indexOf(pg) + 1 }));
      const res = await refineIllustration(targetImg, instruction, others, !p.isSpread && transformMode ? true : p.isSpread, targetResolution, settings.masterBible, projectContext, settings.characterReferences);
      
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'completed', processedImage: res } : pg));
      setActiveRefineId(null);
      setRefinePrompt("");
      setIsOutpainting(false);
    } catch (e) {
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'error' } : pg));
    }
  };

  const processProductionBatch = async () => {
    setIsProcessing(true);
    setCurrentStep('generate');
    const targets = pages.filter(p => p.status !== 'completed');
    for (const target of targets) { await renderScene(target.id); }
    setIsProcessing(false);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'landing':
        return (
          <div className="max-w-6xl mx-auto py-20 px-8 space-y-20 animate-in fade-in duration-700">
            <div className="text-center space-y-6">
              <h2 className="text-8xl font-black text-slate-900 tracking-tighter">Series <span className="text-indigo-600">Master</span></h2>
              <p className="text-slate-500 text-2xl max-w-2xl mx-auto font-medium">Professional Children's Book Production & Consistency Lab.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <button onClick={() => { setSettings({...settings, mode: 'create'}); setCurrentStep('script'); }} className="group p-10 bg-white border-2 border-slate-100 rounded-[4rem] text-left hover:border-indigo-600 hover:shadow-2xl transition-all">
                <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center mb-8 text-indigo-600 group-hover:scale-110 transition-transform"><Rocket size={32} /></div>
                <h4 className="text-2xl font-black mb-3 text-slate-900">Script Storyboarder</h4>
                <p className="text-slate-400 font-medium">Auto-generate full series frames from your narrative script.</p>
              </button>
              <button onClick={() => { setSettings({...settings, mode: 'restyle'}); setCurrentStep('upload'); }} className="group p-10 bg-white border-2 border-slate-100 rounded-[4rem] text-left hover:border-indigo-600 hover:shadow-2xl transition-all">
                <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mb-8 text-slate-400 group-hover:scale-110 transition-transform"><Palette size={32} /></div>
                <h4 className="text-2xl font-black mb-3 text-slate-900">Feature Restyler</h4>
                <p className="text-slate-400 font-medium">Adapt existing artwork to new styles while locking character faces.</p>
              </button>
              <button onClick={() => setCurrentStep('production-layout')} className="group p-10 bg-white border-2 border-indigo-100 rounded-[4rem] text-left hover:border-indigo-600 hover:shadow-2xl transition-all">
                <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center mb-8 text-indigo-600 group-hover:scale-110 transition-transform"><Ruler size={32} /></div>
                <h4 className="text-2xl font-black mb-3 text-slate-900">KDP/Lulu Layout</h4>
                <p className="text-slate-400 font-medium">Automate Bleed, Gutter, and Trim for print-ready interiors.</p>
              </button>
            </div>
          </div>
        );

      case 'script':
        return (
          <div className="max-w-4xl mx-auto py-20 px-8 space-y-12 animate-in slide-in-from-bottom duration-500">
            <div className="text-center space-y-4"><h2 className="text-5xl font-black">Narrative Analysis</h2><p className="text-slate-500 text-xl font-medium">Parse your script into production scenes.</p></div>
            <textarea className="w-full h-[500px] bg-white border-2 border-slate-100 rounded-[3rem] p-12 text-xl font-medium outline-none shadow-inner leading-relaxed" placeholder="Paste full script here..." value={fullScript} onChange={e => setFullScript(e.target.value)} />
            <div className="flex gap-6">
               <button onClick={() => setCurrentStep('landing')} className="flex-1 py-8 bg-slate-100 text-slate-500 rounded-[2.5rem] font-black text-xl">CANCEL</button>
               <button disabled={isParsing || !fullScript} onClick={handlePlanStory} className="flex-[2] py-8 bg-indigo-600 text-white rounded-[2.5rem] font-black text-2xl shadow-2xl flex items-center justify-center gap-4 hover:scale-[1.02] transition-all disabled:opacity-50">
                {isParsing ? <Loader2 className="animate-spin" /> : <Sparkles />} GENERATE STORYBOARD
              </button>
            </div>
          </div>
        );

      case 'characters':
        return (
          <div className="max-w-7xl mx-auto py-16 px-8 space-y-16 pb-48">
            <div className="text-center space-y-4"><h2 className="text-5xl font-black">Character Consistency Lab</h2><p className="text-slate-500 text-xl font-medium">Lock visual identity across all modules.</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {settings.characterReferences.map(char => (
                <div key={char.id} className="bg-white p-8 rounded-[4rem] border-2 border-slate-100 shadow-xl space-y-6 group transition-all">
                  <div className="aspect-square bg-slate-50 rounded-[3rem] overflow-hidden relative flex items-center justify-center">
                    {char.images[0] ? <img src={char.images[0]} className="w-full h-full object-cover" /> : <ImageIcon className="w-16 h-16 text-slate-200" />}
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                       <button onClick={() => { setActiveCharId(char.id); charImageInputRef.current?.click(); }} className="p-4 bg-white rounded-2xl text-indigo-600 shadow-2xl"><Upload size={20} /></button>
                       <button onClick={() => setSettings(s => ({...s, characterReferences: s.characterReferences.map(c => c.id === char.id ? {...c, images: []} : c)}))} className="p-4 bg-white rounded-2xl text-red-500 shadow-2xl"><Trash2 size={20} /></button>
                    </div>
                  </div>
                  <div className="text-center space-y-4">
                    <h4 className="text-2xl font-black text-slate-800">{char.name}</h4>
                    <button onClick={() => identifyAndDesignCharacters(char.description || char.name, settings.targetStyle).then(res => {
                      setSettings(s => ({...s, characterReferences: s.characterReferences.map(c => c.id === char.id ? {...c, images: res[0].images} : c)}));
                    })} className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm">AI DESIGN SHEET</button>
                  </div>
                </div>
              ))}
              <button onClick={() => setSettings({...settings, characterReferences: [...settings.characterReferences, { id: Math.random().toString(36).substring(7), name: "New Hero", description: "Describe...", images: [] }]})} className="border-4 border-dashed border-slate-100 rounded-[4rem] p-10 flex flex-col items-center justify-center gap-6 text-slate-300 hover:border-indigo-600 transition-all bg-white/50 group">
                <Plus size={64} /><span className="font-black uppercase tracking-widest">Add Cast</span>
              </button>
            </div>
            <input type="file" ref={charImageInputRef} className="hidden" accept="image/*" onChange={handleCharImageUpload} />
            <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-3xl p-14 z-50 flex justify-center border-t border-slate-100 shadow-2xl">
               <button onClick={() => setCurrentStep('restyle-editor')} className="bg-indigo-600 text-white px-32 py-8 rounded-[3rem] font-black text-3xl shadow-2xl hover:scale-105 transition-all">START PRODUCTION</button>
            </div>
          </div>
        );

      case 'restyle-editor':
        return (
          <div className="max-w-7xl mx-auto py-16 px-8 space-y-12 pb-64">
            <div className="flex flex-col lg:flex-row gap-12 items-start">
              <div className="flex-1 space-y-8 sticky top-36">
                <div className="bg-white border-2 border-slate-100 rounded-[4.5rem] p-12 shadow-2xl space-y-10">
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Style Bible (Global Style Lock)</h3>
                    <textarea className="w-full h-40 bg-slate-50 border-none rounded-3xl p-8 text-sm font-medium outline-none resize-none shadow-inner leading-relaxed" value={settings.masterBible} onChange={e => setSettings({...settings, masterBible: e.target.value})} />
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Global Character Continuity</h3>
                    <textarea className="w-full h-32 bg-slate-50 border-none rounded-3xl p-8 text-sm font-medium outline-none resize-none shadow-inner" value={globalFixPrompt} onChange={e => setGlobalFixPrompt(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {(['1K', '2K', '4K'] as const).map(res => (
                      <button key={res} onClick={() => setTargetResolution(res)} className={`py-6 rounded-3xl border-2 font-black text-xl transition-all ${targetResolution === res ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-lg' : 'border-slate-50 opacity-50'}`}>{res}</button>
                    ))}
                  </div>
                  <button disabled={isProcessing} onClick={processProductionBatch} className="w-full py-9 bg-indigo-600 text-white rounded-[3rem] font-black text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-6">
                    {isProcessing ? <Loader2 className="animate-spin" /> : <Sparkles size={32} />} START PRODUCTION
                  </button>
                </div>
              </div>

              <div className="w-full lg:w-2/5 grid grid-cols-1 gap-8">
                {pages.map((p, idx) => (
                  <div key={p.id} className="bg-white p-8 rounded-[4rem] border-2 border-slate-100 shadow-xl space-y-6 relative overflow-hidden group">
                    <div className="absolute top-8 left-8 z-10 w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-2xl shadow-2xl">#{idx + 1}</div>
                    <div className="aspect-[4/3] bg-slate-100 rounded-[3rem] overflow-hidden shadow-inner border-4 border-white">
                      {(p.processedImage || p.originalImage) && <img src={p.processedImage || p.originalImage} className="w-full h-full object-cover" />}
                    </div>
                    <div className="bg-slate-50 p-6 rounded-3xl space-y-2">
                       <h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 italic leading-relaxed">Script: "{p.originalText || 'Scene...'}"</h5>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'generate':
        return (
          <div className="max-w-7xl mx-auto py-16 px-8 space-y-16 pb-64">
            <div className="text-center space-y-4"><h2 className="text-5xl font-black">Production Dashboard</h2><p className="text-slate-500 text-xl font-medium tracking-tight">Refining series frames at {targetResolution}.</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {pages.map((p, idx) => (
                <div key={p.id} className="bg-white rounded-[5rem] border-4 border-slate-50 shadow-2xl overflow-hidden group transition-all">
                  <div className="aspect-[4/3] bg-slate-100 relative group overflow-hidden">
                     {(p.processedImage || p.originalImage) && <img src={p.processedImage || p.originalImage} className={`w-full h-full object-cover transition-all duration-1000 ${p.status === 'processing' ? 'opacity-30 blur-2xl scale-110' : 'opacity-100'}`} />}
                     {p.status === 'processing' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-600/10"><Loader2 size={64} className="animate-spin text-indigo-600" /></div>}
                     <div className="absolute top-10 left-10 z-10 w-16 h-16 bg-slate-900 text-white rounded-3xl flex items-center justify-center font-black text-3xl shadow-2xl">#{idx + 1}</div>
                     <div className="absolute top-10 right-10 z-10 bg-emerald-500 text-white px-6 py-2 rounded-full font-black text-xs shadow-2xl">{targetResolution}</div>
                  </div>
                  <div className="p-12 space-y-8">
                    <div className="space-y-3">
                       <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 flex items-center gap-2"><PenTool size={14} /> Narrative Context</h4>
                       <p className="text-sm text-slate-500 font-bold leading-relaxed italic bg-slate-50 p-6 rounded-3xl">"{p.originalText || 'General Scene'}"</p>
                    </div>
                    
                    <div className="flex items-center justify-between gap-4 border-t border-slate-50 pt-8">
                       <button onClick={() => { setActiveRefineId(p.id); setRefinePrompt(""); setIsOutpainting(false); }} className="flex-1 py-5 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-3 hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                          <Edit3 size={18} /> DETAIL FIX
                       </button>
                       <button onClick={() => { setActiveRefineId(p.id); setIsOutpainting(true); setRefinePrompt("Outpaint to wide spread"); }} className="flex-1 py-5 bg-emerald-50 text-emerald-600 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-3 hover:bg-emerald-600 hover:text-white transition-all shadow-sm">
                          <Maximize size={18} /> {p.isSpread ? 'MAKE SINGLE' : 'OUTPAINT SPREAD'}
                       </button>
                       <button onClick={() => renderScene(p.id)} className="p-5 bg-slate-100 text-slate-400 rounded-2xl hover:text-indigo-600 transition-all"><RefreshCw size={24} /></button>
                    </div>

                    {activeRefineId === p.id && (
                      <div className="bg-slate-900 p-8 rounded-[3rem] space-y-6 animate-in slide-in-from-top duration-300 shadow-2xl">
                        <div className="flex justify-between items-center text-white">
                           <h4 className="text-xs font-black uppercase tracking-widest">{isOutpainting ? 'Format Transformation' : 'Narrative Detail Fix'}</h4>
                           <button onClick={() => setActiveRefineId(null)} className="text-white/40 hover:text-white"><X size={20} /></button>
                        </div>
                        {!isOutpainting && (
                          <textarea className="w-full h-32 bg-white/10 border-none rounded-3xl p-6 text-sm font-bold text-white outline-none shadow-inner leading-relaxed" placeholder="E.g., 'Make his hat blue', 'Change the background to a forest'..." value={refinePrompt} onChange={e => setRefinePrompt(e.target.value)} />
                        )}
                        <button onClick={() => handleApplyNarrativeFix(p.id, isOutpainting)} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all">
                           {isOutpainting ? 'START OUTPAINTING' : 'APPLY NARRATIVE FIX'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="fixed bottom-0 inset-x-0 bg-slate-900 text-white p-14 z-50 rounded-t-[7rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-12">
               <div className="flex items-center gap-8">
                  <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center text-indigo-400 font-black text-4xl border border-white/5">{stats.progress}%</div>
                  <div><h3 className="text-4xl font-black uppercase tracking-tighter">Production Completion</h3><p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Finalizing Series Assets</p></div>
               </div>
               <button onClick={() => setCurrentStep('production-layout')} className="bg-indigo-600 px-24 py-10 rounded-[4rem] font-black text-4xl shadow-2xl hover:scale-105 transition-all flex items-center gap-8 active:scale-95">PREPARE INTERIOR <Download size={48} /></button>
            </div>
          </div>
        );

      case 'production-layout':
        return (
          <div className="max-w-7xl mx-auto py-20 px-8 space-y-16 animate-in fade-in duration-500 pb-56">
            <div className="flex flex-col lg:flex-row gap-16 items-start">
              <div className="flex-1 space-y-10 sticky top-36">
                <div className="space-y-4"><h2 className="text-6xl font-black">Interior Master</h2><p className="text-slate-500 text-xl font-medium">Standardized layout for KDP and Lulu.</p></div>
                <div className="bg-white border-2 border-slate-100 rounded-[4.5rem] p-12 shadow-2xl space-y-10">
                  <div className="grid grid-cols-2 gap-4">
                      {(Object.keys(PRINT_FORMATS) as (keyof typeof PRINT_FORMATS)[]).map((key) => (
                        <button key={key} onClick={() => setSettings({...settings, exportFormat: key})} className={`p-8 rounded-[2.5rem] border-2 text-left transition-all ${settings.exportFormat === key ? 'border-indigo-600 bg-indigo-50 shadow-xl' : 'border-slate-50 opacity-40'}`}>
                          <div className="font-black text-xl text-slate-800">{PRINT_FORMATS[key].name}</div>
                        </button>
                      ))}
                  </div>
                  <button onClick={() => generateBookPDF(pages, settings.exportFormat, projectName, false, settings.estimatedPageCount, settings.spreadExportMode)} className="w-full py-10 bg-emerald-600 text-white rounded-[3rem] font-black text-3xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-6"><Download size={40} /> DOWNLOAD PRODUCTION PDF</button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'upload':
        return (
          <div className="max-w-4xl mx-auto py-20 px-8 space-y-12 text-center">
             <h2 className="text-6xl font-black text-slate-900">Load Existing Assets</h2>
             <div onClick={() => restyleInputRef.current?.click()} className="aspect-video bg-white border-4 border-dashed border-slate-200 rounded-[5rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-600 transition-all group shadow-inner">
                <Upload size={80} className="text-slate-200 group-hover:text-indigo-600 mb-8" />
                <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-xl group-hover:text-indigo-600 transition-colors">Select Illustration Files</p>
                <input type="file" multiple hidden ref={restyleInputRef} accept="image/*" onChange={handleRestyleUpload} />
             </div>
             <button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold hover:text-slate-600 underline">Cancel</button>
          </div>
        );

      case 'direct-upscale':
        return (
          <div className="max-w-4xl mx-auto py-20 px-8 space-y-12 text-center">
             <h2 className="text-6xl font-black text-slate-900">4K Master Enhancement</h2>
             <div onClick={() => restyleInputRef.current?.click()} className="aspect-video bg-white border-4 border-dashed border-slate-200 rounded-[5rem] flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 transition-all group shadow-inner">
                <Upload size={80} className="text-slate-200 group-hover:text-emerald-500 mb-8 transition-colors" />
                <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-xl group-hover:text-emerald-500 transition-colors">Select Frames for 4K Mastering</p>
                <input type="file" multiple hidden ref={restyleInputRef} accept="image/*" onChange={handleRestyleUpload} />
             </div>
             <button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold hover:text-slate-600 underline">Back to Modules</button>
          </div>
        );

      default: return <div></div>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="h-32 bg-white/80 backdrop-blur-3xl border-b border-slate-100 sticky top-0 z-[60] px-16 flex items-center justify-between shadow-sm">
        <div onClick={() => setCurrentStep('landing')} className="flex items-center gap-6 cursor-pointer group">
          <div className="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-2xl group-hover:rotate-6 transition-all"><Sparkles size={32} /></div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-900">StoryFlow <span className="text-indigo-600">Pro</span></h1>
        </div>
        <div className="flex items-center gap-8">
           <div className="bg-slate-50 border border-slate-100 rounded-2xl px-10 py-4 flex items-center gap-10 shadow-inner">
              <input className="bg-transparent border-none outline-none font-black text-slate-800 text-xl w-72" value={projectName} onChange={e => setProjectName(e.target.value)} />
              <button onClick={handleSaveProject} className="text-indigo-600 p-3 bg-white rounded-xl shadow-xl hover:scale-110 transition-transform"><Save size={24} /></button>
           </div>
           <button onClick={() => setCurrentStep('characters')} className="px-8 py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-3 border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all"><UserCheck size={18} /> CAST</button>
           <button onClick={() => setShowBibleEditor(!showBibleEditor)} className="p-4 bg-slate-900 text-white rounded-2xl shadow-xl hover:scale-110 transition-all"><Book size={24} /></button>
        </div>
      </header>
      
      {showBibleEditor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-12">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setShowBibleEditor(false)} />
           <div className="bg-white w-full max-w-2xl rounded-[4rem] p-16 shadow-2xl relative z-10 space-y-10 animate-in zoom-in duration-300">
              <div className="flex justify-between items-center">
                 <h3 className="text-4xl font-black tracking-tighter">Global Style Bible</h3>
                 <button onClick={() => setShowBibleEditor(false)} className="text-slate-300 hover:text-slate-900"><X size={32} /></button>
              </div>
              <textarea className="w-full h-96 bg-slate-50 border-none rounded-3xl p-10 text-sm font-medium outline-none resize-none shadow-inner leading-relaxed" value={settings.masterBible} onChange={e => setSettings({...settings, masterBible: e.target.value})} />
              <button onClick={() => setShowBibleEditor(false)} className="w-full py-8 bg-indigo-600 text-white rounded-[2rem] font-black text-2xl shadow-2xl hover:bg-indigo-500 transition-all">LOCK BIBLE & CLOSE</button>
           </div>
        </div>
      )}

      <main className="flex-1 w-full">{renderStep()}</main>
    </div>
  );
};

export default App;
