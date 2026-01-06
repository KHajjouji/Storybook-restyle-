import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, Sparkles, BookOpen, Download, Trash2, Save,
  Loader2, AlertCircle, CheckCircle2, ChevronRight, 
  ChevronLeft, Plus, MapPin, Layers, Palette, Columns, Wand2, Edit3, RefreshCw, X, Rocket, Clock, Cloud, FolderOpen, MoreVertical, Maximize2, Zap, FileText, ClipboardList
} from 'lucide-react';
import { BookPage, AppSettings, PRINT_FORMATS, CharacterRef, CharacterAssignment, AppMode, Project } from './types';
import { restyleIllustration, translateText, extractTextFromImage, analyzeStyleFromImage, identifyAndDesignCharacters, planStoryScenes, upscaleIllustration, parsePromptPack } from './geminiService';
import { generateBookPDF } from './utils/pdfGenerator';
import { persistenceService } from './persistenceService';

type Step = 'landing' | 'upload' | 'script' | 'prompt-pack' | 'prompt-pack-editor' | 'settings' | 'characters' | 'mapping' | 'generate' | 'direct-upscale';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>('landing');
  const [projectId, setProjectId] = useState<string>(Math.random().toString(36).substring(7));
  const [projectName, setProjectName] = useState<string>("Untitled Masterpiece");
  const [pages, setPages] = useState<BookPage[]>([]);
  const [rawPackText, setRawPackText] = useState("");
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
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);

  const directUpscaleInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const total = pages.length;
    const completed = pages.filter(p => p.status === 'completed').length;
    const processing = pages.filter(p => p.status === 'processing').length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, processing, progress };
  }, [pages]);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const projs = await persistenceService.getAllProjects();
        setSavedProjects(projs);
      } catch (e) { console.error(e); }
    };
    fetchProjects();
  }, []);

  const handleSaveProject = async () => {
    setIsSaving(true);
    try {
      const thumbnail = pages.find(p => p.processedImage || p.originalImage)?.processedImage || pages.find(p => p.originalImage)?.originalImage;
      const project: Project = { id: projectId, name: projectName, lastModified: Date.now(), settings, pages, thumbnail };
      await persistenceService.saveProject(project);
      const updatedList = await persistenceService.getAllProjects();
      setSavedProjects(updatedList);
      setLastSaved(Date.now());
    } catch (e) { console.error(e); }
    finally { setIsSaving(false); }
  };

  const handleParsePack = async () => {
    if (!rawPackText) return;
    setIsParsing(true);
    try {
      const result = await parsePromptPack(rawPackText);
      setSettings(prev => ({ ...prev, masterBible: result.masterBible }));
      const newPages: BookPage[] = result.scenes.map(s => ({
        id: Math.random().toString(36).substring(7),
        originalText: "",
        status: 'idle',
        assignments: [],
        isSpread: s.isSpread,
        overrideStylePrompt: s.prompt
      }));
      setPages(newPages);
      setCurrentStep('prompt-pack-editor');
    } catch (e) { console.error(e); }
    finally { setIsParsing(false); }
  };

  const loadProject = (project: Project) => {
    setProjectId(project.id);
    setProjectName(project.name);
    setSettings(project.settings);
    setPages(project.pages);
    if (project.settings.mode === 'upscale') { setCurrentStep('direct-upscale'); return; }
    if (project.settings.mode === 'prompt-pack') { setCurrentStep('prompt-pack-editor'); return; }
    if (project.pages.length > 0) {
      if (project.pages.some(p => p.processedImage)) setCurrentStep('generate');
      else setCurrentStep('mapping');
    } else setCurrentStep('landing');
  };

  // Fix: Implemented handleUpscale to perform 4K enhancement using Gemini 3 Pro
  const handleUpscale = async (pageId: string) => {
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }

    const page = pages.find(p => p.id === pageId);
    if (!page?.originalImage) return;

    setPages(current => current.map(p => p.id === pageId ? { ...p, status: 'processing' } : p));
    
    try {
      const processedImage = await upscaleIllustration(
        page.originalImage,
        settings.targetStyle,
        page.isSpread
      );
      setPages(current => current.map(p => p.id === pageId ? { ...p, status: 'completed', processedImage } : p));
    } catch (e) {
      console.error(e);
      setPages(current => current.map(p => p.id === pageId ? { ...p, status: 'error' } : p));
    }
  };

  const processBulk = async () => {
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    setIsProcessing(true);
    setCurrentStep('generate');
    const pagesToProcess = pages.filter(p => p.status !== 'completed');
    for (const pageToUpdate of pagesToProcess) {
      const pageId = pageToUpdate.id;
      setPages(current => current.map(p => p.id === pageId ? { ...p, status: 'processing' } : p));
      try {
        const p = pages.find(pg => pg.id === pageId)!;
        const processedImage = await restyleIllustration(undefined, p.overrideStylePrompt || settings.targetStyle, undefined, undefined, [], [], true, false, p.isSpread, settings.masterBible);
        setPages(current => current.map(pg => pg.id === pageId ? { ...pg, status: 'completed', processedImage } : pg));
      } catch (e) { setPages(current => current.map(pg => pg.id === pageId ? { ...pg, status: 'error' } : pg)); }
    }
    setIsProcessing(false);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'landing':
        return (
          <div className="max-w-6xl mx-auto space-y-16 py-12 animate-in fade-in duration-700">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-black text-slate-900 tracking-tight">Production Studio</h2>
              <p className="text-slate-500 text-lg">Choose your industrial creative workflow.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <button onClick={() => { setProjectId(Math.random().toString(36).substring(7)); setSettings({...settings, mode: 'prompt-pack'}); setPages([]); setCurrentStep('prompt-pack'); }} className="p-8 bg-indigo-600 text-white rounded-[3.5rem] text-left hover:shadow-2xl transition-all group">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6"><FileText size={24} /></div>
                <h4 className="text-xl font-black mb-2">Production Prompt Pack</h4>
                <p className="text-white/60 text-xs">Execute pre-written scene prompts with a Master Bible.</p>
              </button>
              <button onClick={() => { setProjectId(Math.random().toString(36).substring(7)); setSettings({...settings, mode: 'restyle'}); setCurrentStep('upload'); }} className="p-8 bg-white border-2 border-slate-100 rounded-[3.5rem] text-left hover:border-indigo-600 transition-all">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-400"><Palette size={24} /></div>
                <h4 className="text-xl font-black mb-2">Book Restyler</h4>
                <p className="text-slate-400 text-xs">Upgrade existing illustrations to a new aesthetic.</p>
              </button>
              <button onClick={() => { setProjectId(Math.random().toString(36).substring(7)); setSettings({...settings, mode: 'upscale'}); setPages([]); setCurrentStep('direct-upscale'); }} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 transition-all">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-400"><Maximize2 size={24} /></div>
                <h4 className="text-xl font-black mb-2">Direct 4K Upscale</h4>
                <p className="text-slate-400 text-xs">Fast-track enhancement for master prints.</p>
              </button>
              <button onClick={() => { setProjectId(Math.random().toString(36).substring(7)); setSettings({...settings, mode: 'create'}); setCurrentStep('script'); }} className="p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-left hover:border-indigo-600 transition-all">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-400"><Rocket size={24} /></div>
                <h4 className="text-xl font-black mb-2">Script-to-Book</h4>
                <p className="text-slate-400 text-xs">Full AI planning and generation from raw story text.</p>
              </button>
            </div>
            {savedProjects.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-2xl font-black">Resume Production</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {savedProjects.map(proj => (
                    <div key={proj.id} onClick={() => loadProject(proj)} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group">
                      <div className="aspect-video bg-slate-50 rounded-2xl mb-4 overflow-hidden">
                        {proj.thumbnail && <img src={proj.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                      </div>
                      <h4 className="font-bold">{proj.name}</h4>
                      <p className="text-xs text-slate-400 uppercase font-black mt-1">{proj.settings.mode}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'prompt-pack':
        return (
          <div className="max-w-5xl mx-auto space-y-12 py-12 animate-in fade-in duration-500">
             <div className="text-center space-y-4">
                <h2 className="text-4xl font-black">Production Pack Importer</h2>
                <p className="text-slate-500">Paste your entire Master Bible and Scene prompts below. AI will structure the production.</p>
             </div>
             <div className="bg-white p-12 rounded-[4rem] border-2 border-slate-100 shadow-xl space-y-8">
                <textarea 
                  className="w-full bg-slate-50 border-none rounded-[2rem] p-10 text-sm font-medium outline-none h-[500px] resize-none italic shadow-inner"
                  placeholder="Paste your Master Bible + Story Scenes (Scene 1, Scene 2...) here..."
                  value={rawPackText}
                  onChange={(e) => setRawPackText(e.target.value)}
                />
                <button 
                  disabled={!rawPackText || isParsing}
                  onClick={handleParsePack}
                  className="w-full bg-indigo-600 text-white py-8 rounded-[2.5rem] font-black text-2xl hover:bg-indigo-700 shadow-2xl transition-all flex items-center justify-center gap-6 disabled:opacity-50"
                >
                  {isParsing ? <><Loader2 className="animate-spin" size={32} /> ANALYZING PRODUCTION STRUCTURE...</> : <><ClipboardList size={32} /> PARSE & INITIALIZE PRODUCTION</>}
                </button>
             </div>
             <button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold hover:text-slate-600">Cancel</button>
          </div>
        );

      case 'prompt-pack-editor':
        return (
          <div className="max-w-6xl mx-auto space-y-12 py-12 animate-in fade-in duration-500">
             <div className="bg-white p-10 rounded-[4rem] border-2 border-slate-100 shadow-sm space-y-6">
                <div className="flex justify-between items-center"><h3 className="text-2xl font-black">Master Bible (Injected into every Scene)</h3><button onClick={() => setCurrentStep('prompt-pack')} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-full">Return to Importer</button></div>
                <textarea 
                  className="w-full bg-slate-50 border-none rounded-3xl p-6 text-sm font-medium h-40 resize-none italic"
                  value={settings.masterBible || ""}
                  onChange={(e) => setSettings({...settings, masterBible: e.target.value})}
                />
             </div>
             
             <div className="space-y-8">
                <div className="flex justify-between items-center"><h3 className="text-3xl font-black">Production Drafting Board</h3><button onClick={() => setPages([...pages, { id: Math.random().toString(36).substring(7), originalText: "", status: 'idle', assignments: [], isSpread: false }])} className="bg-indigo-600 text-white px-8 py-4 rounded-3xl font-bold flex items-center gap-2 shadow-lg"><Plus /> New Scene</button></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   {pages.map((p, idx) => (
                     <div key={p.id} className="bg-white p-8 rounded-[3.5rem] border-2 border-slate-100 shadow-sm space-y-6 relative group hover:border-indigo-400 transition-colors">
                        <button onClick={() => setPages(pages.filter(pg => pg.id !== p.id))} className="absolute top-8 right-8 text-slate-200 hover:text-red-500"><Trash2 size={20} /></button>
                        <div className="flex items-center gap-4"><div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-lg">S{idx+1}</div><h4 className="font-bold text-slate-800">Scene Instruction</h4></div>
                        <textarea 
                          className="w-full bg-slate-50 border-none rounded-2xl p-6 text-xs font-medium h-48 resize-none shadow-inner"
                          value={p.overrideStylePrompt || ""}
                          onChange={(e) => { const n = [...pages]; n[idx].overrideStylePrompt = e.target.value; setPages(n); }}
                        />
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-[1.5rem] border border-slate-100">
                           <div className="flex items-center gap-2"><Layers size={14} className="text-slate-400" /><span className="text-[10px] font-black uppercase text-slate-400">Crossing Format</span></div>
                           <div className="flex gap-2">
                              <button onClick={() => { const n = [...pages]; n[idx].isSpread = false; setPages(n); }} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${!p.isSpread ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 hover:bg-slate-100'}`}>Single Page</button>
                              <button onClick={() => { const n = [...pages]; n[idx].isSpread = true; setPages(n); }} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${p.isSpread ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 hover:bg-slate-100'}`}>Double Spread</button>
                           </div>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
             <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-3xl border-t-2 border-slate-100 p-10 z-50 shadow-2xl rounded-t-[5rem]">
               <div className="max-w-6xl mx-auto flex justify-between items-center px-10">
                  <button onClick={() => setCurrentStep('prompt-pack')} className="px-12 py-5 rounded-[2.5rem] font-bold text-slate-400 hover:bg-slate-50 transition-colors">Restart Importer</button>
                  <button onClick={() => processBulk()} className="bg-indigo-600 text-white px-16 py-7 rounded-[3rem] font-black text-2xl flex items-center gap-5 hover:bg-indigo-700 shadow-2xl hover:scale-105 transition-all"><Sparkles size={36} /> EXECUTE PRODUCTION QUEUE</button>
               </div>
            </div>
          </div>
        );

      case 'generate':
        return (
          <div className="space-y-12 animate-in fade-in duration-500 pb-56 px-8">
            <div className="text-center"><h2 className="text-4xl font-black">Industrial Queue Active</h2><p className="text-slate-500">{stats.completed} of {stats.total} master illustrations generated.</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {pages.map((p, idx) => (
                <div key={p.id} className="bg-white rounded-[4rem] border-4 border-slate-50 overflow-hidden shadow-sm relative group">
                  <div className="aspect-square bg-slate-50 relative overflow-hidden">
                    {(p.processedImage || p.originalImage) && <img src={p.processedImage || p.originalImage} className={`w-full h-full object-cover transition-all duration-1000 ${p.status === 'processing' ? 'blur-2xl opacity-40' : ''}`} />}
                    {p.status === 'processing' && <div className="absolute inset-0 flex items-center justify-center bg-indigo-600/5"><div className="w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>}
                  </div>
                  <div className="p-10 space-y-4 bg-white relative z-10">
                     <div className="flex justify-between items-center"><span className="text-xs font-black uppercase text-slate-400">Scene {idx+1} {p.isSpread ? '— Spread' : '— Single'}</span><button onClick={() => { setEditingPageId(p.id); setCurrentStep('prompt-pack-editor'); }} className="text-indigo-600 font-bold text-xs">Edit Prompt</button></div>
                     <p className="text-xs text-slate-500 italic line-clamp-2">{p.overrideStylePrompt}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="fixed bottom-0 inset-x-0 bg-slate-900 text-white p-14 shadow-2xl z-50 rounded-t-[7rem]">
               <div className="max-w-6xl mx-auto flex flex-col xl:flex-row items-center justify-between gap-12 px-10">
                  <div className="flex items-center gap-8"><button onClick={() => setCurrentStep('prompt-pack-editor')} className="bg-white/10 p-5 rounded-full"><ChevronLeft size={32} /></button><span className="text-2xl font-black uppercase tracking-tight">Queue Progress: {stats.progress}%</span></div>
                  <button disabled={isProcessing || !pages.every(p => p.status === 'completed')} onClick={() => generateBookPDF(pages, settings.exportFormat, projectName, false, settings.estimatedPageCount, settings.spreadExportMode)} className="bg-indigo-600 text-white px-20 py-8 rounded-[3.5rem] font-black text-2xl flex items-center gap-8 hover:bg-indigo-500 shadow-2xl disabled:opacity-30"><Download size={40} /> EXPORT PRODUCTION PDF</button>
               </div>
            </div>
          </div>
        );

      case 'direct-upscale':
        const targetPage = pages[0];
        return (
          <div className="max-w-5xl mx-auto space-y-12 py-12 animate-in fade-in duration-500">
             <div className="flex justify-between items-center"><button onClick={() => setCurrentStep('landing')} className="text-slate-400 font-bold flex items-center gap-2"><ChevronLeft /> Dashboard</button><div className="bg-indigo-50 px-6 py-3 rounded-full flex items-center gap-2"><Zap size={18} className="text-indigo-600" /><span className="text-indigo-600 font-black text-xs uppercase">Direct 4K Engine</span></div></div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="bg-white p-10 rounded-[4rem] border-2 border-slate-100 shadow-sm space-y-6">
                   <h3 className="text-2xl font-black">1. Upload File</h3>
                   <div onClick={() => directUpscaleInputRef.current?.click()} className="aspect-square bg-slate-50 border-4 border-dashed rounded-[3rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-600 transition-all">
                      {targetPage?.originalImage ? <img src={targetPage.originalImage} className="w-full h-full object-cover" /> : <div className="text-center text-slate-300"><Upload className="mx-auto mb-4" /><span>DROP MASTER</span></div>}
                      <input type="file" hidden ref={directUpscaleInputRef} accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => setPages([{id:'u', originalImage: r.result as string, status:'idle', assignments:[], isSpread:false, originalText:''}]); r.readAsDataURL(f); } }} />
                   </div>
                </div>
                <div className="bg-slate-900 rounded-[5rem] p-4 flex flex-col items-center justify-center min-h-[500px] relative">
                   {targetPage?.status === 'processing' && <Loader2 className="animate-spin text-indigo-500" size={64} />}
                   {targetPage?.processedImage ? <img src={targetPage.processedImage} className="w-full h-full object-contain rounded-[3rem]" /> : <span className="text-white/20 font-black uppercase">Ready for Enhance</span>}
                   {targetPage?.originalImage && targetPage.status !== 'processing' && !targetPage.processedImage && <button onClick={() => handleUpscale(targetPage.id)} className="absolute bottom-10 bg-indigo-600 text-white px-10 py-5 rounded-full font-black">PERFORM 4K UPSCALE</button>}
                </div>
             </div>
          </div>
        );

      default:
        return <div className="text-center py-40"><button onClick={() => setCurrentStep('landing')} className="bg-indigo-600 text-white px-12 py-5 rounded-full font-black">Dashboard</button></div>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="bg-white/90 backdrop-blur-2xl border-b border-slate-200 sticky top-0 z-50 h-28 flex items-center px-12 justify-between shadow-sm">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => setCurrentStep('landing')}><div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Sparkles /></div><h1 className="text-2xl font-black text-slate-900">StoryFlow <span className="text-indigo-600">Pro</span></h1></div>
        <div className="flex items-center gap-4 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100 shadow-inner"><input className="bg-transparent border-none outline-none font-bold text-sm text-slate-700" value={projectName} onChange={(e) => setProjectName(e.target.value)} /><button onClick={handleSaveProject} disabled={isSaving} className="p-2 bg-indigo-600 text-white rounded-lg shadow-xl hover:bg-indigo-700 transition-all">{isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}</button></div>
      </header>
      <main className="flex-1 w-full max-w-[1400px] mx-auto py-12">{renderStep()}</main>
    </div>
  );
};

export default App;