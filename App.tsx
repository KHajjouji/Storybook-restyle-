import React, { useState, useRef } from 'react';
import { 
  Upload, Sparkles, BookOpen, Download, Trash2, 
  Loader2, AlertCircle, CheckCircle2, ChevronRight, 
  ChevronLeft, Plus, MapPin, Layers, Palette, Columns, Wand2, Edit3, RefreshCw, X, Rocket
} from 'lucide-react';
import { BookPage, AppSettings, PRINT_FORMATS, CharacterRef, CharacterAssignment, AppMode } from './types';
import { restyleIllustration, translateText, extractTextFromImage, analyzeStyleFromImage, identifyAndDesignCharacters, planStoryScenes } from './geminiService';
import { generateBookPDF } from './utils/pdfGenerator';

type Step = 'landing' | 'upload' | 'script' | 'settings' | 'characters' | 'mapping' | 'generate';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>('landing');
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);
  const [isAnalyzingScript, setIsAnalyzingScript] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const charRefInputRef = useRef<HTMLInputElement>(null);
  const styleRefInputRef = useRef<HTMLInputElement>(null);

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
    setIsAnalyzingScript(true);
    try {
      const plan = await planStoryScenes(settings.fullScript);
      const newPages: BookPage[] = plan.pages.map(p => ({
        id: Math.random().toString(36).substring(7),
        originalText: p.text,
        status: 'idle',
        assignments: [],
        isSpread: p.isSpread
      }));
      setPages(newPages);
      setCurrentStep('settings');
    } catch (err) {
      console.error("Script Analysis Error:", err);
    } finally {
      setIsAnalyzingScript(false);
    }
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

  const processSinglePage = async (pageId: string) => {
    const pageIndex = pages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) return;

    if (settings.useProModel) {
       const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
       if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    }

    const updatedPages = [...pages];
    updatedPages[pageIndex].status = 'processing';
    setPages([...updatedPages]);

    try {
      let translatedText = updatedPages[pageIndex].translatedText;
      if (!translatedText && settings.targetLanguage !== 'NONE_CLEAN_BG' && settings.targetLanguage !== 'English') {
        translatedText = await translateText(updatedPages[pageIndex].originalText, settings.targetLanguage);
        updatedPages[pageIndex].translatedText = translatedText;
      }

      const activePrompt = updatedPages[pageIndex].overrideStylePrompt || settings.targetStyle;

      updatedPages[pageIndex].processedImage = await restyleIllustration(
        updatedPages[pageIndex].originalImage,
        activePrompt,
        settings.styleReference,
        settings.embedTextInImage && settings.targetLanguage !== 'NONE_CLEAN_BG' ? (translatedText || updatedPages[pageIndex].originalText) : undefined,
        settings.characterReferences,
        updatedPages[pageIndex].assignments,
        settings.useProModel,
        settings.targetLanguage === 'NONE_CLEAN_BG',
        updatedPages[pageIndex].isSpread
      );
      updatedPages[pageIndex].status = 'completed';
    } catch (e: any) {
      updatedPages[pageIndex].status = 'error';
    }
    setPages([...updatedPages]);
    setEditingPageId(null);
  };

  const processBulk = async () => {
    if (settings.useProModel) {
       const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
       if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    }
    setIsProcessing(true);
    setCurrentStep('generate');
    const updatedPages = [...pages];
    for (let i = 0; i < updatedPages.length; i++) {
      if (updatedPages[i].status === 'completed') continue; 

      try {
        updatedPages[i].status = 'processing';
        setPages([...updatedPages]);
        
        let translatedText = updatedPages[i].translatedText;
        if (!translatedText && settings.targetLanguage !== 'NONE_CLEAN_BG' && settings.targetLanguage !== 'English') {
          translatedText = await translateText(updatedPages[i].originalText, settings.targetLanguage);
          updatedPages[i].translatedText = translatedText;
        }

        const activePrompt = updatedPages[i].overrideStylePrompt || settings.targetStyle;

        updatedPages[i].processedImage = await restyleIllustration(
          updatedPages[i].originalImage,
          activePrompt,
          settings.styleReference,
          settings.embedTextInImage && settings.targetLanguage !== 'NONE_CLEAN_BG' ? (translatedText || updatedPages[i].originalText) : undefined,
          settings.characterReferences,
          updatedPages[i].assignments,
          settings.useProModel,
          settings.targetLanguage === 'NONE_CLEAN_BG',
          updatedPages[i].isSpread
        );
        updatedPages[i].status = 'completed';
      } catch (e: any) { 
        updatedPages[i].status = 'error'; 
      }
      setPages([...updatedPages]);
    }
    setIsProcessing(false);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'landing':
        return (
          <div className="max-w-4xl mx-auto space-y-12 py-12 animate-in fade-in duration-700">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-black text-slate-900 tracking-tight">How would you like to build?</h2>
              <p className="text-slate-500 text-xl font-medium">Select your industrial production path.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <button 
                onClick={() => { setSettings({...settings, mode: 'restyle'}); setCurrentStep('upload'); }}
                className="group p-10 bg-white border-2 border-slate-100 rounded-[4rem] text-left hover:border-indigo-600 hover:shadow-2xl transition-all hover:-translate-y-2 relative overflow-hidden"
              >
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm mb-8">
                  <Palette size={32} />
                </div>
                <h3 className="text-2xl font-black mb-3">Restyle Existing Book</h3>
                <p className="text-slate-400 leading-relaxed font-medium">Upload original illustrations to preserve characters while applying a new master aesthetic.</p>
              </button>
              <button 
                onClick={() => { setSettings({...settings, mode: 'create'}); setCurrentStep('script'); }}
                className="group p-10 bg-white border-2 border-slate-100 rounded-[4rem] text-left hover:border-indigo-600 hover:shadow-2xl transition-all hover:-translate-y-2 relative overflow-hidden"
              >
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm mb-8">
                  <Rocket size={32} />
                </div>
                <h3 className="text-2xl font-black mb-3">Create New Story</h3>
                <p className="text-slate-400 leading-relaxed font-medium">Input a script from A to Z. AI will plan scenes and design consistent characters in your chosen style.</p>
              </button>
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

            {pages.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6 pt-4">
                {pages.map((p, i) => (
                  <div key={p.id} className="aspect-square relative rounded-[1.5rem] overflow-hidden border-2 border-slate-200 shadow-sm group hover:shadow-lg transition-all">
                    <img src={p.originalImage} className="w-full h-full object-cover" alt={`Pg ${i+1}`} />
                    <button 
                      onClick={(e) => { e.stopPropagation(); setPages(pages.filter(pg => pg.id !== p.id)); }} 
                      className="absolute top-2 right-2 p-2 bg-white/90 rounded-full text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-md hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-indigo-900/60 text-white text-[10px] font-bold py-1.5 text-center backdrop-blur-sm font-display">Pg {i+1}</div>
                  </div>
                ))}
              </div>
            )}

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
              <h2 className="text-4xl font-bold mb-2 text-slate-900">1. Define Your Story Script</h2>
              <p className="text-slate-500 text-lg">AI will plan scenes and layout based on your text.</p>
            </div>
            
            <div className="bg-white rounded-[4rem] border-2 border-slate-100 p-12 shadow-sm space-y-6 relative overflow-hidden">
              <textarea 
                className="w-full bg-slate-50/50 border-none rounded-3xl p-8 text-lg font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 min-h-[400px] resize-none italic"
                placeholder="Paste full script here..."
                value={settings.fullScript || ""}
                onChange={(e) => setSettings({...settings, fullScript: e.target.value})}
              />
              <div className="flex justify-between items-center pt-8">
                <button onClick={() => setCurrentStep('landing')} className="px-10 py-5 rounded-[2.5rem] font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-3 transition-all text-lg">Back</button>
                <button 
                  disabled={!settings.fullScript || isAnalyzingScript}
                  onClick={startStoryCreation}
                  className="bg-indigo-600 text-white px-14 py-6 rounded-[3rem] font-black text-xl flex items-center gap-4 hover:bg-indigo-700 shadow-2xl transition-all disabled:opacity-50"
                >
                  {isAnalyzingScript ? <Loader2 className="animate-spin" size={24} /> : "Plan Story Scenes"}
                </button>
              </div>
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-4">
              <h2 className="text-4xl font-bold mb-2 text-slate-900">2. Master Art Direction</h2>
              <p className="text-slate-500 text-lg">Define the visual policy that will govern every page of the book.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <label className="block text-sm font-bold text-slate-400 uppercase tracking-[0.2em]">Visual Reference</label>
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
                    className="w-full bg-slate-50 border-none rounded-[1.5rem] p-5 font-bold text-slate-700 outline-none text-lg shadow-inner" 
                    value={settings.exportFormat} 
                    onChange={(e) => setSettings({...settings, exportFormat: e.target.value as any})}
                  >
                    {Object.entries(PRINT_FORMATS).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-4 uppercase tracking-widest border-b border-slate-100 pb-2">Language Preset</label>
                  <select 
                    className="w-full bg-slate-50 border-none rounded-[1.5rem] p-5 font-bold text-slate-700 outline-none shadow-inner" 
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
              <h2 className="text-4xl font-bold mb-2">3. Character Identity Management</h2>
              <p className="text-slate-500 text-lg">Lock in faces and clothing to ensure perfect consistency across the story.</p>
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
                  <button 
                    onClick={() => setSettings({...settings, characterReferences: settings.characterReferences.filter(r => r.id !== ref.id)})} 
                    className="absolute top-4 right-4 p-2 bg-white/90 rounded-full text-red-500 opacity-0 group-hover:opacity-100 shadow-md"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-16">
              <button onClick={() => setCurrentStep('settings')} className="px-10 py-5 rounded-[2rem] font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-3 text-lg">Back</button>
              <button onClick={() => setCurrentStep('mapping')} className="bg-indigo-600 text-white px-12 py-5 rounded-[2rem] font-bold text-lg flex items-center gap-3 hover:bg-indigo-700 shadow-2xl">Final Mapping <ChevronRight size={24} /></button>
            </div>
          </div>
        );

      case 'mapping':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-40">
            <div className="text-center mb-10">
              <h2 className="text-4xl font-bold mb-2 text-slate-900">4. Per-Scene Character Logic</h2>
              <p className="text-slate-500 text-lg">Assign specific character designs to appearances in each planned scene.</p>
            </div>
            <div className="space-y-12">
              {pages.map((page, idx) => (
                <div key={page.id} className="bg-white rounded-[4rem] border-2 border-slate-100 overflow-hidden flex flex-col md:flex-row shadow-sm hover:shadow-2xl transition-all">
                  <div className="md:w-1/3 aspect-square relative bg-slate-50">
                    {page.originalImage ? (
                      <img src={page.originalImage} className="w-full h-full object-cover" alt={`Scene ${idx+1}`} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-100 text-slate-400">
                        <Palette size={48} className="opacity-20" />
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
                          + Add Participant
                        </button>
                      </div>
                      <div className="space-y-4 max-h-[250px] overflow-y-auto pr-4 scrollbar-hide">
                        {page.assignments.map((a, ai) => (
                          <div key={ai} className="flex gap-4 items-center bg-slate-50 p-5 rounded-[2rem] border border-slate-100 shadow-inner">
                            <MapPin size={20} className="text-indigo-400 shrink-0" />
                            <input 
                              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-medium" 
                              placeholder="Role/Position (e.g. main girl)..." 
                              value={a.description} 
                              onChange={(e) => { const n = [...pages]; n[idx].assignments[ai].description = e.target.value; setPages(n); }} 
                            />
                            <select 
                              className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none" 
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
                      </div>
                    </div>
                    <div className="bg-slate-900 rounded-[3rem] p-10 shadow-2xl">
                       <label className="block text-[10px] font-black text-indigo-300 uppercase tracking-[0.4em] mb-4">Script Fragment</label>
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
                    onClick={processBulk} 
                    className="bg-indigo-600 text-white px-16 py-7 rounded-[3rem] font-black text-2xl flex items-center gap-5 hover:bg-indigo-700 shadow-[0_25px_50px_rgba(79,70,229,0.35)] transition-all scale-110 active:scale-100"
                  >
                    <Sparkles size={36} /> RENDER STORYBOOK
                  </button>
               </div>
            </div>
          </div>
        );

      case 'generate':
        return (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-56">
            <div className="text-center">
              <h2 className="text-4xl font-bold mb-2 text-slate-900">5. Industrial Proofing Suite</h2>
              <p className="text-slate-500 text-lg">Verify character consistency and visual style before industrial export.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {pages.map((page, idx) => (
                <div key={page.id} className={`bg-white rounded-[5rem] border-4 border-slate-50 overflow-hidden shadow-sm hover:shadow-2xl transition-all group flex flex-col ${editingPageId === page.id ? 'ring-4 ring-indigo-500 border-indigo-500' : ''}`}>
                  <div className="aspect-square relative bg-slate-50 overflow-hidden">
                    <img 
                      src={page.processedImage || page.originalImage || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1000"} 
                      className={`w-full h-full object-cover transition-all duration-[2000ms] ${page.status === 'processing' ? 'blur-[100px] opacity-20 scale-150' : 'scale-100'} ${page.processedImage ? '' : 'grayscale opacity-30'}`} 
                      alt={`Render Pg ${idx+1}`}
                    />
                    
                    {page.status === 'processing' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
                        <div className="w-24 h-24 border-[10px] border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm font-black text-indigo-900 uppercase tracking-[0.5em] animate-pulse">Industrial Rendering {idx+1}...</span>
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

                    {page.status !== 'processing' && (
                      <div className="absolute bottom-10 inset-x-10 flex justify-center gap-4 translate-y-20 group-hover:translate-y-0 transition-transform duration-500">
                        <button onClick={() => setEditingPageId(editingPageId === page.id ? null : page.id)} className="flex items-center gap-3 bg-white text-slate-900 px-8 py-4 rounded-3xl font-bold shadow-2xl hover:bg-indigo-600 hover:text-white transition-all text-sm">
                          <Edit3 size={18} /> {editingPageId === page.id ? 'Close Editor' : 'Tweak Style'}
                        </button>
                        <button onClick={() => processSinglePage(page.id)} className="flex items-center justify-center bg-indigo-600 text-white w-14 h-14 rounded-3xl shadow-2xl hover:bg-indigo-700 transition-all">
                          <RefreshCw size={24} />
                        </button>
                      </div>
                    )}
                  </div>

                  {editingPageId === page.id && (
                    <div className="p-12 bg-indigo-50/50 border-t-4 border-indigo-100 space-y-6">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest flex items-center gap-2"><Edit3 size={14} /> Style Override</h4>
                        <button onClick={() => setEditingPageId(null)} className="text-indigo-400 hover:text-indigo-600"><X size={20} /></button>
                      </div>
                      <textarea 
                        className="w-full bg-white border-2 border-indigo-100 rounded-[2rem] p-6 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-500/20 h-[150px] shadow-inner"
                        value={page.overrideStylePrompt || settings.targetStyle}
                        onChange={(e) => {
                          const n = [...pages];
                          n[idx].overrideStylePrompt = e.target.value;
                          setPages(n);
                        }}
                      />
                      <div className="flex justify-end gap-4">
                        <button onClick={() => { const n = [...pages]; n[idx].overrideStylePrompt = undefined; setPages(n); }} className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors">Reset to Global</button>
                        <button onClick={() => processSinglePage(page.id)} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-xl flex items-center gap-2">
                          <RefreshCw size={16} /> Apply & Re-render
                        </button>
                      </div>
                    </div>
                  )}
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
                    className="bg-indigo-600 text-white px-20 py-8 rounded-[3.5rem] font-black text-2xl flex items-center gap-8 hover:bg-indigo-500 shadow-[0_40px_80px_rgba(79,70,229,0.5)] transition-all scale-110 active:scale-100 disabled:opacity-50"
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
        <div className="max-w-7xl mx-auto px-12 h-28 flex items-center justify-between">
          <div className="flex items-center gap-6 cursor-pointer" onClick={() => setCurrentStep('landing')}>
            <div className="w-16 h-16 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl rotate-3 hover:rotate-0 transition-transform"><Sparkles size={32} /></div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 leading-none font-display">StoryFlow <span className="text-indigo-600">Pro</span></h1>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.5em] mt-2">Elite Production Engine</p>
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-8">
            {['upload', 'script', 'settings', 'characters', 'mapping', 'generate'].filter(s => {
              if (settings.mode === 'restyle' && s === 'script') return false;
              if (settings.mode === 'create' && s === 'upload') return false;
              return true;
            }).map((s, i) => (
              <React.Fragment key={s}>
                <div 
                  onClick={() => !isProcessing && currentStep !== 'landing' && setCurrentStep(s as Step)}
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-sm font-black transition-all cursor-pointer ${currentStep === s ? 'bg-indigo-600 text-white scale-125 shadow-2xl ring-8 ring-indigo-50' : (currentStep !== 'landing' ? 'bg-white border-2 border-slate-100 text-slate-400' : 'bg-slate-50 text-slate-200 cursor-not-allowed')}`}
                >
                  {i + 1}
                </div>
                {i < 4 && <div className="w-10 h-[4px] bg-slate-100 rounded-full" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-12 py-20">{renderStep()}</main>
    </div>
  );
};

export default App;