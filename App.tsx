
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, Sparkles, BookOpen, Download, Trash2, Save,
  Loader2, AlertCircle, CheckCircle2, ChevronRight, 
  ChevronLeft, Plus, MapPin, Layers, Palette, Columns, Wand2, Edit3, RefreshCw, X, Rocket, Clock, Cloud, FolderOpen, MoreVertical, Maximize2, Zap, FileText, ClipboardList, UserCheck, Layout, Info, Image as ImageIcon, Heart, LogIn, LogOut, User, Lock, Mail, DatabaseZap, Database, Globe, ArrowRight, ShieldCheck, Link2, Settings2, KeyRound, FileUp, FileDown, Monitor, MessageSquareCode, Scissors, ToggleLeft as Toggle, Settings, Check, Frame, BookMarked, Megaphone, QrCode, FileCheck, Ruler, Book, PenTool, Eraser, Maximize, Eye, EyeOff, Grid, TrendingUp, Key
} from 'lucide-react';
import JSZip from 'jszip';
import { BookPage, AppSettings, PRINT_FORMATS, CharacterRef, CharacterAssignment, AppMode, Project, SeriesPreset, ExportFormat, Hotspot, CharacterRetargeting, BookLayer } from './types';
import { auth, signInWithGoogle, logout, checkUserAllowed, checkIsAdmin } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { restyleIllustration, translateText, extractTextFromImage, analyzeStyleFromImage, identifyAndDesignCharacters, planStoryScenes, upscaleIllustration, parsePromptPack, refineIllustration, generateBookCover, parseActivityPack, retargetCharacters, generateLayeredIllustration, refineLayeredIllustration, generateLayeredCover, separateIllustrationIntoLayers } from './geminiService';
import { searchBookNiches } from './nicheService';
import Markdown from 'react-markdown';
import { generateBookPDF, generateCoverPDF } from './utils/pdfGenerator';
import { exportProjectAssetsForCanva } from './utils/exportUtils';
import { persistenceService } from './persistenceService';
import { SERIES_PRESETS, GLOBAL_STYLE_LOCK } from './seriesData';
import { getInsideMargin } from './kdpConfig';
import { KdpPdfFixer } from './components/KdpPdfFixer';
import { AdminModal } from './components/AdminModal';

type Step = 'landing' | 'upload' | 'restyle-editor' | 'script' | 'prompt-pack' | 'characters' | 'generate' | 'direct-upscale' | 'cover-master' | 'production-layout' | 'activity-builder' | 'retarget-editor' | 'niche-research' | 'kdp-fixer';

const SpreadGuide = ({ isSpread, show, format, pageCount = 100 }: { isSpread: boolean, show: boolean, format: ExportFormat, pageCount?: number }) => {
  if (!show) return null;
  const config = PRINT_FORMATS[format] || PRINT_FORMATS.KDP_8_5x8_5;
  
  // Calculate percentages based on the format dimensions
  const totalWidth = isSpread ? config.width * 2 : config.width;
  const totalHeight = config.height;
  
  const bleedX = (config.bleed / totalWidth) * 100;
  const bleedY = (config.bleed / totalHeight) * 100;
  
  const safeTop = (config.top / totalHeight) * 100;
  const safeBottom = (config.bottom / totalHeight) * 100;
  const safeOutside = (config.outside / totalWidth) * 100;
  
  const actualGutter = format.startsWith('KDP_') ? getInsideMargin(pageCount) : config.baseGutter;
  const safeInside = (actualGutter / totalWidth) * 100;
  
  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {/* Bleed Area Overlay */}
      <div 
        className="absolute border-red-500/20" 
        style={{
          top: 0, left: 0, right: 0, bottom: 0,
          borderTopWidth: `${bleedY}%`,
          borderBottomWidth: `${bleedY}%`,
          borderLeftWidth: `${bleedX}%`,
          borderRightWidth: `${bleedX}%`,
        }}
      />
      <div className="absolute top-2 right-2 text-red-500/60 font-black text-[6px] uppercase tracking-widest">Bleed Zone</div>

      {/* Gutter / Fold */}
      {isSpread && (
        <>
          <div className="absolute inset-y-0 left-1/2 w-[2px] bg-red-500/40 border-l border-dashed border-white/50" />
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest shadow-lg whitespace-nowrap">Gutter / Fold</div>
        </>
      )}
      
      {/* Safe Margins Guide */}
      <div 
        className="absolute border-2 border-dashed border-indigo-500/50 rounded-sm"
        style={{
          top: `${safeTop}%`,
          bottom: `${safeBottom}%`,
          left: isSpread ? `${safeOutside}%` : `${safeInside}%`,
          right: isSpread ? `${safeOutside}%` : `${safeOutside}%`,
        }}
      />
      {isSpread && (
        <div 
          className="absolute border-2 border-dashed border-indigo-500/50 rounded-sm"
          style={{
            top: `${safeTop}%`,
            bottom: `${safeBottom}%`,
            left: `50%`,
            right: `${safeOutside}%`,
            marginLeft: `${safeInside}%`
          }}
        />
      )}
      {isSpread && (
        <div 
          className="absolute border-2 border-dashed border-indigo-500/50 rounded-sm"
          style={{
            top: `${safeTop}%`,
            bottom: `${safeBottom}%`,
            left: `${safeOutside}%`,
            right: `50%`,
            marginRight: `${safeInside}%`
          }}
        />
      )}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest shadow-lg whitespace-nowrap">Safe Text Area</div>
    </div>
  );
};

