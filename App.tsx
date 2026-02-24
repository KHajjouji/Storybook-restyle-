
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, Sparkles, BookOpen, Download, Trash2, Save,
  Loader2, AlertCircle, CheckCircle2, ChevronRight, 
  ChevronLeft, Plus, MapPin, Layers, Palette, Columns, Wand2, Edit3, RefreshCw, X, Rocket, Clock, Cloud, FolderOpen, MoreVertical, Maximize2, Zap, FileText, ClipboardList, UserCheck, Layout, Info, Image as ImageIcon, Heart, LogIn, LogOut, User, Lock, Mail, DatabaseZap, Database, Globe, ArrowRight, ShieldCheck, Link2, Settings2, KeyRound, FileUp, FileDown, Monitor, MessageSquareCode, Scissors, ToggleLeft as Toggle, Settings, Check, Frame, BookMarked, Megaphone, QrCode, FileCheck, Ruler, Book, PenTool, Eraser, Maximize, Eye, Grid
} from 'lucide-react';
import { BookPage, AppSettings, PRINT_FORMATS, CharacterRef, CharacterAssignment, AppMode, Project, SeriesPreset, ExportFormat, Hotspot, CharacterRetargeting } from './types';
import { restyleIllustration, translateText, extractTextFromImage, analyzeStyleFromImage, identifyAndDesignCharacters, planStoryScenes, upscaleIllustration, parsePromptPack, refineIllustration, generateBookCover, parseActivityPack, retargetCharacters } from './geminiService';
import { generateBookPDF } from './utils/pdfGenerator';
import { persistenceService } from './persistenceService';
import { SERIES_PRESETS, GLOBAL_STYLE_LOCK } from './seriesData';

