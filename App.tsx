
import React, { useState, useRef } from 'react';
import { 
  Upload, Sparkles, Languages, BookOpen, Download, Trash2, 
  Loader2, AlertCircle, CheckCircle2, Image as ImageIcon,
  Type as TypeIcon, ChevronRight, ChevronLeft, Plus, MapPin, Layers, Palette, Columns, Rocket
} from 'lucide-react';
import { BookPage, AppSettings, PRINT_FORMATS, CharacterRef, CharacterAssignment, SpreadExportMode } from './types';
import { restyleIllustration, translateText, extractTextFromImage } from './geminiService';
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
          originalText: "Extracting script...",
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
          item.id === p.id ? { ...item, originalText: extractedText || "[Clean Page]" } : item
        ));
      } catch (err) {
        console.error("OCR Error:", err);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Fix: Added handleCharRefUpload to handle character reference image uploads
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
          name: file.name.split('.')[0] || "New Character"
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
              <h2 className="text-3xl font-bold mb-2">1. Import Story Pages</h2>
              <p className="text-slate-500">Upload your book's existing illustrations to begin restyling.</p>
            </div>
            <div 
              onClick={() => !isUploading && fileInputRef.current?.click()} 
              className={`h-[320px] bg-white border-2 border-dashed rounded-[3rem] flex flex-col items-center justify-center gap-4 cursor-pointer transition-all group ${isUploading ? 'border-slate-100 opacity-50 cursor-wait' : 'border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/20'}`}
            >
              {isUploading ? <Loader2 className="animate-spin text-indigo-600" size={48} /> : (
                <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                  <Upload size={32} />
                </div>
              )}
              <div className="text-center">
                <p className="font-bold text-slate-900 text-lg">{isUploading ? "Analyzing Pages..." : "Select Story Files"}</p>
                <p className="text-xs text-slate-400 mt-1">Single pages or wide panorama spreads supported</p>
              </div>
              <input type="file" multiple hidden ref={fileInputRef} accept="image/*" onChange={handleFileUpload} />
            </div>
            {pages.length > 0 && (
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-4">
                {pages.map((p, i) => (
                  <div key={p.id} className="aspect-square relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm group">
                    <img src={p.originalImage} className="w-full h-full object-cover" alt={`Pg ${i+1}`} />
                    <button onClick={(e) => { e.stopPropagation(); setPages(pages.filter(pg => pg.id !== p.id)); }} className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-md"><Trash2 size={12} /></button>
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] font-bold p-1 text-center backdrop-blur-sm">Page {i+1}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-8">
              <button disabled={pages.length === 0 || isUploading} onClick={() => setCurrentStep('characters')} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 hover:bg-indigo-700 shadow-lg transition-all active:scale-95 disabled:opacity-50">
                Continue to Characters <ChevronRight size={20} />
              </button>
            </div>
          </div>
        );
      case 'characters':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-2">2. Character Reference Pool</h2>
              <p className="text-slate-500">Upload character designs to maintain consistent faces throughout the story.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-6">
              <div onClick={() => charRefInputRef.current?.click()} className="aspect-square bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
                <Plus size={40} className="text-slate-200 group-hover:text-indigo-400 transition-colors" />
                <span className="text-xs font-bold text-slate-400 mt-2 uppercase">Add Identity</span>
                <input type="file" multiple hidden ref={charRefInputRef} accept="image/*" onChange={handleCharRefUpload} />
              </div>
              {settings.characterReferences.map((ref, idx) => (
                <div key={ref.id} className="aspect-square relative bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm group">
                  <img src={ref.image} className="w-full h-full object-cover" alt={ref.name} />
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 p-3 backdrop-blur-md">
                    <input className="w-full bg-transparent text-white text-xs font-bold outline-none border-none" value={ref.name} onChange={(e) => { const n = [...settings.characterReferences]; n[idx].name = e.target.value; setSettings({...settings, characterReferences: n}); }} />
                  </div>
                  <button onClick={() => setSettings({...settings, characterReferences: settings.characterReferences.filter(r => r.id !== ref.id)})} className="absolute top-3 right-3 p-2 bg-white/80 rounded-full text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-md"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-10">
              <button onClick={() => setCurrentStep('upload')} className="px-8 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-2 transition-all"><ChevronLeft size={20} /> Back</button>
              <button onClick={() => setCurrentStep('settings')} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 hover:bg-indigo-700 shadow-lg">Production Style <ChevronRight size={20} /></button>
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-4">
              <h2 className="text-3xl font-bold mb-2">3. Style & Printing Strategy</h2>
              <p className="text-slate-500">Define the global aesthetic and physical book parameters.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Global Master Style Reference</label>
                <div onClick={() => styleRefInputRef.current?.click()} className="aspect-video bg-white border-2 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 overflow-hidden relative shadow-inner group">
                   {settings.styleReference ? (
                     <img src={settings.styleReference} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                   ) : (
                     <div className="text-center">
                        <Palette size={48} className="text-slate-100 mx-auto mb-3" />
                        <span className="text-xs font-bold text-slate-400 uppercase">Upload Reference Sheet</span>
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
                <textarea 
                  className="w-full bg-white border border-slate-200 rounded-3xl p-6 text-sm outline-none focus:ring-2 focus:ring-indigo-500 h-[120px] shadow-sm font-medium" 
                  value={settings.targetStyle} 
                  onChange={(e) => setSettings({...settings, targetStyle: e.target.value})} 
                  placeholder="Describe the rendering style, brushwork, and lighting..." 
                />
              </div>
              <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest">Physical Spread Export</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setSettings({...settings, spreadExportMode: 'WIDE_SPREAD'})}
                      className={`flex flex-col items-center p-5 rounded-3xl border-2 transition-all ${settings.spreadExportMode === 'WIDE_SPREAD' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md' : 'border-slate-50 bg-slate-50/50 hover:bg-slate-100 text-slate-400'}`}
                    >
                      <Layers size={24} className="mb-2" />
                      <span className="text-[11px] font-bold uppercase">17" Wide Sheet</span>
                    </button>
                    <button 
                      onClick={() => setSettings({...settings, spreadExportMode: 'SPLIT_PAGES'})}
                      className={`flex flex-col items-center p-5 rounded-3xl border-2 transition-all ${settings.spreadExportMode === 'SPLIT_PAGES' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md' : 'border-slate-50 bg-slate-50/50 hover:bg-slate-100 text-slate-400'}`}
                    >
                      <Columns size={24} className="mb-2" />
                      <span className="text-[11px] font-bold uppercase">Split to Pages</span>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">Platform & Size</label>
                  <select className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold text-slate-700 outline-none" value={settings.exportFormat} onChange={(e) => setSettings({...settings, exportFormat: e.target.value as any})}>
                    {Object.entries(PRINT_FORMATS).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">Page Count (Binding Logic)</label>
                  <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl">
                    <input type="range" min="24" max="700" className="flex-1 accent-indigo-600" value={settings.estimatedPageCount} onChange={(e) => setSettings({...settings, estimatedPageCount: parseInt(e.target.value)})} />
                    <span className="font-bold text-indigo-600 text-xl w-14 text-center">{settings.estimatedPageCount}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-between pt-6">
              <button onClick={() => setCurrentStep('characters')} className="px-8 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-2 transition-all"><ChevronLeft size={20} /> Back</button>
              <button onClick={() => setCurrentStep('mapping')} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 hover:bg-indigo-700 shadow-lg">Final Scene Mapping <ChevronRight size={20} /></button>
            </div>
          </div>
        );
      case 'mapping':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-28">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-2">4. Spread Toggles & Character Mapping</h2>
              <p className="text-slate-500">Configure which pages are spreads and assign character identities to the AI.</p>
            </div>
            <div className="space-y-8">
              {pages.map((page, idx) => (
                <div key={page.id} className="bg-white rounded-[3rem] border border-slate-200 overflow-hidden flex flex-col md:flex-row shadow-sm hover:shadow-md transition-all">
                  <div className="md:w-1/3 aspect-square relative bg-slate-100">
                    <img src={page.originalImage} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setPages(pages.map(p => p.id === page.id ? {...p, isSpread: !p.isSpread} : p))} 
                      className={`absolute bottom-6 left-6 flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all shadow-xl ${page.isSpread ? 'bg-indigo-600 text-white scale-105' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}
                    >
                      <Layers size={14} /> {page.isSpread ? 'Panoramic Spread' : 'Single Illustration'}
                    </button>
                  </div>
                  <div className="md:w-2/3 p-10 flex flex-col justify-between space-y-8">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Scene {idx+1} Identity Map</span>
                        <button onClick={() => setPages(pages.map(p => p.id === page.id ? {...p, assignments: [...p.assignments, {refId: settings.characterReferences[0]?.id || '', description: ''}]} : p))} className="text-indigo-600 text-xs font-bold hover:underline">+ Link Identity</button>
                      </div>
                      <div className="space-y-3">
                        {page.assignments.map((a, ai) => (
                          <div key={ai} className="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
                            <MapPin size={16} className="text-indigo-400 shrink-0" />
                            <input className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500" placeholder="E.g. The character in the tree..." value={a.description} onChange={(e) => { const n = [...pages]; n[idx].assignments[ai].description = e.target.value; setPages(n); }} />
                            <select className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none" value={a.refId} onChange={(e) => { const n = [...pages]; n[idx].assignments[ai].refId = e.target.value; setPages(n); }}>
                              {settings.characterReferences.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                            <button onClick={() => { const n = [...pages]; n[idx].assignments.splice(ai, 1); setPages(n); }} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                          </div>
                        ))}
                        {page.assignments.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4">Identity mapping optional - AI will use general prompt if empty.</p>}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                       <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Detected Script</label>
                       <textarea className="w-full bg-transparent border-none rounded-xl text-xs font-medium text-slate-600 outline-none min-h-[60px] resize-none" value={page.originalText} onChange={(e) => setPages(pages.map(p => p.id === page.id ? {...p, originalText: e.target.value} : p))} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-xl border-t border-slate-200 p-8 z-50 flex justify-between max-w-5xl mx-auto rounded-t-[3rem] shadow-2xl">
              <button onClick={() => setCurrentStep('settings')} className="px-10 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-2 transition-all"><ChevronLeft size={20} /> Back</button>
              <button onClick={processBulk} className="bg-indigo-600 text-white px-12 py-4 rounded-2xl font-bold flex items-center gap-3 hover:bg-indigo-700 shadow-2xl transition-all scale-110 active:scale-100">
                <Sparkles size={20} /> Begin Production Restyle
              </button>
            </div>
          </div>
        );
      case 'generate':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-28">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-2 text-slate-900">5. Review & High-Res Export</h2>
              <p className="text-slate-500">Wait for final rendering before generating your print-ready PDF.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {pages.map((page, idx) => (
                <div key={page.id} className="bg-white rounded-[3rem] border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition-all group">
                  <div className={`aspect-square relative bg-slate-50 overflow-hidden ${page.isSpread ? 'ring-4 ring-indigo-200' : ''}`}>
                    <img src={page.processedImage || page.originalImage} className={`w-full h-full object-cover transition-all duration-1000 ${page.status === 'processing' ? 'blur-3xl opacity-50' : ''}`} />
                    {page.status === 'processing' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-[0.2em]">Styling Page {idx+1}...</span>
                      </div>
                    )}
                    <div className="absolute top-6 left-6 bg-black/60 text-white text-[10px] px-4 py-2 rounded-full font-bold backdrop-blur-md shadow-lg">PG {idx+1} {page.isSpread ? '(Panorama)' : ''}</div>
                  </div>
                  <div className="p-6 flex items-center justify-between border-t border-slate-50">
                     <div className="flex items-center gap-3">
                        {page.status === 'completed' ? <CheckCircle2 className="text-green-500" size={20} /> : page.status === 'error' ? <AlertCircle className="text-red-500" size={20} /> : <Loader2 className="animate-spin text-indigo-400" size={20} />}
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{page.status}</span>
                     </div>
                     {page.status === 'completed' && <span className="text-[10px] text-green-600 font-bold uppercase bg-green-50 px-3 py-1 rounded-full">Final Ready</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="fixed bottom-0 inset-x-0 bg-slate-900 text-white p-10 shadow-2xl z-50 rounded-t-[4rem]">
               <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-8">
                  <div className="space-y-2">
                     <div className="flex items-center gap-4"><BookOpen className="text-indigo-400" size={32} /><span className="text-2xl font-bold uppercase tracking-tight">{PRINT_FORMATS[settings.exportFormat].name}</span></div>
                     <div className="flex gap-4">
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-[0.2em]">{settings.spreadExportMode} Mode</span>
                        <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-[0.2em]">Industrial Gutter Enabled</span>
                     </div>
                  </div>
                  <button 
                    disabled={isProcessing || !pages.every(p => p.status === 'completed')} 
                    onClick={() => generateBookPDF(pages, settings.exportFormat, "Production_Interior_Export", !settings.embedTextInImage && settings.targetLanguage !== 'NONE_CLEAN_BG', settings.estimatedPageCount, settings.spreadExportMode)} 
                    className="bg-indigo-600 text-white px-14 py-6 rounded-3xl font-bold flex items-center gap-4 hover:bg-indigo-500 shadow-2xl transition-all scale-110 active:scale-100 disabled:opacity-50 disabled:scale-100"
                  >
                    <Download size={28} /> Export Industrial PDF
                  </button>
               </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 selection:bg-indigo-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><Sparkles size={24} /></div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">StoryFlow <span className="text-indigo-600">Pro</span></h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em]">Production Grade Illustration Suite</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
            {(['upload', 'characters', 'settings', 'mapping', 'generate'] as Step[]).map((s, i) => (
              <React.Fragment key={s}>
                <div 
                  onClick={() => !isProcessing && currentStep !== 'generate' && setCurrentStep(s)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all cursor-pointer ${currentStep === s ? 'bg-indigo-600 text-white scale-110 shadow-lg ring-4 ring-indigo-50' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                >
                  {i + 1}
                </div>
                {i < 4 && <div className={`w-6 h-[3px] rounded-full ${i < (['upload', 'characters', 'settings', 'mapping', 'generate'].indexOf(currentStep)) ? 'bg-indigo-600' : 'bg-slate-100'}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12">{renderStep()}</main>
      <footer className="py-16 text-center text-slate-400">
         <div className="flex items-center justify-center gap-10 mb-6 opacity-30 grayscale">
            <span className="font-bold text-xs uppercase tracking-widest">KDP Certified</span>
            <span className="font-bold text-xs uppercase tracking-widest">Lulu Production</span>
            <span className="font-bold text-xs uppercase tracking-widest">IngramSpark Ready</span>
         </div>
         <p className="text-[10px] font-bold uppercase tracking-widest">StoryFlow Industrial Book Suite © 2024</p>
      </footer>
    </div>
  );
};

export default App;
