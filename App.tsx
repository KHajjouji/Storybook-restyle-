
import React, { useState, useRef } from 'react';
import { 
  Upload, Sparkles, BookOpen, Download, Trash2, 
  Loader2, AlertCircle, CheckCircle2, ChevronRight, 
  ChevronLeft, Plus, MapPin, Layers, Palette, Columns, Wand2
} from 'lucide-react';
import { BookPage, AppSettings, PRINT_FORMATS, CharacterRef, CharacterAssignment, SpreadExportMode } from './types';
import { restyleIllustration, translateText, extractTextFromImage, analyzeStyleFromImage } from './geminiService';
import { generateBookPDF } from './utils/pdfGenerator';

type Step = 'upload' | 'characters' | 'settings' | 'mapping' | 'generate';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [pages, setPages] = useState<BookPage[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
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
        const extractedText = await extractTextFromImage(p.originalImage);
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

  const processBulk = async () => {
    if (settings.useProModel) {
       const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
       if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    }
    setIsProcessing(true);
    setCurrentStep('generate');
    const updatedPages = [...pages];
    for (let i = 0; i < updatedPages.length; i++) {
      try {
        updatedPages[i].status = 'processing';
        setPages([...updatedPages]);
        
        let translatedText = updatedPages[i].translatedText;
        if (!translatedText && settings.targetLanguage !== 'NONE_CLEAN_BG') {
          translatedText = await translateText(updatedPages[i].originalText, settings.targetLanguage);
          updatedPages[i].translatedText = translatedText;
        }

        updatedPages[i].processedImage = await restyleIllustration(
          updatedPages[i].originalImage,
          settings.targetStyle,
          settings.styleReference,
          settings.embedTextInImage && settings.targetLanguage !== 'NONE_CLEAN_BG' ? translatedText : undefined,
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
                  <p className="text-indigo-600 font-bold animate-pulse">Scanning Illustrations & OCR...</p>
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
                    <div className="absolute bottom-0 inset-x-0 bg-indigo-900/60 text-white text-[10px] font-bold py-1.5 text-center backdrop-blur-sm">Pg {i+1}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-12">
              <button 
                disabled={pages.length === 0 || isUploading} 
                onClick={() => setCurrentStep('characters')} 
                className="bg-indigo-600 text-white px-12 py-5 rounded-[2rem] font-bold text-lg flex items-center gap-3 hover:bg-indigo-700 shadow-2xl transition-all active:scale-95 disabled:opacity-50"
              >
                Define Characters <ChevronRight size={24} />
              </button>
            </div>
          </div>
        );

      case 'characters':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold mb-2">2. Character Reference Pool</h2>
              <p className="text-slate-500 text-lg">Provide multiple faces/designs to lock in character identity across styles.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
              <div 
                onClick={() => charRefInputRef.current?.click()} 
                className="aspect-square bg-white border-4 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all group"
              >
                <Plus size={48} className="text-slate-200 group-hover:text-indigo-400 transition-colors" />
                <span className="text-sm font-bold text-slate-400 mt-3 uppercase tracking-wider">New Design</span>
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
                    className="absolute top-4 right-4 p-2 bg-white/90 rounded-full text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-md hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-16">
              <button onClick={() => setCurrentStep('upload')} className="px-10 py-5 rounded-[2rem] font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-3 transition-all text-lg"><ChevronLeft size={24} /> Back</button>
              <button onClick={() => setCurrentStep('settings')} className="bg-indigo-600 text-white px-12 py-5 rounded-[2rem] font-bold text-lg flex items-center gap-3 hover:bg-indigo-700 shadow-2xl">Global Style <ChevronRight size={24} /></button>
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-4">
              <h2 className="text-4xl font-bold mb-2">3. Style & Format Logic</h2>
              <p className="text-slate-500 text-lg">Set the aesthetic target and industrial print requirements.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <label className="block text-sm font-bold text-slate-400 uppercase tracking-[0.2em]">Global Aesthetic Target</label>
                <div 
                  className="aspect-video bg-white border-4 border-dashed border-slate-200 rounded-[3.5rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 overflow-hidden relative shadow-inner group transition-all"
                  onClick={() => styleRefInputRef.current?.click()}
                >
                   {settings.styleReference ? (
                     <img src={settings.styleReference} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Master Style" />
                   ) : (
                     <div className="text-center">
                        <Palette size={56} className="text-slate-100 mx-auto mb-4" />
                        <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Upload Master Style Reference</span>
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
                
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm relative group">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Style Instruction Prompt</label>
                    {settings.styleReference && (
                      <button 
                        onClick={handleAutoAnalyzeStyle}
                        disabled={isAnalyzingStyle}
                        className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors disabled:opacity-50"
                      >
                        {isAnalyzingStyle ? <Loader2 className="animate-spin" size={12} /> : <Wand2 size={12} />}
                        {isAnalyzingStyle ? "Analyzing..." : "Auto-Generate Prompt"}
                      </button>
                    )}
                  </div>
                  <textarea 
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 h-[120px] resize-none" 
                    value={settings.targetStyle} 
                    onChange={(e) => setSettings({...settings, targetStyle: e.target.value})} 
                    placeholder="Describe the rendering style, brushwork, and lighting..." 
                  />
                  <p className="text-[10px] text-slate-400 mt-2 font-medium">Tip: Upload a style reference image above and click "Auto-Generate" to sync the prompt.</p>
                </div>
              </div>
              <div className="bg-white p-12 rounded-[4rem] border-2 border-slate-100 shadow-xl space-y-10">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-6 uppercase tracking-widest border-b border-slate-100 pb-2">Physical Spread Strategy</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setSettings({...settings, spreadExportMode: 'WIDE_SPREAD'})}
                      className={`flex flex-col items-center p-6 rounded-[2rem] border-2 transition-all ${settings.spreadExportMode === 'WIDE_SPREAD' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-lg' : 'border-slate-50 bg-slate-50/50 hover:bg-slate-100 text-slate-400'}`}
                    >
                      <Layers size={32} className="mb-3" />
                      <span className="text-xs font-bold uppercase tracking-wider">17" Wide Sheet</span>
                    </button>
                    <button 
                      onClick={() => setSettings({...settings, spreadExportMode: 'SPLIT_PAGES'})}
                      className={`flex flex-col items-center p-6 rounded-[2rem] border-2 transition-all ${settings.spreadExportMode === 'SPLIT_PAGES' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-lg' : 'border-slate-50 bg-slate-50/50 hover:bg-slate-100 text-slate-400'}`}
                    >
                      <Columns size={32} className="mb-3" />
                      <span className="text-xs font-bold uppercase tracking-wider">Split Pages</span>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-4 uppercase tracking-widest border-b border-slate-100 pb-2">Industrial Export Preset</label>
                  <select 
                    className="w-full bg-slate-50 border-none rounded-[1.5rem] p-5 font-bold text-slate-700 outline-none text-lg shadow-inner" 
                    value={settings.exportFormat} 
                    onChange={(e) => setSettings({...settings, exportFormat: e.target.value as any})}
                  >
                    {Object.entries(PRINT_FORMATS).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-4 uppercase tracking-widest border-b border-slate-100 pb-2">Book Depth (Gutter Calc)</label>
                  <div className="flex items-center gap-6 bg-slate-50 p-6 rounded-[2rem] shadow-inner">
                    <input type="range" min="24" max="700" className="flex-1 h-3 bg-indigo-200 rounded-lg appearance-none cursor-pointer" value={settings.estimatedPageCount} onChange={(e) => setSettings({...settings, estimatedPageCount: parseInt(e.target.value)})} />
                    <span className="font-bold text-indigo-600 text-2xl w-16 text-center">{settings.estimatedPageCount}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-3 font-bold uppercase tracking-wider">Auto-calculates binding curve compensation</p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-4 uppercase tracking-widest border-b border-slate-100 pb-2">Translation & Text Action</label>
                  <select 
                    className="w-full bg-slate-50 border-none rounded-[1.5rem] p-5 font-bold text-slate-700 outline-none shadow-inner" 
                    value={settings.targetLanguage} 
                    onChange={(e) => setSettings({...settings, targetLanguage: e.target.value})}
                  >
                    <optgroup label="Translate Content">
                      <option value="English">English</option>
                      <option value="French">French</option>
                      <option value="Spanish">Spanish</option>
                      <option value="German">German</option>
                    </optgroup>
                    <optgroup label="Layout Preparation">
                      <option value="NONE_CLEAN_BG">Remove All Text (Clean Background)</option>
                    </optgroup>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-between pt-10">
              <button onClick={() => setCurrentStep('characters')} className="px-10 py-5 rounded-[2rem] font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-3 transition-all text-lg"><ChevronLeft size={24} /> Back</button>
              <button onClick={() => setCurrentStep('mapping')} className="bg-indigo-600 text-white px-12 py-5 rounded-[2rem] font-bold text-lg flex items-center gap-3 hover:bg-indigo-700 shadow-2xl">Scene-by-Scene Mapping <ChevronRight size={24} /></button>
            </div>
          </div>
        );

      case 'mapping':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-36">
            <div className="text-center mb-10">
              <h2 className="text-4xl font-bold mb-2">4. Spread Logic & Identity Map</h2>
              <p className="text-slate-500 text-lg">Define spreads and pin character designs to specific figures in each scene.</p>
            </div>
            <div className="space-y-12">
              {pages.map((page, idx) => (
                <div key={page.id} className="bg-white rounded-[4rem] border-2 border-slate-100 overflow-hidden flex flex-col md:flex-row shadow-sm hover:shadow-2xl transition-all group">
                  <div className="md:w-1/3 aspect-square relative bg-slate-50">
                    <img src={page.originalImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    <button 
                      onClick={() => setPages(pages.map(p => p.id === page.id ? {...p, isSpread: !p.isSpread} : p))} 
                      className={`absolute bottom-8 left-8 flex items-center gap-3 px-6 py-3 rounded-full text-xs font-bold transition-all shadow-2xl ${page.isSpread ? 'bg-indigo-600 text-white scale-110' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}
                    >
                      <Layers size={18} /> {page.isSpread ? 'Panoramic Spread Enabled' : 'Single Illustration'}
                    </button>
                  </div>
                  <div className="md:w-2/3 p-12 flex flex-col justify-between space-y-10">
                    <div className="space-y-6">
                      <div className="flex justify-between items-center border-b-2 border-slate-50 pb-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em]">Identity Map (Pg {idx+1})</span>
                        <button 
                          onClick={() => setPages(pages.map(p => p.id === page.id ? {...p, assignments: [...p.assignments, {refId: settings.characterReferences[0]?.id || '', description: ''}]} : p))} 
                          className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
                        >
                          + Link Identity
                        </button>
                      </div>
                      <div className="space-y-4 max-h-[250px] overflow-y-auto pr-4 scrollbar-hide">
                        {page.assignments.map((a, ai) => (
                          <div key={ai} className="flex gap-4 items-center bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100 shadow-inner">
                            <MapPin size={20} className="text-indigo-400 shrink-0" />
                            <input 
                              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-medium" 
                              placeholder="Describe character position (e.g. boy on left)..." 
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
                              className="text-red-400 hover:text-red-600 p-2 transition-colors"
                            >
                              <Trash2 size={20} />
                            </button>
                          </div>
                        ))}
                        {page.assignments.length === 0 && (
                          <div className="text-center py-10">
                            <p className="text-sm text-slate-300 font-bold uppercase tracking-widest italic">No Mappings - AI will predict identities</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="bg-slate-900 rounded-[2rem] p-8 shadow-2xl">
                       <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-[0.4em] mb-4">Original Script Layer</label>
                       <textarea 
                        className="w-full bg-white/5 border-none rounded-xl text-sm font-medium text-white/80 outline-none min-h-[80px] p-2 resize-none italic" 
                        value={page.originalText} 
                        onChange={(e) => setPages(pages.map(p => p.id === page.id ? {...p, originalText: e.target.value} : p))} 
                       />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-2xl border-t-2 border-slate-100 p-10 z-50 shadow-[0_-20px_50px_rgba(0,0,0,0.1)] rounded-t-[5rem]">
               <div className="max-w-5xl mx-auto flex justify-between items-center">
                  <button onClick={() => setCurrentStep('settings')} className="px-12 py-5 rounded-[2rem] font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-3 transition-all text-xl"><ChevronLeft size={28} /> Back</button>
                  <button 
                    onClick={processBulk} 
                    className="bg-indigo-600 text-white px-16 py-6 rounded-[2.5rem] font-extrabold text-2xl flex items-center gap-4 hover:bg-indigo-700 shadow-[0_20px_40px_rgba(79,70,229,0.4)] transition-all scale-110 active:scale-100"
                  >
                    <Sparkles size={32} /> BULK GENERATE STORY
                  </button>
               </div>
            </div>
          </div>
        );

      case 'generate':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-48">
            <div className="text-center">
              <h2 className="text-4xl font-bold mb-2 text-slate-900">5. Global Review & Export</h2>
              <p className="text-slate-500 text-lg">Final quality check. Download high-res PDF when rendering completes.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {pages.map((page, idx) => (
                <div key={page.id} className="bg-white rounded-[4rem] border-4 border-slate-50 overflow-hidden shadow-sm hover:shadow-2xl transition-all group">
                  <div className={`aspect-square relative bg-slate-50 overflow-hidden ${page.isSpread ? 'ring-8 ring-indigo-50' : ''}`}>
                    <img 
                      src={page.processedImage || page.originalImage} 
                      className={`w-full h-full object-cover transition-all duration-[2000ms] ${page.status === 'processing' ? 'blur-[100px] opacity-30 scale-150' : 'scale-100'}`} 
                    />
                    {page.status === 'processing' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
                        <div className="w-20 h-20 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin shadow-2xl"></div>
                        <span className="text-xs font-bold text-indigo-900 uppercase tracking-[0.4em] animate-pulse">Rendering Page {idx+1}...</span>
                      </div>
                    )}
                    <div className="absolute top-8 left-8 bg-black/60 text-white text-[12px] px-6 py-3 rounded-full font-bold backdrop-blur-xl shadow-2xl uppercase tracking-widest border border-white/20">
                      PG {idx+1} {page.isSpread ? '— Panoramic' : ''}
                    </div>
                  </div>
                  <div className="p-8 flex items-center justify-between bg-slate-50/50">
                     <div className="flex items-center gap-4">
                        {page.status === 'completed' ? (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle2 size={24} />
                            <span className="text-xs font-bold uppercase tracking-widest">Masterpiece Rendered</span>
                          </div>
                        ) : page.status === 'error' ? (
                          <div className="flex items-center gap-2 text-red-500">
                            <AlertCircle size={24} />
                            <span className="text-xs font-bold uppercase tracking-widest">Render Failure</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-indigo-400">
                            <Loader2 className="animate-spin" size={24} />
                            <span className="text-xs font-bold uppercase tracking-widest">Queue: Processing</span>
                          </div>
                        )}
                     </div>
                     {page.status === 'completed' && <div className="text-[10px] text-green-600 font-bold uppercase px-4 py-2 bg-green-100 rounded-full border border-green-200">Industrial Ready</div>}
                  </div>
                </div>
              ))}
            </div>

            <div className="fixed bottom-0 inset-x-0 bg-slate-900 text-white p-12 shadow-[0_-30px_60px_rgba(0,0,0,0.5)] z-50 rounded-t-[6rem]">
               <div className="max-w-5xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-12">
                  <div className="space-y-3 text-center lg:text-left">
                     <div className="flex items-center justify-center lg:justify-start gap-6">
                        <BookOpen className="text-indigo-400" size={48} />
                        <span className="text-3xl font-extrabold uppercase tracking-tight">{PRINT_FORMATS[settings.exportFormat].name}</span>
                     </div>
                     <div className="flex flex-wrap justify-center lg:justify-start gap-6 pt-2">
                        <span className="text-[11px] text-slate-400 uppercase font-black tracking-[0.3em] bg-white/5 px-4 py-1.5 rounded-full">{settings.spreadExportMode} Mode</span>
                        <span className="text-[11px] text-indigo-400 uppercase font-black tracking-[0.3em] bg-indigo-500/10 px-4 py-1.5 rounded-full">Industrial Binding logic</span>
                        <span className="text-[11px] text-slate-400 uppercase font-black tracking-[0.3em] bg-white/5 px-4 py-1.5 rounded-full">{settings.estimatedPageCount} Pages</span>
                     </div>
                  </div>
                  <button 
                    disabled={isProcessing || !pages.every(p => p.status === 'completed')} 
                    onClick={() => generateBookPDF(pages, settings.exportFormat, "Production_Story_Export", !settings.embedTextInImage && settings.targetLanguage !== 'NONE_CLEAN_BG', settings.estimatedPageCount, settings.spreadExportMode)} 
                    className="bg-indigo-600 text-white px-20 py-8 rounded-[3rem] font-black text-2xl flex items-center gap-6 hover:bg-indigo-500 shadow-[0_30px_60px_rgba(79,70,229,0.5)] transition-all scale-110 active:scale-100 disabled:opacity-50 disabled:scale-100 hover:scale-115"
                  >
                    <Download size={36} /> DOWNLOAD PRINT PDF
                  </button>
               </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] selection:bg-indigo-100">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-10 h-24 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-indigo-600 rounded-[1.25rem] flex items-center justify-center text-white shadow-xl shadow-indigo-200"><Sparkles size={28} /></div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 leading-none">StoryFlow <span className="text-indigo-600">Pro</span></h1>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.4em] mt-1.5">Elite Book Production Suite</p>
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-6">
            {(['upload', 'characters', 'settings', 'mapping', 'generate'] as Step[]).map((s, i) => (
              <React.Fragment key={s}>
                <div 
                  onClick={() => !isProcessing && currentStep !== 'generate' && setCurrentStep(s)}
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-black transition-all cursor-pointer ${currentStep === s ? 'bg-indigo-600 text-white scale-115 shadow-2xl ring-4 ring-indigo-50' : 'bg-slate-50 text-slate-300 hover:bg-slate-100'}`}
                >
                  {i + 1}
                </div>
                {i < 4 && <div className={`w-8 h-[4px] rounded-full transition-all duration-500 ${(['upload', 'characters', 'settings', 'mapping', 'generate'].indexOf(currentStep)) > i ? 'bg-indigo-600' : 'bg-slate-50'}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-10 py-16">{renderStep()}</main>
      <footer className="py-24 text-center">
         <div className="flex flex-wrap items-center justify-center gap-16 mb-10 opacity-40 grayscale">
            <span className="font-black text-xs uppercase tracking-[0.3em]">Amazon KDP Certified</span>
            <span className="font-black text-xs uppercase tracking-[0.3em]">Lulu Certified</span>
            <span className="font-black text-xs uppercase tracking-[0.3em]">IngramSpark Ready</span>
         </div>
         <p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.5em]">StoryFlow Industrial Suite © 2024</p>
      </footer>
    </div>
  );
};

export default App;