type Step = 'landing' | 'upload' | 'restyle-editor' | 'script' | 'prompt-pack' | 'characters' | 'generate' | 'direct-upscale' | 'cover-master' | 'production-layout' | 'activity-builder' | 'retarget-editor';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>('landing');
  const [projectId, setProjectId] = useState<string>(Math.random().toString(36).substring(7));
  const [projectName, setProjectName] = useState<string>("Untitled Project");
  const [pages, setPages] = useState<BookPage[]>([]);
  const [fullScript, setFullScript] = useState("");
  const [activityScript, setActivityScript] = useState("");
  const [projectContext, setProjectContext] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  
  // Production Config
  const [globalFixPrompt, setGlobalFixPrompt] = useState("Keep character facial features and clothing consistent with reference images.");
  const [targetAspectRatio, setTargetAspectRatio] = useState<'1:1' | '4:3' | '16:9' | '9:16'>('4:3');
  const [targetResolution, setTargetResolution] = useState<'1K' | '2K' | '4K'>('1K');
  const [showBibleEditor, setShowBibleEditor] = useState(false);
  
  // The Advanced Fixer State
  const [activeFixId, setActiveFixId] = useState<string | null>(null);
  const [fixInstruction, setFixInstruction] = useState("");
  const [selectedRefIds, setSelectedRefIds] = useState<Set<string>>(new Set());
  const [isTransformingRatio, setIsTransformingRatio] = useState(false);

  // Character Retargeting State
  const [activeRetargetId, setActiveRetargetId] = useState<string | null>(null);
  const [retargetSourceImage, setRetargetSourceImage] = useState<string | null>(null);
  const [retargetInstruction, setRetargetInstruction] = useState("");
  const [activeHotspotLabel, setActiveHotspotLabel] = useState(1);
  const retargetSourceInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<AppSettings>({
    mode: 'restyle',
    targetStyle: 'soft vibrant children’s storybook illustration, painterly, rounded shapes, big expressive eyes, gentle glow lighting, warm pastel palette, minimal outlines',
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

  // Persistence
  const handleSaveProject = async () => {
    const project: Project = { id: projectId, name: projectName, lastModified: Date.now(), settings, pages, thumbnail: pages.find(p => p.processedImage)?.processedImage || pages[0]?.originalImage };
    try { await persistenceService.saveProject(project); } catch (e) { console.error(e); }
  };

  const handleExportProjectFile = () => {
    const project: Project = { id: projectId, name: projectName, lastModified: Date.now(), settings, pages };
    const blob = new window.Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}.storyflow`;
    a.click();
  };

  // Logic Handlers
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

  const handlePlanActivities = async () => {
    if (!activityScript) return;
    setIsParsing(true);
    try {
      const result = await parseActivityPack(activityScript);
      setSettings(prev => ({ ...prev, masterBible: `${result.globalInstructions}\n\n${prev.masterBible}` }));
      setPages(result.spreads.map(s => ({
        id: Math.random().toString(36).substring(7),
        originalText: s.title,
        status: 'idle',
        assignments: [],
        isSpread: true,
        overrideStylePrompt: s.fullPrompt
      })));
      setTargetAspectRatio('16:9'); // Activities are typically spreads
      setCurrentStep('characters');
    } catch (e) { alert("Activity analysis failed."); }
    finally { setIsParsing(false); }
  }

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
          const initializedPages = newPages.map(p => ({
            ...p,
            retargeting: { sourceHotspots: [], targetHotspots: [], instruction: "" }
          }));
          setPages(prev => [...prev, ...initializedPages]);
          setCurrentStep(settings.mode === 'retarget' ? 'generate' : 'restyle-editor');
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

  const renderScene = async (pageId: string) => {
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    setPages(curr => curr.map(p => p.id === pageId ? { ...p, status: 'processing' } : p));
    try {
      const p = pages.find(pg => pg.id === pageId)!;
      const narrativeContext = p.originalText ? `SCENE SCRIPT: "${p.originalText}". ${globalFixPrompt}` : (p.overrideStylePrompt || settings.targetStyle);
      
      let result;
      if (p.originalImage) {
        const others = pages.filter(pg => pg.id !== pageId && pg.processedImage).slice(0, 3).map(pg => ({ base64: pg.processedImage!, index: pages.indexOf(pg) + 1 }));
        result = await refineIllustration(p.originalImage, narrativeContext, others, p.isSpread, targetResolution, settings.masterBible, projectContext, settings.characterReferences, targetAspectRatio);
      } else {
        // For activities, use the specific spread prompt as the primary instruction
        const promptToUse = p.overrideStylePrompt || narrativeContext;
        result = await restyleIllustration(undefined, promptToUse, undefined, undefined, settings.characterReferences, [], true, false, p.isSpread, settings.masterBible, targetResolution, projectContext, targetAspectRatio);
      }
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'completed', processedImage: result } : pg));
    } catch (e) { setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'error' } : pg)); }
  };

  const handleApplyAdvancedFix = async () => {
    if (!activeFixId) return;
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    
    setPages(curr => curr.map(p => p.id === activeFixId ? { ...p, status: 'processing' } : p));
    const targetId = activeFixId;
    setActiveFixId(null);

    try {
      const p = pages.find(pg => pg.id === targetId)!;
      const targetImg = p.processedImage || p.originalImage!;
      
      const selectedRefs = pages.filter(pg => selectedRefIds.has(pg.id) && (pg.processedImage || pg.originalImage))
                                .map(pg => ({ base64: (pg.processedImage || pg.originalImage)!, index: pages.indexOf(pg) + 1 }));

      let finalPrompt = fixInstruction;
      let finalRatio = targetAspectRatio;
      
      if (isTransformingRatio) {
        finalRatio = p.isSpread ? "4:3" : "16:9";
        finalPrompt = `OUTPAINTING TASK: Expand the canvas to ${finalRatio}. Intelligently fill new space to the left and right while keeping the original composition in the center. Request: ${fixInstruction || 'No specific fix, just outpaint.'}`;
      } else {
        finalPrompt = `FIX TASK: ${fixInstruction}. Narrative context: "${p.originalText || 'General Scene'}".`;
      }

      const res = await refineIllustration(targetImg, finalPrompt, selectedRefs, isTransformingRatio ? !p.isSpread : p.isSpread, targetResolution, settings.masterBible, projectContext, settings.characterReferences, finalRatio);
      
      setPages(curr => curr.map(pg => pg.id === targetId ? { 
        ...pg, 
        status: 'completed', 
        processedImage: res,
        isSpread: isTransformingRatio ? !pg.isSpread : pg.isSpread 
      } : pg));
      
      setFixInstruction("");
      setSelectedRefIds(new Set());
      setIsTransformingRatio(false);
    } catch (e) {
      setPages(curr => curr.map(pg => pg.id === targetId ? { ...pg, status: 'error' } : pg));
    }
  };

  const handleRetargetSourceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setRetargetSourceImage(base64);
      if (activeRetargetId) {
        setPages(curr => curr.map(p => p.id === activeRetargetId ? {
          ...p,
          retargeting: { ...p.retargeting!, sourceImage: base64 }
        } : p));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApplyRetargeting = async () => {
    if (!activeRetargetId || !retargetSourceImage) return;
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }

    const targetId = activeRetargetId;
    setIsProcessing(true);
    setPages(curr => curr.map(p => p.id === targetId ? { ...p, status: 'processing' } : p));
    setCurrentStep('generate');
    setActiveRetargetId(null);

    try {
      const p = pages.find(pg => pg.id === targetId)!;
      const targetImg = p.processedImage || p.originalImage!;
      const retargeting = p.retargeting!;

      const res = await retargetCharacters(
        retargetSourceImage,
        targetImg,
        { 
          sourceHotspots: retargeting.sourceHotspots, 
          targetHotspots: retargeting.targetHotspots, 
          instruction: retargetInstruction 
        },
        targetResolution,
        targetAspectRatio
      );

      setPages(curr => curr.map(pg => pg.id === targetId ? { ...pg, status: 'completed', processedImage: res } : pg));
      setRetargetSourceImage(null);
      setRetargetInstruction("");
    } catch (e) {
      console.error("Retargeting error:", e);
      setPages(curr => curr.map(pg => pg.id === targetId ? { ...pg, status: 'error' } : pg));
    } finally {
      setIsProcessing(false);
    }
  };

  const HotspotOverlay: React.FC<{ 
    image: string, 
    hotspots: Hotspot[], 
    onAddHotspot: (x: number, y: number) => void,
    onRemoveHotspot: (label: number) => void,
    labelPrefix?: string
  }> = ({ image, hotspots, onAddHotspot, onRemoveHotspot, labelPrefix = "" }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const handleClick = (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      onAddHotspot(x, y);
    };

    return (
      <div ref={containerRef} className="relative cursor-crosshair group overflow-hidden rounded-[3rem] border-4 border-white shadow-2xl" onClick={handleClick}>
        <img src={image} className="w-full h-full object-cover select-none" />
        {hotspots.map(h => (
          <div 
            key={h.label} 
            className="absolute w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-black text-sm shadow-2xl border-2 border-white transform -translate-x-1/2 -translate-y-1/2 hover:scale-125 transition-transform"
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
            onClick={(e) => { e.stopPropagation(); onRemoveHotspot(h.label); }}
          >
            {labelPrefix}{h.label}
          </div>
        ))}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
          <p className="text-white font-black uppercase tracking-widest text-xs bg-black/40 px-4 py-2 rounded-full">Click to place hotspot</p>
        </div>
      </div>
    );
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
          <div className="max-w-6xl mx-auto py-24 px-8 space-y-24 animate-in fade-in duration-700">
            <div className="text-center space-y-6">
              <h2 className="text-8xl font-black text-slate-900 tracking-tighter">Series <span className="text-indigo-600">Master</span></h2>
              <p className="text-slate-500 text-2xl max-w-2xl mx-auto font-medium">Professional Children's Book Production & Consistency Lab.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              <button onClick={() => { setSettings({...settings, mode: 'create'}); setCurrentStep('script'); }} className="group p-10 bg-white border-2 border-slate-100 rounded-[4rem] text-left hover:border-indigo-600 hover:shadow-2xl transition-all relative overflow-hidden">
                <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center mb-8 text-indigo-600 group-hover:scale-110 transition-transform"><Rocket size={32} /></div>
                <h4 className="text-2xl font-black mb-3 text-slate-900">Script Storyboarder</h4>
                <p className="text-slate-400 font-medium">Auto-generate full series frames from your narrative script.</p>
              </button>
              <button onClick={() => { setSettings({...settings, mode: 'activity-builder'}); setCurrentStep('activity-builder'); }} className="group p-10 bg-white border-2 border-indigo-100 rounded-[4rem] text-left hover:border-indigo-600 hover:shadow-2xl transition-all relative overflow-hidden">
                <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center mb-8 text-indigo-600 group-hover:scale-110 transition-transform"><Grid size={32} /></div>
                <h4 className="text-2xl font-black mb-3 text-slate-900">Activity Designer</h4>
                <p className="text-slate-400 font-medium">Flashcards, spreads, and dictionaries with strict logic and layout.</p>
              </button>
              <button onClick={() => { setSettings({...settings, mode: 'restyle'}); setCurrentStep('upload'); }} className="group p-10 bg-white border-2 border-slate-100 rounded-[4rem] text-left hover:border-indigo-600 hover:shadow-2xl transition-all relative overflow-hidden">
                <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mb-8 text-slate-400 group-hover:scale-110 transition-transform"><Palette size={32} /></div>
                <h4 className="text-2xl font-black mb-3 text-slate-900">Advanced Fixer</h4>
                <p className="text-slate-400 font-medium">Outpaint, restyle, and fix details while referencing other images.</p>
              </button>
              <button onClick={() => { setSettings({...settings, mode: 'retarget'}); setCurrentStep('upload'); }} className="group p-10 bg-indigo-600 border-2 border-indigo-600 rounded-[4rem] text-left hover:shadow-2xl transition-all relative overflow-hidden">
                <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center mb-8 text-white group-hover:scale-110 transition-transform"><UserCheck size={32} /></div>
                <h4 className="text-2xl font-black mb-3 text-white">Character Identity Lab</h4>
                <p className="text-indigo-100 font-medium mb-6">Map faces and outfits from any reference photo using numerical hotspots.</p>
                <div className="inline-flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest">Start Retargeting <ArrowRight size={16} /></div>
              </button>
              <button onClick={() => { setSettings({...settings, mode: 'upscale'}); setCurrentStep('direct-upscale'); }} className="group p-10 bg-white border-2 border-slate-100 rounded-[4rem] text-left hover:border-emerald-600 hover:shadow-2xl transition-all">
                <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center mb-8 text-emerald-600 group-hover:scale-110 transition-transform"><Maximize2 size={32} /></div>
                <h4 className="text-2xl font-black mb-3 text-slate-900">4K Master</h4>
                <p className="text-slate-400 font-medium">Upscale and enhance your final frames for print quality.</p>
              </button>
              <button onClick={() => setCurrentStep('cover-master')} className="group p-10 bg-white border-2 border-slate-100 rounded-[4rem] text-left hover:border-amber-600 hover:shadow-2xl transition-all">
                <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center mb-8 text-amber-600 group-hover:scale-110 transition-transform"><BookMarked size={32} /></div>
                <h4 className="text-2xl font-black mb-3 text-slate-900">Cover Designer</h4>
                <p className="text-slate-400 font-medium">Synthesize marketing context into a professional cover.</p>
              </button>
              <button onClick={() => setCurrentStep('production-layout')} className="group p-10 bg-white border-2 border-indigo-100 rounded-[4rem] text-left hover:border-indigo-600 hover:shadow-2xl transition-all relative overflow-hidden">
                <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center mb-8 text-indigo-600 group-hover:scale-110 transition-transform"><Ruler size={32} /></div>
                <h4 className="text-2xl font-black mb-3 text-slate-900">Print Layout</h4>
                <p className="text-slate-400 font-medium">Automate Bleed and Gutter for KDP and Lulu publishing.</p>
              </button>
            </div>
          </div>
        );

      case 'activity-builder':
        return (
          <div className="max-w-5xl mx-auto py-20 px-8 space-y-12 animate-in slide-in-from-bottom duration-500">
            <div className="text-center space-y-4">
              <h2 className="text-6xl font-black">Activity Mastermind</h2>
              <p className="text-slate-500 text-xl font-medium">Paste your high-logic Activity spreads here (Flashcards, Grids, Dictionaries).</p>
            </div>
            <textarea 
              className="w-full h-[500px] bg-white border-2 border-slate-100 rounded-[3rem] p-12 text-xl font-medium outline-none shadow-inner leading-relaxed focus:border-indigo-600 transition-colors" 
              placeholder="Paste Master Prompt — Activity Spreads here (e.g., GLOBAL STYLE LOCK... SPREAD 1... SPREAD 2...)" 
              value={activityScript} 
              onChange={e => setActivityScript(e.target.value)} 
            />
            <div className="flex gap-8">
               <button onClick={() => setCurrentStep('landing')} className="flex-1 py-8 bg-slate-100 text-slate-500 rounded-[2.5rem] font-black text-2xl hover:bg-slate-200 transition-all">CANCEL</button>
               <button disabled={isParsing || !activityScript} onClick={handlePlanActivities} className="flex-[2] py-8 bg-indigo-600 text-white rounded-[2.5rem] font-black text-3xl shadow-2xl flex items-center justify-center gap-6 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                {isParsing ? <Loader2 className="animate-spin" size={40} /> : <Wand2 size={40} />} ANALYZE ACTIVITIES
              </button>
            </div>
          </div>
        );

      case 'restyle-editor':
        return (
          <div className="max-w-7xl mx-auto py-16 px-8 space-y-16 pb-64">
            <div className="flex flex-col lg:flex-row gap-16 items-start">
              <div className="flex-1 space-y-10 sticky top-36">
                <div className="bg-white border-2 border-slate-100 rounded-[4rem] p-12 shadow-2xl space-y-10">
                  {/* COMPACT BIBLE */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-4">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Production Bible</h3>
                      <button onClick={() => setShowBibleEditor(true)} className="text-[10px] font-black text-indigo-600 underline">Edit Full Bible</button>
                    </div>
                    <textarea 
                      readOnly
                      className="w-full h-20 bg-slate-50 border-none rounded-[2rem] p-6 text-[10px] font-bold outline-none resize-none shadow-inner leading-relaxed opacity-60 cursor-not-allowed" 
                      value={settings.masterBible} 
                    />
                  </div>

                  {/* MASTER PROMPT FIELD */}
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 px-4">Target Style / Scene Prompt</h3>
                    <textarea 
                      className="w-full h-40 bg-white border-2 border-indigo-100 rounded-[2.5rem] p-8 text-sm font-bold outline-none shadow-sm focus:border-indigo-600 transition-all leading-relaxed"
                      value={settings.targetStyle}
                      onChange={e => setSettings({...settings, targetStyle: e.target.value})}
                      placeholder="Describe the target style precisely (e.g., 'vintage watercolor, heavy paper texture')..."
                    />
                  </div>

                  {/* FORMAT CONTROL */}
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 px-4">Aspect Ratio</h3>
                    <div className="grid grid-cols-4 gap-2 px-2">
                      {(['1:1', '4:3', '16:9', '9:16'] as const).map(ratio => (
                        <button 
                          key={ratio} 
                          onClick={() => setTargetAspectRatio(ratio)}
                          className={`py-4 rounded-xl border-2 font-black text-[10px] transition-all flex flex-col items-center gap-1 ${targetAspectRatio === ratio ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-md' : 'border-slate-50 opacity-40 hover:opacity-100'}`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* RESOLUTION CONTROL */}
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 px-4">Resolution</h3>
                    <div className="grid grid-cols-3 gap-3">
                      {(['1K', '2K', '4K'] as const).map(res => (
                        <button key={res} onClick={() => setTargetResolution(res)} className={`py-4 rounded-[1.5rem] border-2 font-black text-lg transition-all ${targetResolution === res ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-lg' : 'border-slate-50 opacity-50'}`}>{res}</button>
                      ))}
                    </div>
                  </div>

                  <button disabled={isProcessing} onClick={processProductionBatch} className="w-full py-8 bg-indigo-600 text-white rounded-[3rem] font-black text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-6">
                    {isProcessing ? <Loader2 className="animate-spin" size={32} /> : <Sparkles size={32} />} START PRODUCTION
                  </button>
                </div>
              </div>

              <div className="w-full lg:w-2/5 grid grid-cols-1 gap-12">
                {pages.map((p, idx) => (
                  <div key={p.id} className="bg-white p-8 rounded-[4rem] border-2 border-slate-100 shadow-xl space-y-6 relative overflow-hidden group">
                    <div className="absolute top-8 left-8 z-10 w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-2xl shadow-2xl">#{idx + 1}</div>
                    <div className="aspect-[4/3] bg-slate-100 rounded-[3rem] overflow-hidden shadow-inner border-8 border-white">
                      {(p.processedImage || p.originalImage) && <img src={p.processedImage || p.originalImage} className="w-full h-full object-cover" />}
                    </div>
                    {p.originalText && <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-4 italic leading-relaxed">"{p.originalText}"</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'script':
        return (
          <div className="max-w-4xl mx-auto py-20 px-8 space-y-12 animate-in slide-in-from-bottom duration-500">
            <div className="text-center space-y-4"><h2 className="text-6xl font-black">Narrative Analysis</h2><p className="text-slate-500 text-xl font-medium">Parse your script into production scenes.</p></div>
            <textarea className="w-full h-[500px] bg-white border-2 border-slate-100 rounded-[3rem] p-16 text-2xl font-medium outline-none shadow-inner leading-relaxed" placeholder="Paste full script here..." value={fullScript} onChange={e => setFullScript(e.target.value)} />
            <div className="flex gap-8">
               <button onClick={() => setCurrentStep('landing')} className="flex-1 py-8 bg-slate-100 text-slate-500 rounded-[2.5rem] font-black text-2xl">CANCEL</button>
               <button disabled={isParsing || !fullScript} onClick={handlePlanStory} className="flex-[2] py-8 bg-indigo-600 text-white rounded-[2.5rem] font-black text-3xl shadow-2xl flex items-center justify-center gap-6 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                {isParsing ? <Loader2 className="animate-spin" size={40} /> : <Sparkles size={40} />} GENERATE STORYBOARD
              </button>
            </div>
          </div>
        );

      case 'characters':
        return (
          <div className="max-w-7xl mx-auto py-20 px-8 space-y-20 pb-56">
            <div className="text-center space-y-4"><h2 className="text-6xl font-black">Consistency Lab</h2><p className="text-slate-500 text-xl font-medium">Define your cast to lock identities across the series.</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
              {settings.characterReferences.map(char => (
                <div key={char.id} className="bg-white p-10 rounded-[4.5rem] border-2 border-slate-100 shadow-xl space-y-8 group transition-all">
                  <div className="aspect-square bg-slate-50 rounded-[3rem] overflow-hidden relative flex items-center justify-center group">
                    {char.images[0] ? <img src={char.images[0]} className="w-full h-full object-cover" /> : <ImageIcon className="w-20 h-20 text-slate-200" />}
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                       <button onClick={() => { setActiveCharId(char.id); charImageInputRef.current?.click(); }} className="p-5 bg-white rounded-2xl text-indigo-600 shadow-2xl"><Upload size={24} /></button>
                       <button onClick={() => setSettings(s => ({...s, characterReferences: s.characterReferences.map(c => c.id === char.id ? {...c, images: []} : c)}))} className="p-5 bg-white rounded-2xl text-red-500 shadow-2xl"><Trash2 size={24} /></button>
                    </div>
                  </div>
                  <div className="text-center space-y-6">
                    <h4 className="text-3xl font-black text-slate-800">{char.name}</h4>
                    <button onClick={() => identifyAndDesignCharacters(char.description || char.name, settings.targetStyle).then(res => {
                      setSettings(s => ({...s, characterReferences: s.characterReferences.map(c => c.id === char.id ? {...c, images: res[0].images} : c)}));
                    })} className="w-full py-5 bg-indigo-50 text-indigo-600 rounded-[2rem] font-black text-sm uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm">AI DESIGN SHEET</button>
                  </div>
                </div>
              ))}
              <button onClick={() => setSettings({...settings, characterReferences: [...settings.characterReferences, { id: Math.random().toString(36).substring(7), name: "New Hero", description: "Physique...", images: [] }]})} className="border-4 border-dashed border-slate-100 rounded-[4.5rem] p-12 flex flex-col items-center justify-center gap-8 text-slate-300 hover:border-indigo-600 transition-all bg-white/50 group">
                <Plus size={80} className="group-hover:rotate-90 transition-transform" />
                <span className="font-black uppercase tracking-widest text-xl">Add Hero</span>
              </button>
            </div>
            <input type="file" ref={charImageInputRef} className="hidden" accept="image/*" onChange={handleCharImageUpload} />
            <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-3xl p-16 z-50 flex justify-center border-t border-slate-100 shadow-2xl">
               <button onClick={() => setCurrentStep(settings.mode === 'activity-builder' ? 'generate' : 'restyle-editor')} className="bg-indigo-600 text-white px-40 py-10 rounded-[3.5rem] font-black text-4xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-8">CONFIRM CAST <ChevronRight size={48} /></button>
            </div>
          </div>
        );

      case 'generate':
        return (
          <div className="max-w-7xl mx-auto py-16 px-8 space-y-20 pb-64">
            <div className="text-center space-y-4">
              <h2 className="text-6xl font-black">Production Dashboard</h2>
              <div className="flex items-center justify-center gap-4">
                <p className="text-slate-500 text-2xl font-medium">Refining {settings.mode === 'activity-builder' ? 'Activity Spreads' : 'Series Frames'} at {targetResolution}.</p>
                {settings.mode === 'retarget' && (
                  <span className="px-4 py-1 bg-indigo-600 text-white text-xs font-black rounded-full animate-pulse">RETARGETING MODE</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
              {pages.map((p, idx) => (
                <div key={p.id} className="bg-white rounded-[6rem] border-4 border-slate-50 shadow-2xl overflow-hidden group transition-all">
                  <div className="aspect-[16/9] bg-slate-100 relative group overflow-hidden">
                     {(p.processedImage || p.originalImage) && <img src={p.processedImage || p.originalImage} className={`w-full h-full object-cover transition-all duration-1000 ${p.status === 'processing' ? 'opacity-30 blur-2xl scale-110' : 'opacity-100'}`} />}
                     {p.status === 'processing' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-600/10"><Loader2 size={80} className="animate-spin text-indigo-600" /></div>}
                     <div className="absolute top-12 left-12 z-10 w-20 h-20 bg-slate-900 text-white rounded-[2rem] flex items-center justify-center font-black text-4xl shadow-2xl">#{idx + 1}</div>
                     <div className="absolute top-12 right-12 z-10 bg-emerald-500 text-white px-8 py-3 rounded-full font-black text-sm shadow-2xl">{targetResolution} {p.isSpread ? '(SPREAD)' : '(SINGLE)'}</div>
                  </div>
                  <div className="p-16 space-y-10">
                    <div className="space-y-4">
                       <h4 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600 flex items-center gap-3"><PenTool size={20} /> Scene Instructions</h4>
                       <p className="text-lg text-slate-500 font-bold leading-relaxed italic bg-slate-50 p-10 rounded-[2.5rem]">"{p.originalText || 'General Scene'}"</p>
                    </div>
                    
                    <div className="flex items-center justify-between gap-6 pt-10 border-t border-slate-50">
                       {settings.mode === 'retarget' ? (
                         <>
                           <button onClick={() => {
                              setActiveRetargetId(p.id);
                              setPages(curr => curr.map(pg => pg.id === p.id ? { 
                                ...pg, 
                                retargeting: pg.retargeting || { sourceHotspots: [], targetHotspots: [], instruction: "" } 
                              } : pg));
                              setCurrentStep('retarget-editor');
                           }} className="flex-[3] py-7 bg-indigo-600 text-white rounded-[2rem] font-black text-xl uppercase tracking-widest flex items-center justify-center gap-4 hover:scale-105 transition-all shadow-2xl">
                              <UserCheck size={28} /> OPEN RETARGETER
                           </button>
                           <button onClick={() => { setActiveFixId(p.id); setFixInstruction(""); setSelectedRefIds(new Set()); setIsTransformingRatio(false); }} className="flex-1 py-7 bg-slate-100 text-slate-400 rounded-[2rem] font-black text-xs uppercase tracking-widest flex items-center justify-center hover:bg-slate-200 transition-all">
                              FIX
                           </button>
                         </>
                       ) : (
                         <>
                           <button onClick={() => { setActiveFixId(p.id); setFixInstruction(""); setSelectedRefIds(new Set()); setIsTransformingRatio(false); }} className="flex-[2] py-7 bg-indigo-50 text-indigo-600 rounded-[2rem] font-black text-xl uppercase tracking-widest flex items-center justify-center gap-4 hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                              <Edit3 size={28} /> ADVANCED FIX
                           </button>
                           <button onClick={() => {
                              setActiveRetargetId(p.id);
                              setPages(curr => curr.map(pg => pg.id === p.id ? { 
                                ...pg, 
                                retargeting: pg.retargeting || { sourceHotspots: [], targetHotspots: [], instruction: "" } 
                              } : pg));
                              setCurrentStep('retarget-editor');
                           }} className="flex-1 py-7 bg-indigo-50 text-indigo-600 rounded-[2rem] hover:bg-indigo-600 hover:text-white transition-all flex flex-col items-center justify-center gap-1 group">
                              <UserCheck size={28} />
                              <span className="text-[8px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Retarget</span>
                           </button>
                         </>
                       )}
                       <button onClick={() => renderScene(p.id)} className="p-7 bg-slate-100 text-slate-400 rounded-[2rem] hover:text-indigo-600 transition-all"><RefreshCw size={32} /></button>
                       {p.processedImage && <button onClick={() => { const a = document.createElement('a'); a.href = p.processedImage!; a.download = `page_${idx+1}.png`; a.click(); }} className="p-7 bg-emerald-50 text-emerald-600 rounded-[2rem]"><Download size={32} /></button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Advanced Fixer Modal */}
            {activeFixId && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-12 overflow-y-auto">
                 <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={() => setActiveFixId(null)} />
                 <div className="bg-white w-full max-w-6xl rounded-[5rem] p-20 shadow-2xl relative z-10 space-y-12 animate-in zoom-in duration-300">
                    <div className="flex justify-between items-center">
                       <div>
                          <h3 className="text-5xl font-black tracking-tighter">Advanced Scene Fixer</h3>
                          <p className="text-slate-400 font-bold text-lg mt-2 uppercase tracking-widest">Inject style, clothing, or layout from other frames.</p>
                       </div>
                       <button onClick={() => setActiveFixId(null)} className="p-4 bg-slate-100 rounded-full hover:bg-slate-200"><X size={32} /></button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                       <div className="space-y-10">
                          <div className="space-y-4">
                             <h4 className="text-xs font-black uppercase text-indigo-600 tracking-widest">1. Technical Instruction</h4>
                             <textarea className="w-full h-48 bg-slate-50 border-none rounded-[2.5rem] p-10 text-xl font-bold outline-none shadow-inner leading-relaxed" placeholder="E.g., 'Change her hair to red', 'Use the clothing from Frame 2'..." value={fixInstruction} onChange={e => setFixInstruction(e.target.value)} />
                          </div>

                          <div className="space-y-6">
                             <h4 className="text-xs font-black uppercase text-indigo-600 tracking-widest">2. Canvas Transformation</h4>
                             <button onClick={() => setIsTransformingRatio(!isTransformingRatio)} className={`w-full py-8 rounded-[2rem] font-black text-2xl flex items-center justify-center gap-6 transition-all ${isTransformingRatio ? 'bg-indigo-600 text-white shadow-2xl' : 'bg-slate-100 text-slate-400'}`}>
                                <Maximize size={32} /> {isTransformingRatio ? 'MODE: OUTPAINT TO SPREAD' : 'MODE: TARGETED DETAIL FIX'}
                             </button>
                             <p className="text-sm text-slate-400 font-medium px-4 text-center italic">Transform will expand the canvas ratio intelligently while keeping the core characters consistent.</p>
                          </div>

                          <button onClick={handleApplyAdvancedFix} className="w-full py-10 bg-indigo-600 text-white rounded-[3rem] font-black text-3xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-6">
                             <Sparkles size={40} /> APPLY ADVANCED FIX
                          </button>
                       </div>

                       <div className="space-y-8">
                          <h4 className="text-xs font-black uppercase text-indigo-600 tracking-widest">3. Reference Picker (Optional)</h4>
                          <div className="grid grid-cols-2 gap-6 h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                             {pages.map((p, i) => (
                               <div key={p.id} onClick={() => setSelectedRefIds(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} className={`aspect-square rounded-[2rem] border-4 overflow-hidden relative cursor-pointer transition-all ${selectedRefIds.has(p.id) ? 'border-indigo-600 scale-95 shadow-2xl' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                                  <div className="absolute top-4 left-4 z-10 w-10 h-10 bg-black/60 text-white rounded-xl flex items-center justify-center font-black text-lg">#{i+1}</div>
                                  <img src={p.processedImage || p.originalImage} className="w-full h-full object-cover" />
                                  {selectedRefIds.has(p.id) && <div className="absolute inset-0 bg-indigo-600/30 flex items-center justify-center text-white"><CheckCircle2 size={48} /></div>}
                               </div>
                             ))}
                          </div>
                          <p className="text-sm text-slate-400 font-bold uppercase text-center tracking-widest">Select frames to inject visual likeness/clothing.</p>
                       </div>
                    </div>
                 </div>
              </div>
            )}

            <div className="fixed bottom-0 inset-x-0 bg-slate-900 text-white p-16 z-50 rounded-t-[8rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-12">
               <div className="flex items-center gap-10">
                  <div className="w-28 h-28 bg-white/10 rounded-full flex items-center justify-center text-indigo-400 font-black text-5xl border border-white/5">{stats.progress}%</div>
                  <div><h3 className="text-5xl font-black uppercase tracking-tighter">Production Stage</h3><p className="text-slate-400 font-bold uppercase tracking-widest text-lg">Finalizing Master Series Assets</p></div>
               </div>
               <button onClick={() => setCurrentStep('production-layout')} className="bg-indigo-600 px-32 py-12 rounded-[4rem] font-black text-4xl shadow-2xl hover:scale-105 transition-all flex items-center gap-10 active:scale-95">PREPARE FOR PRINT <Download size={56} /></button>
            </div>
          </div>
        );

      case 'production-layout':
        return (
          <div className="max-w-7xl mx-auto py-24 px-8 space-y-20 animate-in fade-in duration-500 pb-56">
            <div className="flex flex-col lg:flex-row gap-20 items-start">
              <div className="flex-1 space-y-12 sticky top-36">
                <div className="space-y-4"><h2 className="text-7xl font-black">Interior Master</h2><p className="text-slate-500 text-2xl font-medium">Standardized layout for professional KDP and Lulu publishing.</p></div>
                <div className="bg-white border-2 border-slate-100 rounded-[5rem] p-16 shadow-2xl space-y-12">
                  <div className="grid grid-cols-2 gap-6">
                      {(Object.keys(PRINT_FORMATS) as (keyof typeof PRINT_FORMATS)[]).map((key) => (
                        <button key={key} onClick={() => setSettings({...settings, exportFormat: key})} className={`p-10 rounded-[3rem] border-2 text-left transition-all ${settings.exportFormat === key ? 'border-indigo-600 bg-indigo-50 shadow-2xl' : 'border-slate-50 opacity-40 hover:opacity-100'}`}>
                          <div className="font-black text-2xl text-slate-800">{PRINT_FORMATS[key].name}</div>
                          <div className="text-xs text-slate-400 font-bold uppercase mt-2 tracking-widest">Industry Default</div>
                        </button>
                      ))}
                  </div>
                  <button onClick={() => generateBookPDF(pages, settings.exportFormat, projectName, false, settings.estimatedPageCount, settings.spreadExportMode)} className="w-full py-12 bg-emerald-600 text-white rounded-[4rem] font-black text-4xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-8"><Download size={48} /> DOWNLOAD INTERIOR PDF</button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'cover-master':
        return (
          <div className="max-w-7xl mx-auto py-20 px-8 space-y-16 animate-in fade-in duration-500">
            <div className="flex flex-col lg:flex-row gap-16 items-start">
               <div className="flex-1 space-y-8">
                  <h2 className="text-6xl font-black">Cover Synthesis</h2>
                  <div className="bg-white border-2 border-slate-100 rounded-[4rem] p-12 shadow-2xl space-y-8">
                     <textarea className="w-full h-80 bg-slate-50 border-none rounded-3xl p-8 text-lg font-medium outline-none resize-none shadow-inner" placeholder="Paste marketing brief..." value={projectContext} onChange={e => setProjectContext(e.target.value)} />
                     <button onClick={() => { setIsProcessing(true); generateBookCover(projectContext, settings.characterReferences, settings.targetStyle).then(res => setCoverImage(res)).finally(() => setIsProcessing(false)); }} className="w-full py-8 bg-indigo-600 text-white rounded-[2.5rem] font-black text-2xl shadow-xl flex items-center justify-center gap-4 hover:scale-105 transition-all">
                        {isProcessing ? <Loader2 className="animate-spin" /> : <Sparkles />} RENDER PRODUCTION COVER
                     </button>
                  </div>
               </div>
               <div className="w-full lg:w-2/5 aspect-[3/4] bg-white rounded-[4.5rem] shadow-2xl overflow-hidden border-8 border-white relative flex items-center justify-center">
                  {coverImage ? <img src={coverImage} className="w-full h-full object-cover" /> : <div className="text-slate-200"><Book size={160} /></div>}
               </div>
            </div>
          </div>
        );

      case 'direct-upscale':
        return (
          <div className="max-w-4xl mx-auto py-20 px-8 space-y-12 text-center">
             <h2 className="text-6xl font-black">4K Master Enhancement</h2>
             <div onClick={() => restyleInputRef.current?.click()} className="aspect-video bg-white border-4 border-dashed border-slate-200 rounded-[5rem] flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 transition-all group shadow-inner">
                <Upload size={80} className="text-slate-200 group-hover:text-emerald-500 mb-8" />
                <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-xl group-hover:text-emerald-500">Select Frames to Master</p>
                <input type="file" multiple hidden ref={restyleInputRef} accept="image/*" onChange={handleRestyleUpload} />
             </div>
             <button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold hover:text-slate-600 underline">Back to Main Suit</button>
          </div>
        );

      case 'retarget-editor':
        const retargetPage = pages.find(p => p.id === activeRetargetId);
        if (!retargetPage) return null;
        
        const setRetargetData = (data: Partial<CharacterRetargeting>) => {
          setPages(curr => curr.map(p => p.id === activeRetargetId ? {
            ...p,
            retargeting: { ...p.retargeting!, ...data }
          } : p));
        };

        const updateHotspot = (type: 'source' | 'target', x: number, y: number) => {
          const key = type === 'source' ? 'sourceHotspots' : 'targetHotspots';
          const existing = retargetPage.retargeting![key];
          const filtered = existing.filter(h => h.label !== activeHotspotLabel);
          setRetargetData({ [key]: [...filtered, { x, y, label: activeHotspotLabel }] });
        };

        return (
          <div className="max-w-7xl mx-auto py-16 px-8 space-y-12 animate-in fade-in duration-500 pb-64">
            <div className="flex justify-between items-end">
              <div className="space-y-4">
                <h2 className="text-6xl font-black tracking-tighter">Character Retargeting</h2>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3 bg-white border-2 border-slate-100 rounded-2xl p-2 shadow-sm">
                    <span className="text-[10px] font-black uppercase text-slate-400 px-3">Active Character:</span>
                    {[1, 2, 3, 4].map(num => (
                      <button 
                        key={num} 
                        onClick={() => setActiveHotspotLabel(num)}
                        className={`w-10 h-10 rounded-xl font-black transition-all ${activeHotspotLabel === num ? 'bg-indigo-600 text-white shadow-lg scale-110' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <p className="text-slate-400 text-sm font-medium italic">Select a number, then click on both images to pair them.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setCurrentStep('generate')} className="px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest">Cancel</button>
                <button 
                  disabled={isProcessing || !retargetSourceImage || (retargetPage.retargeting?.sourceHotspots.length === 0) || (retargetPage.retargeting?.targetHotspots.length === 0)} 
                  onClick={handleApplyRetargeting} 
                  className="px-12 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-3"
                >
                  {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <UserCheck size={20} />}
                  {isProcessing ? 'Processing...' : 'Run Retargeting'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* SOURCE SELECTION */}
              <div className="space-y-6">
                <div className="flex justify-between items-center px-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600">Source (Who is it?)</h3>
                  <button onClick={() => retargetSourceInputRef.current?.click()} className="text-[10px] font-black text-indigo-600 underline">Upload External</button>
                  <input type="file" ref={retargetSourceInputRef} className="hidden" accept="image/*" onChange={handleRetargetSourceUpload} />
                </div>
                
                <div className="space-y-4">
                  {retargetSourceImage ? (
                    <HotspotOverlay 
                      image={retargetSourceImage} 
                      hotspots={retargetPage.retargeting?.sourceHotspots || []} 
                      onAddHotspot={(x, y) => updateHotspot('source', x, y)}
                      onRemoveHotspot={(label) => setRetargetData({ sourceHotspots: retargetPage.retargeting!.sourceHotspots.filter(h => h.label !== label) })}
                      labelPrefix="S"
                    />
                  ) : (
                    <div className="aspect-square bg-slate-100 rounded-[3rem] flex items-center justify-center text-slate-300 font-black italic border-4 border-dashed border-slate-200">Select Reference Below</div>
                  )}
                  
                  <div className="flex gap-4 overflow-x-auto py-4 custom-scrollbar px-2">
                    {pages.map((p, i) => (
                      <button key={p.id} onClick={() => { setRetargetSourceImage(p.processedImage || p.originalImage || null); setRetargetData({ sourceImage: p.processedImage || p.originalImage }); }} className={`flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-4 transition-all ${retargetSourceImage === (p.processedImage || p.originalImage) ? 'border-indigo-600 scale-110 shadow-lg' : 'border-transparent opacity-40 hover:opacity-100'}`}>
                        <img src={p.processedImage || p.originalImage} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* TARGET SELECTION */}
              <div className="space-y-6">
                <div className="flex justify-between items-center px-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600">Target (Where do they go?)</h3>
                  <p className="text-[10px] font-black text-slate-400">Target: Frame #{pages.indexOf(retargetPage) + 1}</p>
                </div>
                
                <div className="space-y-4">
                  <HotspotOverlay 
                    image={retargetPage.processedImage || retargetPage.originalImage!} 
                    hotspots={retargetPage.retargeting?.targetHotspots || []} 
                    onAddHotspot={(x, y) => updateHotspot('target', x, y)}
                    onRemoveHotspot={(label) => setRetargetData({ targetHotspots: retargetPage.retargeting!.targetHotspots.filter(h => h.label !== label) })}
                    labelPrefix="T"
                  />

                  <div className="flex gap-4 overflow-x-auto py-4 custom-scrollbar px-2">
                    {pages.map((p, i) => (
                      <button key={p.id} onClick={() => { setActiveRetargetId(p.id); setRetargetSourceImage(p.retargeting?.sourceImage || null); }} className={`flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-4 transition-all ${activeRetargetId === p.id ? 'border-indigo-600 scale-110 shadow-lg' : 'border-transparent opacity-40 hover:opacity-100'}`}>
                        <img src={p.processedImage || p.originalImage} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border-2 border-slate-100 rounded-[3rem] p-10 shadow-2xl space-y-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600 px-4">Instructions & Context</h3>
              <textarea 
                className="w-full h-24 bg-slate-50 border-none rounded-2xl p-6 text-lg font-medium outline-none resize-none shadow-inner focus:ring-2 ring-indigo-600 transition-all" 
                placeholder="Describe the change (e.g., 'Make Person 1 wear the green jacket from the reference image')..." 
                value={retargetInstruction} 
                onChange={e => setRetargetInstruction(e.target.value)} 
              />
            </div>
          </div>
        );

      case 'upload':
        return (
          <div className="max-w-5xl mx-auto py-24 px-8 space-y-12 text-center">
             <h2 className="text-7xl font-black text-slate-900">Load Production Assets</h2>
             <div onClick={() => restyleInputRef.current?.click()} className="aspect-video bg-white border-4 border-dashed border-slate-200 rounded-[6rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-600 transition-all group shadow-inner">
                <Upload size={100} className="text-slate-200 group-hover:text-indigo-600 mb-10 transition-colors" />
                <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-3xl group-hover:text-indigo-600 transition-colors">Select Illustration Batch</p>
                <input type="file" multiple hidden ref={restyleInputRef} accept="image/*" onChange={handleRestyleUpload} />
             </div>
             <button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold hover:text-slate-600 underline text-xl">Cancel</button>
          </div>
        );

      default: return <div className="p-20 text-center font-black text-4xl">Module Not Found</div>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="h-36 bg-white/80 backdrop-blur-3xl border-b border-slate-100 sticky top-0 z-[60] px-20 flex items-center justify-between shadow-sm">
        <div onClick={() => setCurrentStep('landing')} className="flex items-center gap-8 cursor-pointer group">
          <div className="w-20 h-20 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center text-white shadow-2xl group-hover:rotate-6 transition-all"><Sparkles size={40} /></div>
          <h1 className="text-5xl font-black tracking-tighter text-slate-900">StoryFlow <span className="text-indigo-600">Pro</span></h1>
        </div>
        <div className="flex items-center gap-10">
           <div className="bg-slate-50 border border-slate-100 rounded-[2rem] px-12 py-5 flex items-center gap-12 shadow-inner">
              <input className="bg-transparent border-none outline-none font-black text-slate-800 text-2xl w-96" value={projectName} onChange={e => setProjectName(e.target.value)} />
              <div className="flex gap-4">
                 <button onClick={handleSaveProject} className="text-indigo-600 p-4 bg-white rounded-2xl shadow-xl hover:scale-110 transition-transform"><Save size={28} /></button>
                 <button onClick={handleExportProjectFile} className="text-emerald-600 p-4 bg-white rounded-2xl shadow-xl hover:scale-110 transition-transform"><FileDown size={28} /></button>
              </div>
           </div>
           <button onClick={() => setCurrentStep('characters')} className="px-10 py-5 bg-indigo-50 text-indigo-600 rounded-[2rem] font-black text-sm uppercase tracking-widest flex items-center gap-4 border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"><UserCheck size={24} /> SERIES CAST</button>
           <button onClick={() => setShowBibleEditor(!showBibleEditor)} className="p-5 bg-slate-900 text-white rounded-[2rem] shadow-2xl hover:scale-110 transition-all"><Book size={32} /></button>
        </div>
      </header>
      
      {showBibleEditor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-16">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setShowBibleEditor(false)} />
           <div className="bg-white w-full max-w-3xl rounded-[5rem] p-20 shadow-2xl relative z-10 space-y-12 animate-in zoom-in duration-300">
              <div className="flex justify-between items-center">
                 <h3 className="text-5xl font-black tracking-tighter">Global Production Bible</h3>
                 <button onClick={() => setShowBibleEditor(false)} className="text-slate-300 hover:text-slate-900 transition-colors"><X size={40} /></button>
              </div>
              <textarea className="w-full h-[500px] bg-slate-50 border-none rounded-[3rem] p-12 text-sm font-medium outline-none resize-none shadow-inner leading-relaxed" value={settings.masterBible} onChange={e => setSettings({...settings, masterBible: e.target.value})} />
              <button onClick={() => setShowBibleEditor(false)} className="w-full py-10 bg-indigo-600 text-white rounded-[2.5rem] font-black text-3xl shadow-2xl hover:bg-indigo-500 transition-all">LOCK BIBLE & CLOSE</button>
           </div>
        </div>
      )}

      <main className="flex-1 w-full">{renderStep()}</main>
    </div>
  );
};

export default App;