const LayerManager = ({ layers, onToggle }: { layers?: any[], onToggle: (id: string) => void }) => {
  if (!layers || layers.length === 0) return null;
  return (
    <div className="mt-6 space-y-3">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-4">Production Layers</h4>
      <div className="flex flex-wrap gap-2 px-2">
        {layers.map(layer => (
          <button 
            key={layer.id} 
            onClick={() => onToggle(layer.id)}
            className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] transition-all flex items-center gap-2 ${layer.isVisible ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100 text-slate-300 opacity-50'}`}
          >
            {layer.isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
            {layer.name}
          </button>
        ))}
      </div>
    </div>
  );
};

const PREDEFINED_STYLES = [
  {
    id: 'style-1',
    name: 'Classic Storybook',
    image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&q=80&w=400&h=400',
    prompt: 'classic children’s book illustration, soft painterly textures, whimsical, rounded shapes, warm inviting lighting, highly detailed but stylized'
  },
  {
    id: 'style-2',
    name: 'Vibrant & Playful',
    image: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&q=80&w=400&h=400',
    prompt: 'vibrant children’s book illustration, bright bold colors, playful and energetic, flat shading with subtle gradients, cute proportions'
  },
  {
    id: 'style-3',
    name: 'Watercolor Magic',
    image: 'https://images.unsplash.com/photo-1580136608260-4eb11f4b24fe?auto=format&fit=crop&q=80&w=400&h=400',
    prompt: 'whimsical watercolor children’s book illustration, visible paper texture, soft color bleeds, magical atmosphere, loose brushstrokes, dreamy lighting'
  },
  {
    id: 'style-4',
    name: 'Soft Pastel',
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=400&h=400',
    prompt: 'soft pastel children’s book illustration, gentle glow lighting, warm pastel palette, minimal outlines, soothing and calm mood, dreamy'
  }
];

const getAvailableSteps = (mode: AppMode): { id: Step, label: string }[] => {
  switch (mode) {
    case 'create':
      return [
        { id: 'script', label: 'Narrative' },
        { id: 'prompt-pack', label: 'Prompts' },
        { id: 'characters', label: 'Cast' },
        { id: 'generate', label: 'Production' },
        { id: 'production-layout', label: 'Interior' },
        { id: 'cover-master', label: 'Cover' }
      ];
    case 'restyle':
      return [
        { id: 'upload', label: 'Upload' },
        { id: 'restyle-editor', label: 'Restyle' },
        { id: 'characters', label: 'Cast' },
        { id: 'generate', label: 'Production' },
        { id: 'production-layout', label: 'Interior' },
        { id: 'cover-master', label: 'Cover' }
      ];
    case 'activity-builder':
      return [
        { id: 'activity-builder', label: 'Activity' },
        { id: 'generate', label: 'Production' },
        { id: 'production-layout', label: 'Interior' },
        { id: 'cover-master', label: 'Cover' }
      ];
    case 'retarget':
      return [
        { id: 'upload', label: 'Upload' },
        { id: 'retarget-editor', label: 'Retarget' },
        { id: 'generate', label: 'Production' }
      ];
    case 'upscale':
      return [
        { id: 'direct-upscale', label: 'Upscale' }
      ];
    case 'niche-research':
      return [
        { id: 'niche-research', label: 'Research' }
      ];
    default:
      return [];
  }
};

const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>('landing');
  const [projectId, setProjectId] = useState<string>(Math.random().toString(36).substring(7));
  const [projectName, setProjectName] = useState<string>("Untitled Project");
  const [pages, setPages] = useState<BookPage[]>([]);
  const [fullScript, setFullScript] = useState("");
  const [enableActivityDesigner, setEnableActivityDesigner] = useState(false);
  const [activityScript, setActivityScript] = useState("");
  const [projectContext, setProjectContext] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverLayers, setCoverLayers] = useState<BookLayer[]>([]);
  const [selectedCoverCharIds, setSelectedCoverCharIds] = useState<Set<string>>(new Set());
  
  // Niche Research State
  const [nicheTopic, setNicheTopic] = useState("");
  const [nicheResult, setNicheResult] = useState("");
  const [isSearchingNiche, setIsSearchingNiche] = useState(false);
  
  // Production Config
  const [globalFixPrompt, setGlobalFixPrompt] = useState("Keep character facial features and clothing consistent with reference images.");
  const [targetAspectRatio, setTargetAspectRatio] = useState<'1:1' | '4:3' | '16:9' | '9:16'>('4:3');
  const [targetResolution, setTargetResolution] = useState<'1K' | '2K' | '4K'>('1K');
  const [showBibleEditor, setShowBibleEditor] = useState(false);
  
  // The Advanced Fixer State
  const [activeFixId, setActiveFixId] = useState<string | null>(null);
  const [fixInstruction, setFixInstruction] = useState("");
  const [selectedRefIds, setSelectedRefIds] = useState<Set<string>>(new Set());
  const [fixMode, setFixMode] = useState<'targeted' | 'outpaint' | 'separate-layers'>('targeted');

  // Character Retargeting State
  const [activeRetargetId, setActiveRetargetId] = useState<string | null>(null);
  const [retargetSourceImage, setRetargetSourceImage] = useState<string | null>(null);
  const [retargetInstruction, setRetargetInstruction] = useState("");
  const [activeHotspotLabel, setActiveHotspotLabel] = useState(1);

  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [userStyles, setUserStyles] = useState<import('./types').UserStyle[]>([]);
  const [recentProject, setRecentProject] = useState<Project | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [showAdminModal, setShowAdminModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const isAllowed = await checkUserAllowed(currentUser.email);
        if (!isAllowed) {
          await logout();
          setAuthError("Your email is not authorized to access this app. Please contact the administrator.");
          setUser(null);
          setIsAdmin(false);
          setIsAuthReady(true);
          return;
        }
        
        const adminStatus = await checkIsAdmin(currentUser.email);
        setIsAdmin(adminStatus);
        
        setAuthError(null);
        setUser(currentUser);
        setIsAuthReady(true);
        const projs = await persistenceService.getAllProjects();
        if (projs.length > 0) {
          setRecentProject(projs[0]);
        }
        const styles = await persistenceService.getUserStyles();
        setUserStyles(styles);
      } else {
        setUser(null);
        setIsAdmin(false);
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleOpenProjects = async () => {
    const projs = await persistenceService.getAllProjects();
    setSavedProjects(projs);
    setShowProjectsModal(true);
  };

  const handleLoadProject = (proj: Project) => {
    setProjectId(proj.id);
    setProjectName(proj.name);
    setSettings(proj.settings);
    setPages(proj.pages);
    setFullScript(proj.fullScript || "");
    setActivityScript(proj.activityScript || "");
    setNicheTopic(proj.nicheTopic || "");
    setNicheResult(proj.nicheResult || "");
    setCoverImage(proj.coverImage || null);
    setCoverLayers(proj.coverLayers || []);
    setProjectContext(proj.projectContext || "");
    setEnableActivityDesigner(proj.enableActivityDesigner || false);
    setGlobalFixPrompt(proj.globalFixPrompt || "Keep character facial features and clothing consistent with reference images.");
    setTargetAspectRatio(proj.targetAspectRatio || '4:3');
    setTargetResolution(proj.targetResolution || '1K');
    setShowProjectsModal(false);
    setCurrentStep((proj.currentStep as Step) || 'restyle-editor');
  };

  const retargetSourceInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<AppSettings>({
    mode: 'restyle',
    targetStyle: 'soft vibrant children’s storybook illustration, painterly, rounded shapes, big expressive eyes, gentle glow lighting, warm pastel palette, minimal outlines',
    targetLanguage: 'NONE_CLEAN_BG',
    exportFormat: 'KDP_8_5x8_5',
    spreadExportMode: 'WIDE_SPREAD',
    useProModel: true,
    embedTextInImage: false,
    layeredMode: false,
    overlayText: false,
    showSafeGuides: true,
    characterReferences: [],
    estimatedPageCount: 32,
    masterBible: GLOBAL_STYLE_LOCK
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);
  const restyleInputRef = useRef<HTMLInputElement>(null);
  const charImageInputRef = useRef<HTMLInputElement>(null);
  const styleImageInputRef = useRef<HTMLInputElement>(null);
  const [activeCharId, setActiveCharId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = pages.length;
    const completed = pages.filter(p => p.status === 'completed').length;
    return { total, completed, progress: total === 0 ? 0 : Math.round((completed / total) * 100) };
  }, [pages]);

  // Persistence
  const handleSaveProject = async () => {
    const project: Project = { 
      id: projectId, 
      name: projectName, 
      lastModified: Date.now(), 
      settings, 
      pages, 
      thumbnail: pages.find(p => p.processedImage)?.processedImage || pages[0]?.originalImage,
      currentStep,
      fullScript,
      activityScript,
      nicheTopic,
      nicheResult,
      coverImage,
      coverLayers,
      projectContext,
      enableActivityDesigner,
      globalFixPrompt,
      targetAspectRatio,
      targetResolution
    };
    try { await persistenceService.saveProject(project); } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!isAuthReady || !user || currentStep === 'landing') return;
    const timeoutId = setTimeout(() => {
      handleSaveProject();
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [pages, currentStep, settings, fullScript, activityScript, nicheTopic, nicheResult, coverImage, coverLayers, projectName, projectContext, enableActivityDesigner, globalFixPrompt, targetAspectRatio, targetResolution]);

  useEffect(() => {
    const isGenerating = isProcessing || pages.some(p => p.status === 'processing');
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isGenerating) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing, pages]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
      </div>
    );
  }

  const handleSignIn = async () => {
    try {
      setAuthError(null);
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Sign in error:", error);
      setAuthError(error.message || "Failed to sign in. Please try again.");
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl max-w-md w-full text-center space-y-8">
          <div className="w-24 h-24 bg-indigo-600 rounded-full mx-auto flex items-center justify-center text-white shadow-xl">
            <Lock size={40} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 mb-4">StoryFlow Pro</h1>
            <p className="text-slate-500 font-medium">Please sign in to access your projects and generate illustrations.</p>
          </div>
          {authError && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
              {authError}
            </div>
          )}
          <button 
            onClick={handleSignIn}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-3 shadow-lg"
          >
            <LogIn size={24} /> Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const handleExportProjectFile = () => {
    const project: Project = { 
      id: projectId, 
      name: projectName, 
      lastModified: Date.now(), 
      settings, 
      pages,
      currentStep,
      fullScript,
      activityScript,
      nicheTopic,
      nicheResult,
      coverImage,
      coverLayers,
      projectContext,
      enableActivityDesigner,
      globalFixPrompt,
      targetAspectRatio,
      targetResolution
    };
    const blob = new window.Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}.storyflow`;
    a.click();
  };

  const handleImportProjectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const project: Project = JSON.parse(event.target?.result as string);
        await persistenceService.saveProject(project);
        setProjectId(project.id);
        setProjectName(project.name);
        setSettings(project.settings);
        setPages(project.pages);
        setCurrentStep((project.currentStep as Step) || 'restyle-editor');
        setFullScript(project.fullScript || "");
        setActivityScript(project.activityScript || "");
        setNicheTopic(project.nicheTopic || "");
        setNicheResult(project.nicheResult || null);
        setCoverImage(project.coverImage || null);
        setCoverLayers(project.coverLayers || []);
        setProjectContext(project.projectContext || "");
        setEnableActivityDesigner(project.enableActivityDesigner || false);
        setGlobalFixPrompt(project.globalFixPrompt || "");
        setTargetAspectRatio((project.targetAspectRatio as any) || '4:3');
        setTargetResolution((project.targetResolution as any) || '1K');
        showToast("Project imported successfully!");
      } catch (err) {
        console.error(err);
        showToast("Failed to import project file.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleDownloadLayers = async (page: BookPage, index: number) => {
    if (!page.layers || page.layers.length === 0) return;
    const zip = new JSZip();
    page.layers.forEach((layer, i) => {
      const base64Data = layer.image.split(',')[1];
      zip.file(`${i + 1}_${layer.name.replace(/\s+/g, '_')}.png`, base64Data, { base64: true });
    });
    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `page_${index + 1}_layers.zip`;
    a.click();
  };

  // Logic Handlers
  const handleNicheSearch = async () => {
    if (!nicheTopic) return;
    setIsSearchingNiche(true);
    try {
      const result = await searchBookNiches(nicheTopic);
      setNicheResult(result);
    } catch (e) {
      showToast("Niche research failed.");
    } finally {
      setIsSearchingNiche(false);
    }
  };

  const handlePlanStory = async () => {
    if (!fullScript) return;
    setIsParsing(true);
    try {
      const result = await planStoryScenes(fullScript, settings.characterReferences, enableActivityDesigner);
      if (result.globalInstructions) {
        setSettings(prev => ({ 
          ...prev, 
          masterBible: `${result.globalInstructions}\n\n${prev.masterBible}`
        }));
      }
      setPages(prev => [...prev, ...result.pages.map(p => ({
        id: Math.random().toString(36).substring(7),
        originalText: p.text,
        status: 'idle' as const,
        assignments: p.mappedCharacterNames.map(name => ({ refId: name, description: "" })),
        isSpread: p.isSpread,
        overrideStylePrompt: p.fullPrompt || p.text
      }))]);
      setCurrentStep('characters');
    } catch (e) { showToast("Script analysis failed."); }
    finally { setIsParsing(false); }
  };

  const handlePlanActivities = async () => {
    if (!activityScript) return;
    setIsParsing(true);
    try {
      const result = await parseActivityPack(activityScript);
      setSettings(prev => ({ ...prev, masterBible: `${result.globalInstructions}\n\n${prev.masterBible}` }));
      setPages(prev => [...prev, ...result.spreads.map(s => ({
        id: Math.random().toString(36).substring(7),
        originalText: s.title,
        status: 'idle' as const,
        assignments: [],
        isSpread: true,
        overrideStylePrompt: s.fullPrompt
      }))]);
      setTargetAspectRatio('16:9'); // Activities are typically spreads
      setCurrentStep('characters');
    } catch (e) { showToast("Activity analysis failed."); }
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

  const handleStyleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsAnalyzingStyle(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
        if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
        
        const stylePrompt = await analyzeStyleFromImage(base64);
        
        const newStyle: import('./types').UserStyle = {
          id: Date.now().toString(),
          name: file.name.split('.')[0] || 'Custom Style',
          image: base64,
          prompt: stylePrompt,
          createdAt: Date.now()
        };
        
        await persistenceService.saveUserStyle(newStyle);
        setUserStyles(prev => [newStyle, ...prev]);

        setSettings(prev => ({
          ...prev,
          styleReference: base64,
          masterBible: `STYLE LOCK (From Uploaded Reference): ${stylePrompt}\n\n${prev.masterBible}`
        }));
      } catch (error) {
        console.error("Style analysis failed:", error);
        showToast("Failed to analyze style. Please try again.");
      } finally {
        setIsAnalyzingStyle(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const renderScene = async (pageId: string) => {
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    setPages(curr => curr.map(p => p.id === pageId ? { ...p, status: 'processing' } : p));
    setIsProcessing(true);
    try {
      const p = pages.find(pg => pg.id === pageId)!;
      const narrativeContext = p.originalText ? `SCENE SCRIPT: "${p.originalText}". ${globalFixPrompt}` : (p.overrideStylePrompt || settings.targetStyle);
      
      let result;
      let layers;
      const targetText = settings.embedTextInImage ? p.originalText : undefined;
      const finalAspectRatio = p.isSpread ? (targetAspectRatio === '9:16' ? '16:9' : targetAspectRatio === '4:3' ? '16:9' : targetAspectRatio) : targetAspectRatio;

      if (settings.layeredMode && !p.originalImage) {
        const layeredResult = await generateLayeredIllustration(
          p.overrideStylePrompt || narrativeContext,
          settings.characterReferences,
          settings.masterBible,
          projectContext,
          finalAspectRatio,
          targetResolution,
          targetText,
          p.isSpread,
          settings.exportFormat,
          settings.estimatedPageCount
        );
        result = layeredResult.composite;
        layers = layeredResult.layers;
      } else if (settings.mode === 'upscale' && p.originalImage) {
        result = await upscaleIllustration(p.originalImage, narrativeContext, p.isSpread, targetResolution, finalAspectRatio);
      } else if (p.originalImage) {
        const others = pages.filter(pg => pg.id !== pageId && pg.processedImage).slice(0, 3).map(pg => ({ base64: pg.processedImage!, index: pages.indexOf(pg) + 1 }));
        result = await refineIllustration(p.originalImage, narrativeContext, others, p.isSpread, targetResolution, settings.masterBible, projectContext, settings.characterReferences, finalAspectRatio, targetText, settings.exportFormat, settings.estimatedPageCount);
      } else {
        // For activities, use the specific spread prompt as the primary instruction
        const promptToUse = p.overrideStylePrompt || narrativeContext;
        result = await restyleIllustration(undefined, promptToUse, undefined, targetText, settings.characterReferences, [], true, false, p.isSpread, settings.masterBible, targetResolution, projectContext, finalAspectRatio, settings.exportFormat, settings.estimatedPageCount);
      }
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'completed', processedImage: result, layers: layers || pg.layers } : pg));
    } catch (e) { 
      console.error("Render error:", e);
      setPages(curr => curr.map(pg => pg.id === pageId ? { ...pg, status: 'error' } : pg)); 
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyAdvancedFix = async () => {
    if (!activeFixId) return;
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
    
    setPages(curr => curr.map(p => p.id === activeFixId ? { ...p, status: 'processing' } : p));
    setIsProcessing(true);
    const targetId = activeFixId;
    setActiveFixId(null);

    try {
      const p = pages.find(pg => pg.id === targetId)!;
      const targetImg = p.processedImage || p.originalImage!;
      
      const selectedRefs = pages.filter(pg => selectedRefIds.has(pg.id) && (pg.processedImage || pg.originalImage))
                                .map(pg => ({ base64: (pg.processedImage || pg.originalImage)!, index: pages.indexOf(pg) + 1 }));

      let finalPrompt = fixInstruction;
      let finalRatio = targetAspectRatio;
      
      if (fixMode === 'outpaint') {
        finalRatio = p.isSpread ? "4:3" : "16:9";
        finalPrompt = `OUTPAINTING TASK: Expand the canvas to ${finalRatio}. Intelligently fill new space to the left and right while keeping the original composition in the center. Request: ${fixInstruction || 'No specific fix, just outpaint.'}`;
      } else if (fixMode === 'separate-layers') {
        finalPrompt = `LAYER SEPARATION TASK: Separate the illustration into distinct layers. ${fixInstruction}`;
      } else {
        finalPrompt = `FIX TASK: ${fixInstruction}. Narrative context: "${p.originalText || 'General Scene'}".`;
      }

      const targetText = settings.embedTextInImage ? p.originalText : undefined;
      
      let res;
      let layers;

      if (fixMode === 'separate-layers') {
        const layeredRes = await separateIllustrationIntoLayers(targetImg, finalPrompt, selectedRefs, p.isSpread, targetResolution, settings.masterBible, projectContext, settings.characterReferences, finalRatio, targetText, settings.exportFormat, settings.estimatedPageCount);
        res = layeredRes.composite;
        layers = layeredRes.layers;
      } else if (settings.layeredMode) {
        const layeredRes = await refineLayeredIllustration(targetImg, finalPrompt, selectedRefs, fixMode === 'outpaint' ? !p.isSpread : p.isSpread, targetResolution, settings.masterBible, projectContext, settings.characterReferences, finalRatio, targetText, settings.exportFormat, settings.estimatedPageCount);
        res = layeredRes.composite;
        layers = layeredRes.layers;
      } else {
        res = await refineIllustration(targetImg, finalPrompt, selectedRefs, fixMode === 'outpaint' ? !p.isSpread : p.isSpread, targetResolution, settings.masterBible, projectContext, settings.characterReferences, finalRatio, targetText, settings.exportFormat, settings.estimatedPageCount);
      }
      
      setPages(curr => curr.map(pg => pg.id === targetId ? { 
        ...pg, 
        status: 'completed', 
        processedImage: res,
        layers: layers || pg.layers,
        isSpread: fixMode === 'outpaint' ? !pg.isSpread : pg.isSpread 
      } : pg));
      
      setFixInstruction("");
      setSelectedRefIds(new Set());
      setFixMode('targeted');
    } catch (e) {
      console.error("Advanced fix error:", e);
      setPages(curr => curr.map(pg => pg.id === targetId ? { ...pg, status: 'error' } : pg));
    } finally {
      setIsProcessing(false);
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
    
    try {
      const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
      if (!hasKey) { 
        await (window as any).aistudio?.openSelectKey(); 
        // Re-check after opening
        const stillNoKey = !await (window as any).aistudio?.hasSelectedApiKey();
        if (stillNoKey) return;
      }

      const targetId = activeRetargetId;
      setIsProcessing(true);
      setPages(curr => curr.map(p => p.id === targetId ? { ...p, status: 'processing' } : p));
      setCurrentStep('generate');
      setActiveRetargetId(null);

      const p = pages.find(pg => pg.id === targetId)!;
      const targetImg = p.processedImage || p.originalImage!;
      const retargeting = p.retargeting || { sourceHotspots: [], targetHotspots: [], instruction: "" };

      const res = await retargetCharacters(
        retargetSourceImage,
        targetImg,
        { 
          sourceHotspots: retargeting.sourceHotspots, 
          targetHotspots: retargeting.targetHotspots, 
          instruction: retargetInstruction 
        },
        targetResolution,
        p.isSpread ? (targetAspectRatio === '9:16' ? '16:9' : targetAspectRatio === '4:3' ? '16:9' : targetAspectRatio) : targetAspectRatio
      );

      setPages(curr => curr.map(pg => pg.id === targetId ? { ...pg, status: 'completed', processedImage: res } : pg));
      setRetargetSourceImage(null);
      setRetargetInstruction("");
    } catch (e) {
      console.error("Retargeting error:", e);
      const targetId = activeRetargetId;
      if (targetId) {
        setPages(curr => curr.map(pg => pg.id === targetId ? { ...pg, status: 'error' } : pg));
      }
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
              {recentProject && (
                <button onClick={() => handleLoadProject(recentProject)} className="group p-10 bg-indigo-50 border-2 border-indigo-200 rounded-[4rem] text-left hover:border-indigo-600 hover:shadow-2xl transition-all relative overflow-hidden md:col-span-2 lg:col-span-3 flex items-center gap-8">
                  <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform"><FolderOpen size={40} /></div>
                  <div>
                    <h4 className="text-3xl font-black mb-2 text-slate-900">Resume Project: {recentProject.name}</h4>
                    <p className="text-indigo-600 font-medium text-lg">Pick up right where you left off. All your generated pages and settings are saved.</p>
                  </div>
                </button>
              )}
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
              <button onClick={() => setCurrentStep('niche-research')} className="group p-10 bg-white border-2 border-rose-100 rounded-[4rem] text-left hover:border-rose-600 hover:shadow-2xl transition-all relative overflow-hidden">
                <div className="w-16 h-16 bg-rose-50 rounded-3xl flex items-center justify-center mb-8 text-rose-600 group-hover:scale-110 transition-transform"><TrendingUp size={32} /></div>
                <h4 className="text-2xl font-black mb-3 text-slate-900">Niche Research</h4>
                <p className="text-slate-400 font-medium">Analyze market demand, competition, and profitability for book ideas.</p>
              </button>
              <button onClick={() => { setSettings({...settings, mode: 'kdp-fixer'}); setCurrentStep('kdp-fixer'); }} className="group p-10 bg-white border-2 border-emerald-100 rounded-[4rem] text-left hover:border-emerald-600 hover:shadow-2xl transition-all relative overflow-hidden">
                <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center mb-8 text-emerald-600 group-hover:scale-110 transition-transform"><FileText size={32} /></div>
                <h4 className="text-2xl font-black mb-3 text-slate-900">KDP PDF Fixer</h4>
                <p className="text-slate-400 font-medium">Upload a rejected PDF and KDP notes to automatically fix bleed and margins.</p>
              </button>
            </div>
          </div>
        );

      case 'kdp-fixer':
        return <KdpPdfFixer onBack={() => setCurrentStep('landing')} />;

      case 'niche-research':
        return (
          <div className="max-w-5xl mx-auto py-20 px-8 space-y-12 animate-in slide-in-from-bottom duration-500">
            <div className="text-center space-y-4">
              <h2 className="text-6xl font-black text-slate-900">Niche Research</h2>
              <p className="text-slate-500 text-xl font-medium">Discover high-demand, low-competition book ideas.</p>
            </div>
            
            <div className="bg-white border-2 border-slate-100 rounded-[3rem] p-12 shadow-2xl space-y-8">
              <div className="space-y-4">
                <h4 className="text-sm font-black uppercase text-rose-600 tracking-widest">Target Topic or Keyword</h4>
                <div className="flex gap-4">
                  <input 
                    type="text"
                    className="flex-1 bg-slate-50 border-none rounded-[2rem] px-8 py-6 text-xl font-bold outline-none focus:ring-4 focus:ring-rose-100 transition-all"
                    placeholder="e.g. 'Dinosaurs', 'Toddler Activity Books', 'Bedtime Stories'"
                    value={nicheTopic}
                    onChange={e => setNicheTopic(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleNicheSearch()}
                  />
                  <button 
                    disabled={isSearchingNiche || !nicheTopic} 
                    onClick={handleNicheSearch} 
                    className="px-12 bg-rose-600 text-white rounded-[2rem] font-black text-xl shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-4"
                  >
                    {isSearchingNiche ? <Loader2 className="animate-spin" size={28} /> : <TrendingUp size={28} />} 
                    ANALYZE
                  </button>
                </div>
              </div>

              {nicheResult && (
                <div className="mt-12 pt-12 border-t-2 border-slate-100">
                  <div className="prose prose-lg prose-slate max-w-none prose-headings:font-black prose-h3:text-rose-600 prose-a:text-rose-600">
                    <Markdown>{nicheResult}</Markdown>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-center">
              <button onClick={() => setCurrentStep('landing')} className="py-6 px-12 bg-slate-100 text-slate-500 rounded-[2rem] font-black text-xl hover:bg-slate-200 transition-all">
                BACK TO DASHBOARD
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
                    <div className="flex justify-between items-center px-4">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Target Style / Scene Prompt</h3>
                      <div className="flex gap-2">
                        <button onClick={() => setSettings({...settings, targetStyle: 'soft vibrant children’s storybook illustration, painterly, rounded shapes, big expressive eyes, gentle glow lighting, warm pastel palette, minimal outlines'})} className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors shadow-sm">Soft Painterly</button>
                        <button onClick={() => {
                          setSettings({...settings, targetStyle: 'Flat vector illustration, SVG style, solid colors, clean crisp edges, no gradients, no shading, minimalist, 2D flat design, perfect for auto-tracing'});
                          setTargetResolution('4K'); // Ensure high resolution for vector tracing
                        }} className="text-[10px] font-black text-white bg-emerald-500 px-3 py-1.5 rounded-lg hover:bg-emerald-600 transition-colors shadow-sm flex items-center gap-1">
                          <Sparkles size={12} /> Flat Vector (Auto-Trace Ready)
                        </button>
                      </div>
                    </div>
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

                  {/* TEXT EMBEDDING CONTROL */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-4">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Text Rendering</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{settings.embedTextInImage ? 'ON' : 'OFF'}</span>
                        <button 
                          onClick={() => setSettings({...settings, embedTextInImage: !settings.embedTextInImage})}
                          className={`w-12 h-6 rounded-full transition-all relative ${settings.embedTextInImage ? 'bg-indigo-600' : 'bg-slate-200'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.embedTextInImage ? 'left-7' : 'left-1'}`} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 px-4 font-medium italic">If ON, AI will attempt to render the scene text directly into the illustration while respecting safe margins.</p>
                  </div>

                  {/* LAYERED MODE CONTROL */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-4">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Layered Production</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{settings.layeredMode ? 'ON' : 'OFF'}</span>
                        <button 
                          onClick={() => setSettings({...settings, layeredMode: !settings.layeredMode})}
                          className={`w-12 h-6 rounded-full transition-all relative ${settings.layeredMode ? 'bg-indigo-600' : 'bg-slate-200'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.layeredMode ? 'left-7' : 'left-1'}`} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 px-4 font-medium italic">If ON, AI generates separate layers for BG, Characters, and Text for professional compositing.</p>
                  </div>

                  {/* OVERLAY TEXT CONTROL */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-4">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Overlay Text in PDF</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{settings.overlayText ? 'ON' : 'OFF'}</span>
                        <button 
                          onClick={() => setSettings({...settings, overlayText: !settings.overlayText})}
                          className={`w-12 h-6 rounded-full transition-all relative ${settings.overlayText ? 'bg-indigo-600' : 'bg-slate-200'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.overlayText ? 'left-7' : 'left-1'}`} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 px-4 font-medium italic">If ON, the original text will be overlaid on the generated PDF pages.</p>
                  </div>

                  {/* SAFE GUIDES CONTROL */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-4">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Print Safe Guides</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{settings.showSafeGuides ? 'ON' : 'OFF'}</span>
                        <button 
                          onClick={() => setSettings({...settings, showSafeGuides: !settings.showSafeGuides})}
                          className={`w-12 h-6 rounded-full transition-all relative ${settings.showSafeGuides ? 'bg-indigo-600' : 'bg-slate-200'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.showSafeGuides ? 'left-7' : 'left-1'}`} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 px-4 font-medium italic">Show bleed, gutter, and safe text margins for print-ready layouts.</p>
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
                    <div className="aspect-[4/3] bg-slate-100 rounded-[3rem] overflow-hidden shadow-inner border-8 border-white relative">
                      {(p.processedImage || p.originalImage) && <img src={p.processedImage || p.originalImage} className="w-full h-full object-cover" />}
                      <SpreadGuide isSpread={p.isSpread} show={settings.showSafeGuides} format={settings.exportFormat} pageCount={settings.estimatedPageCount} />
                    </div>
                    {p.originalText && <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-4 italic leading-relaxed">"{p.originalText}"</p>}
                    {p.layers && p.layers.length > 0 && (
                      <LayerManager 
                        layers={p.layers} 
                        onToggle={(layerId) => {
                          const newLayers = p.layers!.map(l => l.id === layerId ? { ...l, isVisible: !l.isVisible } : l);
                          
                          // Re-composite
                          const canvas = document.createElement('canvas');
                          const ratio = p.isSpread ? (16/9) : (4/3);
                          canvas.width = 1024 * ratio;
                          canvas.height = 1024;
                          const ctx = canvas.getContext('2d')!;
                          
                          const visibleLayers = newLayers.filter(l => l.isVisible);
                          let loaded = 0;
                          const imgs = visibleLayers.map(l => {
                            const img = new Image();
                            img.onload = () => {
                              loaded++;
                              if (loaded === visibleLayers.length) {
                                const order = ['background', 'character', 'foreground', 'text'];
                                order.forEach(type => {
                                  const layer = visibleLayers.find(l => l.type === type);
                                  if (layer) {
                                    const idx = visibleLayers.indexOf(layer);
                                    ctx.drawImage(imgs[idx], 0, 0, canvas.width, canvas.height);
                                  }
                                });
                                setPages(curr => curr.map(pg => pg.id === p.id ? { ...pg, processedImage: canvas.toDataURL('image/png'), layers: newLayers } : pg));
                              }
                            };
                            img.src = l.image;
                            return img;
                          });
                        }}
                      />
                    )}
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
            
            <div className="flex items-center gap-4 px-4">
              <button 
                onClick={() => setEnableActivityDesigner(!enableActivityDesigner)}
                className={`w-14 h-8 rounded-full transition-colors relative ${enableActivityDesigner ? 'bg-indigo-600' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${enableActivityDesigner ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
              <div>
                <h4 className="font-black text-slate-900">Enable Activity Designer</h4>
                <p className="text-sm text-slate-500 font-medium">Extract global instructions and detailed prompts for activity pages.</p>
              </div>
            </div>

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
            {/* Style Lock Section */}
            <div className="space-y-10">
              <div className="text-center space-y-4">
                <h2 className="text-6xl font-black">Style Lock</h2>
                <p className="text-slate-500 text-xl font-medium">Choose a predefined style or analyze your own image to lock the series look.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {PREDEFINED_STYLES.map(style => (
                  <div 
                    key={style.id}
                    onClick={() => setSettings(s => ({ ...s, masterBible: `STYLE LOCK: ${style.prompt}\n\n${s.masterBible}` }))}
                    className="cursor-pointer group relative rounded-[3rem] overflow-hidden border-4 border-transparent hover:border-indigo-600 transition-all shadow-lg"
                  >
                    <img src={style.image} alt={style.name} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6 pt-20">
                      <h4 className="text-white font-black text-xl">{style.name}</h4>
                    </div>
                  </div>
                ))}
                {userStyles.map(style => (
                  <div 
                    key={style.id}
                    className="cursor-pointer group relative rounded-[3rem] overflow-hidden border-4 border-transparent hover:border-indigo-600 transition-all shadow-lg"
                  >
                    <img src={style.image} alt={style.name} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500" onClick={() => setSettings(s => ({ ...s, masterBible: `STYLE LOCK (From Uploaded Reference): ${style.prompt}\n\n${s.masterBible}`, styleReference: style.image }))} />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6 pt-20 pointer-events-none">
                      <h4 className="text-white font-black text-xl">{style.name}</h4>
                    </div>
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        await persistenceService.deleteUserStyle(style.id);
                        setUserStyles(prev => prev.filter(s => s.id !== style.id));
                      }}
                      className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm text-rose-500 p-2 rounded-full shadow-md hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="bg-white border-2 border-slate-100 rounded-[3rem] p-10 shadow-xl flex flex-col md:flex-row gap-8 items-center">
                <div className="flex-1 space-y-4">
                  <h3 className="text-2xl font-black text-slate-900">Analyze Custom Style</h3>
                  <p className="text-slate-500 font-medium">Upload an illustration you love. Our AI will analyze the medium, lighting, and mood to generate a perfect style lock prompt.</p>
                  
                  {settings.styleReference && (
                    <div className="relative w-32 h-32 rounded-2xl overflow-hidden border-4 border-indigo-100 shadow-md mb-4">
                      <img src={settings.styleReference} alt="Style Reference" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setSettings(s => ({ ...s, styleReference: undefined }))}
                        className="absolute top-1 right-1 bg-white text-red-500 p-1 rounded-full shadow-md hover:bg-red-50"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  <button 
                    onClick={() => styleImageInputRef.current?.click()}
                    disabled={isAnalyzingStyle}
                    className="px-8 py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black flex items-center gap-3 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  >
                    {isAnalyzingStyle ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
                    {isAnalyzingStyle ? 'ANALYZING...' : (settings.styleReference ? 'REPLACE STYLE IMAGE' : 'UPLOAD STYLE IMAGE')}
                  </button>
                  <input type="file" ref={styleImageInputRef} className="hidden" accept="image/*" onChange={handleStyleImageUpload} />
                </div>
                <div className="flex-[2] w-full">
                  <textarea 
                    className="w-full h-40 bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-6 text-sm font-bold outline-none shadow-inner focus:border-indigo-600 transition-colors leading-relaxed"
                    value={settings.masterBible}
                    onChange={e => setSettings({...settings, masterBible: e.target.value})}
                    placeholder="Global Style Lock Prompt..."
                  />
                </div>
              </div>
            </div>

            <hr className="border-2 border-slate-100 rounded-full" />

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
               <button 
                 onClick={() => {
                   if (settings.mode === 'activity-builder') {
                     processProductionBatch();
                   } else {
                     setCurrentStep('restyle-editor');
                   }
                 }} 
                 className="bg-indigo-600 text-white px-40 py-10 rounded-[3.5rem] font-black text-4xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-8"
               >
                 CONFIRM CAST <ChevronRight size={48} />
               </button>
            </div>
          </div>
        );

      case 'generate':
        return (
          <div className="max-w-7xl mx-auto py-16 px-8 space-y-20 pb-64">
            <div className="text-center space-y-4">
              <h2 className="text-6xl font-black">Production Dashboard</h2>
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="flex items-center gap-4">
                  <p className="text-slate-500 text-2xl font-medium">Refining {settings.mode === 'activity-builder' ? 'Activity Spreads' : 'Series Frames'} at {targetResolution}.</p>
                  {settings.mode === 'retarget' && (
                    <span className="px-4 py-1 bg-indigo-600 text-white text-xs font-black rounded-full animate-pulse">RETARGETING MODE</span>
                  )}
                </div>
                {!isProcessing && stats.progress < 100 && (
                  <button 
                    onClick={processProductionBatch}
                    className="mt-4 px-8 py-4 bg-emerald-500 text-white rounded-full font-black text-xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                  >
                    <Sparkles size={24} /> RESUME GENERATION
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
              {pages.map((p, idx) => (
                <div key={p.id} className="bg-white rounded-[6rem] border-4 border-slate-50 shadow-2xl overflow-hidden group transition-all">
                  <div className="aspect-[16/9] bg-slate-100 relative group overflow-hidden">
                     {(p.processedImage || p.originalImage) && <img src={p.processedImage || p.originalImage} className={`w-full h-full object-cover transition-all duration-1000 ${p.status === 'processing' ? 'opacity-30 blur-2xl scale-110' : 'opacity-100'}`} />}
                     <SpreadGuide isSpread={p.isSpread} show={settings.showSafeGuides} format={settings.exportFormat} pageCount={settings.estimatedPageCount} />
                     {p.status === 'processing' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-600/10"><Loader2 size={80} className="animate-spin text-indigo-600" /></div>}
                     {p.status === 'error' && (
                       <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50/90 backdrop-blur-sm p-8 text-center">
                         <AlertCircle size={64} className="text-red-500 mb-4" />
                         <p className="text-red-600 font-black uppercase tracking-widest text-sm">Render Failed</p>
                         <p className="text-red-400 text-xs font-medium mt-2">Check your API key or try a simpler prompt.</p>
                       </div>
                     )}
                     <div className="absolute top-12 left-12 z-10 w-20 h-20 bg-slate-900 text-white rounded-[2rem] flex items-center justify-center font-black text-4xl shadow-2xl">#{idx + 1}</div>
                     <div className="absolute top-12 right-12 z-10 bg-emerald-500 text-white px-8 py-3 rounded-full font-black text-sm shadow-2xl">{targetResolution} {p.isSpread ? '(SPREAD)' : '(SINGLE)'}</div>
                  </div>
                  <div className="p-16 space-y-10">
                    <div className="space-y-4">
                       <h4 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600 flex items-center gap-3"><PenTool size={20} /> Editable PDF Text Overlay</h4>
                       <textarea 
                         value={p.originalText || ''}
                         onChange={(e) => setPages(curr => curr.map(pg => pg.id === p.id ? { ...pg, originalText: e.target.value } : pg))}
                         className="w-full text-lg text-slate-700 font-bold leading-relaxed bg-slate-50 p-10 rounded-[2.5rem] border-2 border-transparent focus:border-indigo-300 focus:ring-0 resize-y min-h-[120px]"
                         placeholder="Enter the text that will appear on this page in the final PDF..."
                       />
                    </div>

                    <LayerManager 
                      layers={p.layers} 
                      onToggle={(layerId) => {
                        setPages(curr => curr.map(pg => {
                          if (pg.id === p.id && pg.layers) {
                            const newLayers = pg.layers.map(l => l.id === layerId ? { ...l, isVisible: !l.isVisible } : l);
                            // Re-composite
                            const canvas = document.createElement('canvas');
                            const [wStr, hStr] = targetAspectRatio.split(':');
                            const w = parseInt(wStr);
                            const h = parseInt(hStr);
                            canvas.width = 1024 * (w/h);
                            canvas.height = 1024;
                            const ctx = canvas.getContext('2d')!;
                            
                            const visibleLayers = newLayers.filter(l => l.isVisible);
                            let loaded = 0;
                            const imgs = visibleLayers.map(l => {
                              const img = new Image();
                              img.onload = () => {
                                loaded++;
                                if (loaded === visibleLayers.length) {
                                  // Draw in order: BG -> Props -> Chars -> Text
                                  const order = ['background', 'foreground', 'character', 'text'];
                                  order.forEach(type => {
                                    const layer = visibleLayers.find(l => l.type === type);
                                    if (layer) {
                                      const idx = visibleLayers.indexOf(layer);
                                      ctx.drawImage(imgs[idx], 0, 0, canvas.width, canvas.height);
                                    }
                                  });
                                  setPages(prev => prev.map(p2 => p2.id === pg.id ? { ...p2, processedImage: canvas.toDataURL('image/png'), layers: newLayers } : p2));
                                }
                              };
                              img.src = l.image;
                              return img;
                            });
                            return { ...pg, layers: newLayers };
                          }
                          return pg;
                        }));
                      }}
                    />
                    
                    <div className="flex items-center justify-between gap-6 pt-10 border-t border-slate-50">
                       {settings.mode === 'retarget' ? (
                         <>
                           <button onClick={() => {
                              setActiveRetargetId(p.id);
                              if (p.retargeting?.sourceImage) {
                                setRetargetSourceImage(p.retargeting.sourceImage);
                              }
                              setPages(curr => curr.map(pg => pg.id === p.id ? { 
                                ...pg, 
                                retargeting: pg.retargeting || { sourceHotspots: [], targetHotspots: [], instruction: "" } 
                              } : pg));
                              setCurrentStep('retarget-editor');
                           }} className="flex-[3] py-7 bg-indigo-600 text-white rounded-[2rem] font-black text-xl uppercase tracking-widest flex items-center justify-center gap-4 hover:scale-105 transition-all shadow-2xl">
                              <UserCheck size={28} /> OPEN RETARGETER
                           </button>
                           <button onClick={() => { setActiveFixId(p.id); setFixInstruction(""); setSelectedRefIds(new Set()); setFixMode('targeted'); }} className="flex-1 py-7 bg-slate-100 text-slate-400 rounded-[2rem] font-black text-xs uppercase tracking-widest flex items-center justify-center hover:bg-slate-200 transition-all">
                              FIX
                           </button>
                         </>
                       ) : (
                         <>
                           <button onClick={() => { setActiveFixId(p.id); setFixInstruction(""); setSelectedRefIds(new Set()); setFixMode('targeted'); }} className="flex-[2] py-7 bg-indigo-50 text-indigo-600 rounded-[2rem] font-black text-xl uppercase tracking-widest flex items-center justify-center gap-4 hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
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
                       <button onClick={() => renderScene(p.id)} className="p-7 bg-slate-100 text-slate-400 rounded-[2rem] hover:text-indigo-600 transition-all" title="Regenerate Page"><RefreshCw size={32} /></button>
                       {p.processedImage && <button onClick={() => { const a = document.createElement('a'); a.href = p.processedImage!; a.download = `page_${idx+1}.png`; a.click(); }} className="p-7 bg-emerald-50 text-emerald-600 rounded-[2rem]"><Download size={32} /></button>}
                       {p.layers && p.layers.length > 0 && (
                         <button onClick={() => handleDownloadLayers(p, idx)} className="p-7 bg-indigo-50 text-indigo-600 rounded-[2rem] flex flex-col items-center gap-1">
                           <Layers size={32} />
                           <span className="text-[8px] font-black uppercase tracking-widest">ZIP</span>
                         </button>
                       )}
                       <button onClick={() => setConfirmDeleteId(p.id)} className="p-7 bg-rose-50 text-rose-400 rounded-[2rem] hover:bg-rose-500 hover:text-white transition-all" title="Delete Page"><Trash2 size={32} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Delete Confirmation Modal */}
            {confirmDeleteId && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-12">
                <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={() => setConfirmDeleteId(null)} />
                <div className="bg-white w-full max-w-md rounded-[3rem] p-12 shadow-2xl relative z-10 space-y-8 animate-in zoom-in duration-300 text-center">
                  <Trash2 size={64} className="mx-auto text-rose-500 mb-6" />
                  <h2 className="text-3xl font-black text-slate-900">Delete Page?</h2>
                  <p className="text-slate-500 font-medium">This action cannot be undone. Are you sure you want to remove this page from your project?</p>
                  <div className="flex gap-4 pt-4">
                    <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all">Cancel</button>
                    <button onClick={() => {
                      setPages(curr => curr.filter(pg => pg.id !== confirmDeleteId));
                      setConfirmDeleteId(null);
                      showToast("Page deleted successfully.");
                    }} className="flex-1 py-4 bg-rose-500 text-white rounded-2xl font-bold hover:bg-rose-600 shadow-lg shadow-rose-500/30 transition-all">Delete</button>
                  </div>
                </div>
              </div>
            )}

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
                             <div className="flex flex-col gap-3">
                               <button onClick={() => setFixMode('targeted')} className={`w-full py-4 rounded-[2rem] font-black text-xl flex items-center justify-center gap-4 transition-all ${fixMode === 'targeted' ? 'bg-indigo-600 text-white shadow-2xl' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                                  <Sparkles size={24} /> TARGETED DETAIL FIX
                               </button>
                               <button onClick={() => setFixMode('outpaint')} className={`w-full py-4 rounded-[2rem] font-black text-xl flex items-center justify-center gap-4 transition-all ${fixMode === 'outpaint' ? 'bg-indigo-600 text-white shadow-2xl' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                                  <Maximize size={24} /> OUTPAINT TO SPREAD
                               </button>
                               <button onClick={() => setFixMode('separate-layers')} className={`w-full py-4 rounded-[2rem] font-black text-xl flex items-center justify-center gap-4 transition-all ${fixMode === 'separate-layers' ? 'bg-indigo-600 text-white shadow-2xl' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                                  <Layers size={24} /> SEPARATE INTO LAYERS
                               </button>
                             </div>
                             <p className="text-sm text-slate-400 font-medium px-4 text-center italic">
                               {fixMode === 'outpaint' && "Transform will expand the canvas ratio intelligently while keeping the core characters consistent."}
                               {fixMode === 'targeted' && "Fix specific details, characters, or styles in the current frame."}
                               {fixMode === 'separate-layers' && "Extracts the image into distinct layers (Background, Characters, Text Bubbles, Text) for professional compositing."}
                             </p>
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
                  <div className="grid grid-cols-2 gap-6 max-h-[50vh] overflow-y-auto p-4 -m-4">
                      {(Object.keys(PRINT_FORMATS) as (keyof typeof PRINT_FORMATS)[]).map((key) => (
                        <button key={key} onClick={() => setSettings({...settings, exportFormat: key})} className={`p-8 rounded-[2rem] border-2 text-left transition-all ${settings.exportFormat === key ? 'border-indigo-600 bg-indigo-50 shadow-xl' : 'border-slate-100 opacity-60 hover:opacity-100 hover:border-slate-300'}`}>
                          <div className="font-black text-xl text-slate-800">{PRINT_FORMATS[key].name}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-widest">{key.startsWith('KDP') ? 'KDP Standard' : 'Industry Default'}</div>
                        </button>
                      ))}
                  </div>
                  <div className="space-y-6">
                    <button onClick={() => generateBookPDF(pages, settings.exportFormat, projectName, settings.overlayText, settings.estimatedPageCount, settings.spreadExportMode, settings.layeredMode)} className="w-full py-12 bg-emerald-600 text-white rounded-[4rem] font-black text-4xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-8"><Download size={48} /> DOWNLOAD INTERIOR PDF</button>
                    <button onClick={() => exportProjectAssetsForCanva(pages, projectName)} className="w-full py-8 bg-indigo-600 text-white rounded-[3rem] font-black text-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4"><Layers size={32} /> DOWNLOAD ASSETS FOR CANVA / PHOTOSHOP</button>
                    <button onClick={() => setCurrentStep('cover-master')} className="w-full py-8 bg-amber-50 text-amber-600 rounded-[3rem] font-black text-2xl shadow-sm hover:bg-amber-100 transition-all flex items-center justify-center gap-4">GO TO COVER DESIGNER <ChevronRight size={32} /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'cover-master':
        return (
          <div className="max-w-7xl mx-auto py-20 px-8 space-y-16 animate-in fade-in duration-500 pb-64">
            <div className="flex flex-col lg:flex-row gap-16 items-start">
               <div className="flex-1 space-y-12">
                  <div className="space-y-4">
                    <h2 className="text-6xl font-black">Cover Synthesis</h2>
                    <p className="text-slate-500 text-xl font-medium">Design a high-end production cover using your series cast.</p>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600 flex items-center gap-3">
                      <UserCheck size={20} /> Featured Cast on Cover
                    </h3>
                    <div className="flex gap-6 overflow-x-auto py-4 px-2 custom-scrollbar">
                      {settings.characterReferences.map(char => (
                        <div 
                          key={char.id} 
                          className={`flex-shrink-0 w-32 h-32 rounded-[2rem] border-4 transition-all relative group overflow-hidden ${selectedCoverCharIds.has(char.id) ? 'border-indigo-600 scale-110 shadow-xl' : 'border-slate-100 opacity-50 hover:opacity-100'}`}
                        >
                          <div 
                            className="w-full h-full cursor-pointer"
                            onClick={() => {
                              const next = new Set(selectedCoverCharIds);
                              if (next.has(char.id)) next.delete(char.id);
                              else next.add(char.id);
                              setSelectedCoverCharIds(next);
                            }}
                          >
                            {char.images[0] ? (
                              <img src={char.images[0]} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-slate-50 flex items-center justify-center text-slate-300">
                                <ImageIcon size={32} />
                              </div>
                            )}
                          </div>
                          
                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                             <button 
                               onClick={(e) => { e.stopPropagation(); setActiveCharId(char.id); charImageInputRef.current?.click(); }} 
                               className="p-2 bg-white rounded-lg text-indigo-600 shadow-xl pointer-events-auto hover:scale-110 transition-transform"
                             >
                               <Upload size={16} />
                             </button>
                          </div>

                          {selectedCoverCharIds.has(char.id) && (
                            <div className="absolute top-2 right-2 bg-indigo-600 text-white rounded-full p-1 pointer-events-none">
                              <Check size={12} />
                            </div>
                          )}
                        </div>
                      ))}
                      <button 
                        onClick={() => setCurrentStep('characters')}
                        className="flex-shrink-0 w-32 h-32 rounded-[2rem] border-4 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-300 hover:border-indigo-600 hover:text-indigo-600 transition-all"
                      >
                        <Plus size={32} />
                        <span className="text-[10px] font-black uppercase">Add Hero</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-white border-2 border-slate-100 rounded-[4rem] p-12 shadow-2xl space-y-8">
                     <div className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600">Marketing Brief / Scene Description</h3>
                        <textarea className="w-full h-64 bg-slate-50 border-none rounded-3xl p-8 text-lg font-medium outline-none resize-none shadow-inner focus:ring-2 ring-indigo-600 transition-all" placeholder="Describe the cover scene, mood, and composition..." value={projectContext} onChange={e => setProjectContext(e.target.value)} />
                     </div>
                     <button 
                       disabled={isProcessing}
                       onClick={async () => { 
                         const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
                         if (!hasKey) { await (window as any).aistudio?.openSelectKey(); }
                         
                         setIsProcessing(true); 
                         const selectedChars = settings.characterReferences.filter(c => selectedCoverCharIds.has(c.id));
                         
                         if (settings.layeredMode) {
                           generateLayeredCover(projectContext, selectedChars, settings.targetStyle, settings.masterBible, targetResolution, projectName, targetAspectRatio, settings.exportFormat, settings.estimatedPageCount)
                             .then(res => {
                               setCoverImage(res.composite);
                               setCoverLayers(res.layers);
                             })
                             .catch(err => console.error(err))
                             .finally(() => setIsProcessing(false));
                         } else {
                           generateBookCover(projectContext, selectedChars, settings.targetStyle, settings.masterBible, targetResolution, targetAspectRatio, settings.exportFormat, settings.estimatedPageCount)
                             .then(res => setCoverImage(res))
                             .catch(err => console.error(err))
                             .finally(() => setIsProcessing(false)); 
                         }
                       }} 
                       className="w-full py-8 bg-indigo-600 text-white rounded-[2.5rem] font-black text-2xl shadow-xl flex items-center justify-center gap-4 hover:scale-105 transition-all disabled:opacity-50"
                     >
                        {isProcessing ? <Loader2 className="animate-spin" size={32} /> : <Sparkles size={32} />} RENDER PRODUCTION COVER
                     </button>
                  </div>
               </div>
               <div className={`w-full lg:w-2/5 bg-white rounded-[4.5rem] shadow-2xl overflow-hidden border-8 border-white relative flex flex-col items-center justify-center group ${targetAspectRatio === '16:9' ? 'aspect-video' : targetAspectRatio === '1:1' ? 'aspect-square' : targetAspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-[4/3]'}`}>
                  {coverImage ? (
                    <div className="relative w-full h-full">
                       <img src={coverImage} className="w-full h-full object-cover" />
                       <SpreadGuide isSpread={false} show={settings.showSafeGuides} format={settings.exportFormat} pageCount={settings.estimatedPageCount} />
                       {coverLayers && coverLayers.length > 0 && (
                         <div className="absolute bottom-0 inset-x-0 bg-white/90 backdrop-blur-xl p-6 border-t border-slate-100">
                            <LayerManager 
                              layers={coverLayers} 
                              onToggle={(layerId) => {
                                const newLayers = coverLayers.map(l => l.id === layerId ? { ...l, isVisible: !l.isVisible } : l);
                                setCoverLayers(newLayers);
                                
                                // Re-composite
                                const canvas = document.createElement('canvas');
                                const [w, h] = targetAspectRatio.split(':').map(Number);
                                const ratio = w / h;
                                canvas.width = 1024 * ratio;
                                canvas.height = 1024;
                                const ctx = canvas.getContext('2d')!;
                                
                                const visibleLayers = newLayers.filter(l => l.isVisible);
                                let loaded = 0;
                                const imgs = visibleLayers.map(l => {
                                  const img = new Image();
                                  img.onload = () => {
                                    loaded++;
                                    if (loaded === visibleLayers.length) {
                                      const order = ['background', 'character', 'text'];
                                      order.forEach(type => {
                                        const layer = visibleLayers.find(l => l.type === type);
                                        if (layer) {
                                          const idx = visibleLayers.indexOf(layer);
                                          ctx.drawImage(imgs[idx], 0, 0, canvas.width, canvas.height);
                                        }
                                      });
                                      setCoverImage(canvas.toDataURL('image/png'));
                                    }
                                  };
                                  img.src = l.image;
                                  return img;
                                });
                              }}
                            />
                         </div>
                       )}
                       <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6">
                         <button onClick={() => { const a = document.createElement('a'); a.href = coverImage; a.download = 'cover.png'; a.click(); }} className="p-6 bg-white rounded-3xl text-indigo-600 shadow-2xl hover:scale-110 transition-transform" title="Download PNG"><Download size={32} /></button>
                         <button onClick={() => generateCoverPDF(coverImage, settings.exportFormat, projectName, settings.estimatedPageCount)} className="p-6 bg-emerald-500 rounded-3xl text-white shadow-2xl hover:scale-110 transition-transform" title="Download KDP PDF"><FileText size={32} /></button>
                         <button onClick={() => setCoverImage(null)} className="p-6 bg-white rounded-3xl text-red-500 shadow-2xl hover:scale-110 transition-transform" title="Delete Cover"><Trash2 size={32} /></button>
                       </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-6 text-slate-200">
                      <Book size={160} />
                      <p className="font-black uppercase tracking-widest text-xl">Preview Area</p>
                    </div>
                  )}
                  {isProcessing && (
                    <div className="absolute inset-0 bg-indigo-600/10 backdrop-blur-sm flex flex-col items-center justify-center gap-6">
                      <Loader2 size={80} className="animate-spin text-indigo-600" />
                      <p className="text-indigo-600 font-black uppercase tracking-widest animate-pulse">Synthesizing Cover...</p>
                    </div>
                  )}
               </div>
            </div>
            <div className="flex justify-center mt-12">
              <button onClick={() => setCurrentStep('production-layout')} className="text-slate-400 font-bold hover:text-slate-600 underline text-xl">Back to Interior Master</button>
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
          const retargeting = retargetPage.retargeting || { sourceHotspots: [], targetHotspots: [], instruction: "" };
          const existing = retargeting[key] || [];
          const filtered = existing.filter(h => h.label !== activeHotspotLabel);
          setRetargetData({ [key]: [...filtered, { x, y, label: activeHotspotLabel }] });
        };

        const isReady = !isProcessing && 
                        retargetSourceImage && 
                        (retargetPage.retargeting?.sourceHotspots?.length || 0) > 0 && 
                        (retargetPage.retargeting?.targetHotspots?.length || 0) > 0;

        return (
          <div className="max-w-7xl mx-auto py-16 px-8 space-y-12 animate-in fade-in duration-500 pb-64">
            <div className="flex justify-between items-end">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="px-4 py-1 bg-indigo-600 text-white text-[10px] font-black rounded-full uppercase tracking-widest">Character Identity Lab</div>
                  <h2 className="text-6xl font-black tracking-tighter">Retargeting</h2>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3 bg-white border-2 border-slate-100 rounded-2xl p-2 shadow-sm">
                    <span className="text-[10px] font-black uppercase text-slate-400 px-3">Active Character:</span>
                    {[1, 2, 3, 4, 5].map(num => (
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
                  disabled={!isReady} 
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
                 <button onClick={handleSaveProject} className="text-indigo-600 p-4 bg-white rounded-2xl shadow-xl hover:scale-110 transition-transform" title="Save Project"><Save size={28} /></button>
                 <button onClick={handleOpenProjects} className="text-indigo-600 p-4 bg-white rounded-2xl shadow-xl hover:scale-110 transition-transform" title="Load Project"><FolderOpen size={28} /></button>
                 <button onClick={handleExportProjectFile} className="text-emerald-600 p-4 bg-white rounded-2xl shadow-xl hover:scale-110 transition-transform" title="Export Project"><FileDown size={28} /></button>
                 <label className="text-emerald-600 p-4 bg-white rounded-2xl shadow-xl hover:scale-110 transition-transform cursor-pointer" title="Import Project">
                   <FileUp size={28} />
                   <input type="file" accept=".storyflow,.json" className="hidden" onChange={handleImportProjectFile} />
                 </label>
              </div>
           </div>
           <button onClick={async () => { await (window as any).aistudio?.openSelectKey(); }} className="px-10 py-5 bg-emerald-50 text-emerald-600 rounded-[2rem] font-black text-sm uppercase tracking-widest flex items-center gap-4 border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all shadow-sm" title="Manage API Key"><Key size={24} /> API KEY</button>
           {isAdmin && (
             <button onClick={() => setShowAdminModal(true)} className="px-10 py-5 bg-amber-50 text-amber-600 rounded-[2rem] font-black text-sm uppercase tracking-widest flex items-center gap-4 border border-amber-100 hover:bg-amber-600 hover:text-white transition-all shadow-sm" title="Manage Users"><ShieldCheck size={24} /> ADMIN</button>
           )}
           <button onClick={() => setCurrentStep('characters')} className="px-10 py-5 bg-indigo-50 text-indigo-600 rounded-[2rem] font-black text-sm uppercase tracking-widest flex items-center gap-4 border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"><UserCheck size={24} /> SERIES CAST</button>
           <button onClick={() => setShowBibleEditor(!showBibleEditor)} className="p-5 bg-slate-900 text-white rounded-[2rem] shadow-2xl hover:scale-110 transition-all"><Book size={32} /></button>
           <button onClick={logout} className="p-5 bg-rose-50 text-rose-600 rounded-[2rem] shadow-sm hover:bg-rose-600 hover:text-white transition-all" title="Sign Out"><LogOut size={32} /></button>
        </div>
      </header>
      
      {currentStep !== 'landing' && getAvailableSteps(settings.mode).length > 0 && (
        <div className="bg-white border-b border-slate-100 py-4 px-20 flex items-center gap-4 overflow-x-auto sticky top-36 z-[50] shadow-sm">
          {getAvailableSteps(settings.mode).map((step, idx, arr) => (
            <div key={step.id} className="flex items-center gap-4">
              <button 
                onClick={() => setCurrentStep(step.id)}
                className={`px-6 py-2 rounded-full font-black text-sm uppercase tracking-widest transition-all ${currentStep === step.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
              >
                {step.label}
              </button>
              {idx < arr.length - 1 && (
                <ChevronRight size={16} className="text-slate-300" />
              )}
            </div>
          ))}
        </div>
      )}
      
      {showProjectsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-16">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setShowProjectsModal(false)} />
           <div className="bg-white w-full max-w-4xl rounded-[5rem] p-20 shadow-2xl relative z-10 space-y-12 animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center">
                 <h3 className="text-5xl font-black tracking-tighter">Your Projects</h3>
                 <button onClick={() => setShowProjectsModal(false)} className="text-slate-300 hover:text-slate-900 transition-colors"><X size={40} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {savedProjects.length === 0 ? (
                  <p className="text-slate-500 text-xl font-medium col-span-full text-center py-12">No saved projects found.</p>
                ) : (
                  savedProjects.map(proj => (
                    <div key={proj.id} className="bg-slate-50 rounded-[3rem] p-8 flex flex-col gap-6 shadow-sm border border-slate-100 hover:border-indigo-200 transition-colors group">
                      {proj.thumbnail ? (
                        <img src={proj.thumbnail} className="w-full h-48 object-cover rounded-[2rem] shadow-inner" />
                      ) : (
                        <div className="w-full h-48 bg-slate-200 rounded-[2rem] flex items-center justify-center text-slate-400 shadow-inner">
                          <ImageIcon size={48} />
                        </div>
                      )}
                      <div>
                        <h4 className="text-2xl font-black text-slate-900 truncate">{proj.name}</h4>
                        <p className="text-slate-500 font-medium text-sm mt-2">Last modified: {new Date(proj.lastModified).toLocaleDateString()}</p>
                      </div>
                      <div className="flex gap-4 mt-auto">
                        <button onClick={() => handleLoadProject(proj)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-colors">LOAD</button>
                        <button onClick={async () => {
                          await persistenceService.deleteProject(proj.id);
                          setSavedProjects(savedProjects.filter(p => p.id !== proj.id));
                        }} className="p-4 bg-rose-100 text-rose-600 rounded-2xl hover:bg-rose-600 hover:text-white transition-colors"><X size={24} /></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
           </div>
        </div>
      )}
      
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
      
      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] bg-slate-900 text-white px-8 py-4 rounded-full font-bold shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-300">
          {toastMessage}
        </div>
      )}

      {showAdminModal && (
        <AdminModal onClose={() => setShowAdminModal(false)} />
      )}
    </div>
  );
};

export default App;
