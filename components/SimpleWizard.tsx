import React, { useState, useRef, useEffect } from 'react';
import {
  BookOpen, Sparkles, ChevronRight, ChevronLeft, Plus, Trash2,
  Loader2, Download, ExternalLink, Check, User, Image as ImageIcon,
  FileText, Palette, AlertCircle,
} from 'lucide-react';
import { StylePicker } from './StylePicker';
import { ExportModal } from './ExportModal';
import {
  WizardState, WizardBookFormat, WizardCharacter,
  AppSettings, BookPage, Project, ExportFormat,
} from '../types';
import { PREDEFINED_STYLES, GLOBAL_STYLE_LOCK } from '../seriesData';
import { analyzeStyleFromImage } from '../geminiService';
import { generateBookPDF } from '../utils/pdfGenerator';
import { persistenceService } from '../persistenceService';
import { useGenerationJob } from '../hooks/useGenerationJob';

// ─── Format mapping (friendly label → KDP format key) ─────────────────────────

const FORMAT_OPTIONS: {
  key: WizardBookFormat;
  label: string;
  subLabel: string;
  exportFormat: ExportFormat;
  aspectRatio: '1:1' | '4:3' | '9:16';
}[] = [
  {
    key: 'square',
    label: 'Square',
    subLabel: '8.25" × 8.25" — most popular for children',
    exportFormat: 'KDP_8_25x8_25',
    aspectRatio: '1:1',
  },
  {
    key: 'portrait',
    label: 'Portrait',
    subLabel: '8.5" × 11" — tall storybook style',
    exportFormat: 'KDP_8_5x11',
    aspectRatio: '9:16',
  },
  {
    key: 'landscape',
    label: 'Landscape',
    subLabel: '8.25" × 6" — wide picture book',
    exportFormat: 'KDP_8_25x6',
    aspectRatio: '4:3',
  },
];

const PROGRESS_MESSAGES = [
  'Reading your story…',
  'Planning the illustrations…',
  'Designing your characters…',
  'Drawing the pages…',
  'Adding the finishing touches…',
  'Putting your book together…',
];

// ─── Props ─────────────────────────────────────────────────────────────────────

interface SimpleWizardProps {
  userCredits: number;
  userId: string;
  onClose: () => void;
  onDeductCredit: () => void;
  onShowSubscription: () => void;
  onProjectCreated: (project: Project) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const SimpleWizard: React.FC<SimpleWizardProps> = ({
  userCredits,
  userId,
  onClose,
  onDeductCredit,
  onShowSubscription,
  onProjectCreated,
}) => {
  // ── Wizard form state ──────────────────────────────────────────────────────
  const [wizardState, setWizardState] = useState<WizardState>({
    step: 1,
    storyText: '',
    selectedStyleIndex: null,
    characters: [{ name: '', description: '' }],
    bookFormat: 'square',
  });

  // ── Generation state ───────────────────────────────────────────────────────
  const { status, message, pages, coverImage, error, startJob, reset } = useGenerationJob();
  const isGenerating = status === 'pending' || status === 'running';
  const isDone = status === 'done';

  // ── Derived project built from SSE pages ───────────────────────────────────
  const [savedProject, setSavedProject] = useState<Project | null>(null);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showExportModal, setShowExportModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const charPhotoInputRef = useRef<HTMLInputElement>(null);
  const [activeCharPhotoIndex, setActiveCharPhotoIndex] = useState<number | null>(null);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const updateWizard = (patch: Partial<WizardState>) =>
    setWizardState(prev => ({ ...prev, ...patch }));

  const canProceed = (): boolean => {
    switch (wizardState.step) {
      case 1: return wizardState.storyText.trim().length > 20;
      case 2: return wizardState.selectedStyleIndex !== null || !!wizardState.customStyleImage;
      case 3: return wizardState.characters.some(c => c.name.trim().length > 0);
      case 4: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (wizardState.step < 4) updateWizard({ step: (wizardState.step + 1) as WizardState['step'] });
    else handleGenerate();
  };

  const handleBack = () => {
    if (wizardState.step > 1) updateWizard({ step: (wizardState.step - 1) as WizardState['step'] });
    else onClose();
  };

  // ─── Character photo upload ──────────────────────────────────────────────
  const handleCharPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || activeCharPhotoIndex === null) return;
    const reader = new FileReader();
    reader.onload = () => {
      const updated = [...wizardState.characters];
      updated[activeCharPhotoIndex] = {
        ...updated[activeCharPhotoIndex],
        photo: reader.result as string,
      };
      updateWizard({ characters: updated });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ─── Start generation job on the server ──────────────────────────────────
  const handleGenerate = async () => {
    if (userCredits < 1) {
      onShowSubscription();
      return;
    }

    setFormError(null);

    const formatOption =
      FORMAT_OPTIONS.find(f => f.key === wizardState.bookFormat) ?? FORMAT_OPTIONS[0];

    const stylePrompt =
      wizardState.customStylePrompt ||
      (wizardState.selectedStyleIndex !== null
        ? PREDEFINED_STYLES[wizardState.selectedStyleIndex].prompt
        : PREDEFINED_STYLES[0].prompt);

    const characters = wizardState.characters
      .filter(c => c.name.trim())
      .map(c => ({
        name: c.name.trim(),
        description: c.description.trim(),
        photoBase64: c.photo,
      }));

    try {
      await startJob({
        userId,
        storyText: wizardState.storyText,
        coverPrompt: wizardState.coverPrompt,
        stylePrompt,
        styleRefBase64: wizardState.customStyleImage,
        characters,
        exportFormat: formatOption.exportFormat,
        aspectRatio: formatOption.aspectRatio,
      });
      // Credit is deducted server-side; tell the UI to optimistically reflect it
      onDeductCredit();
    } catch (err: any) {
      setFormError(err.message || 'Could not start generation. Please try again.');
    }
  };

  // ─── Save project once generation is complete ─────────────────────────────
  useEffect(() => {
    if (status !== 'done' || savedProject) return;

    const formatOption =
      FORMAT_OPTIONS.find(f => f.key === wizardState.bookFormat) ?? FORMAT_OPTIONS[0];

    const stylePrompt =
      wizardState.customStylePrompt ||
      (wizardState.selectedStyleIndex !== null
        ? PREDEFINED_STYLES[wizardState.selectedStyleIndex].prompt
        : PREDEFINED_STYLES[0].prompt);

    const appSettings: AppSettings = {
      mode: 'create',
      targetStyle: stylePrompt,
      styleReference: wizardState.customStyleImage,
      masterBible: GLOBAL_STYLE_LOCK,
      targetLanguage: 'NONE_CLEAN_BG',
      exportFormat: formatOption.exportFormat,
      spreadExportMode: 'SPLIT_PAGES',
      useProModel: false,
      embedTextInImage: true,
      layeredMode: false,
      overlayText: false,
      textFont: 'Inter',
      showSafeGuides: false,
      characterReferences: [],
      estimatedPageCount: pages.length,
    };

    const projectName =
      wizardState.storyText.trim().split(/\s+/).slice(0, 5).join(' ') + '…';

    const project: Project = {
      id: Math.random().toString(36).substring(7),
      name: projectName,
      lastModified: Date.now(),
      settings: appSettings,
      pages,
      coverImage,
      fullScript: wizardState.storyText,
      currentStep: 'generate',
    };

    persistenceService
      .saveProject(project)
      .then(() => {
        setSavedProject(project);
        onProjectCreated(project);
      })
      .catch(err => console.warn('Could not save project to IndexedDB:', err));
  }, [status]);

  // ─── Download PDF ────────────────────────────────────────────────────────
  const handleDownloadPdf = async () => {
    const project = savedProject;
    if (!project) return;
    const format =
      FORMAT_OPTIONS.find(f => f.key === wizardState.bookFormat) ?? FORMAT_OPTIONS[0];
    await generateBookPDF(
      project.pages,
      format.exportFormat,
      project.name,
      false, // overlayText
      project.pages.length, // totalEstimatedPages
      'SPLIT_PAGES', // spreadMode
      false, // layeredMode
      'Inter', // textFont
    );
  };

  // ─── Step labels ──────────────────────────────────────────────────────────
  const STEPS = [
    { icon: FileText, label: 'Your Story' },
    { icon: Palette, label: 'Art Style' },
    { icon: User, label: 'Characters' },
    { icon: BookOpen, label: 'Book Format' },
  ];

  // ─── Generating screen ────────────────────────────────────────────────────
  if (isGenerating) {
    // Count completed pages for progress bar
    const completedCount = pages.filter(p => p.status === 'completed').length;
    // We don't know total upfront; use message to show rolling progress
    const progressFraction = completedCount > 0
      ? Math.min(0.9, 0.2 + (completedCount / Math.max(completedCount + 1, 5)) * 0.7)
      : 0.1;

    return (
      <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center p-8 gap-10">
        <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl">
          <Sparkles size={48} className="text-white animate-pulse" />
        </div>
        <div className="text-center space-y-4 max-w-md">
          <h2 className="text-4xl font-black text-slate-900">Creating your book…</h2>
          <p className="text-2xl text-indigo-600 font-bold">
            {message || PROGRESS_MESSAGES[0]}
          </p>
          <p className="text-slate-400 font-medium">
            This usually takes 2–4 minutes. Please don't close this page.
          </p>
          {/* Live page count */}
          {completedCount > 0 && (
            <p className="text-slate-500 font-medium text-sm">
              {completedCount} page{completedCount !== 1 ? 's' : ''} illustrated so far
            </p>
          )}
        </div>
        {/* Progress bar */}
        <div className="w-full max-w-md bg-slate-100 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-700"
            style={{ width: `${Math.round(progressFraction * 100)}%` }}
          />
        </div>
      </div>
    );
  }

  // ─── Success / Download screen ────────────────────────────────────────────
  if (isDone && savedProject) {
    const completedPages = savedProject.pages.filter(p => p.status === 'completed');
    return (
      <div className="fixed inset-0 z-[200] bg-white overflow-y-auto">
        <div className="max-w-3xl mx-auto py-20 px-8 space-y-12">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-emerald-500 rounded-full mx-auto flex items-center justify-center shadow-xl">
              <Check size={40} className="text-white" />
            </div>
            <h2 className="text-5xl font-black text-slate-900">Your book is ready!</h2>
            <p className="text-slate-500 text-xl font-medium">
              {completedPages.length} of {savedProject.pages.length} pages illustrated
            </p>
          </div>

          {/* Cover + page strip */}
          <div className="flex gap-4 overflow-x-auto pb-4">
            {savedProject.coverImage && (
              <div className="flex-shrink-0 w-32 h-32 rounded-2xl overflow-hidden bg-slate-100 shadow-md border-2 border-indigo-200 relative">
                <img
                  src={savedProject.coverImage}
                  alt="Cover"
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-1 left-0 right-0 text-center text-white text-[10px] font-black bg-indigo-600/80 py-0.5">
                  COVER
                </span>
              </div>
            )}
            {savedProject.pages.map((page, i) => (
              <div
                key={page.id}
                className="flex-shrink-0 w-32 h-32 rounded-2xl overflow-hidden bg-slate-100 shadow-sm border-2 border-slate-100"
              >
                {page.processedImage ? (
                  <img
                    src={page.processedImage}
                    alt={`Page ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <ImageIcon size={32} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Download actions */}
          <div className="space-y-4">
            <button
              onClick={handleDownloadPdf}
              className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-2xl flex items-center justify-center gap-4 shadow-2xl hover:bg-indigo-700 hover:scale-[1.02] transition-all"
            >
              <Download size={32} /> Download Print-Ready PDF
            </button>

            <button
              onClick={() => setShowExportModal(true)}
              className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-2xl flex items-center justify-center gap-4 shadow-xl hover:scale-[1.02] transition-all"
            >
              <ExternalLink size={32} /> Edit in Canva, Slides &amp; More
            </button>

            <button
              onClick={() => { reset(); onClose(); }}
              className="w-full py-4 bg-slate-100 text-slate-500 rounded-[2rem] font-bold text-lg hover:bg-slate-200 transition-colors"
            >
              Back to My Books
            </button>
          </div>

          {error && (
            <div className="p-4 bg-amber-50 text-amber-700 rounded-2xl text-sm font-medium border border-amber-100 flex gap-3 items-start">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              Some pages may not have generated correctly. You can still download what's ready.
            </div>
          )}
        </div>

        {showExportModal && (
          <ExportModal
            pages={savedProject.pages}
            projectName={savedProject.name}
            onDownloadPdf={handleDownloadPdf}
            onClose={() => setShowExportModal(false)}
          />
        )}
      </div>
    );
  }

  // ─── Error screen (fatal job failure) ────────────────────────────────────
  if (status === 'failed') {
    return (
      <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center p-8 gap-8">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
          <AlertCircle size={40} className="text-red-500" />
        </div>
        <div className="text-center space-y-3 max-w-md">
          <h2 className="text-3xl font-black text-slate-900">Something went wrong</h2>
          <p className="text-slate-500 font-medium">{error || 'Generation failed. Please try again.'}</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => { reset(); updateWizard({ step: 4 }); }}
            className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => { reset(); onClose(); }}
            className="px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ─── Wizard steps 1–4 ─────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[200] bg-white overflow-y-auto">
      <div className="max-w-2xl mx-auto py-12 px-6 min-h-screen flex flex-col">

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-10">
          {STEPS.map((s, idx) => {
            const num = idx + 1;
            const active = wizardState.step === num;
            const done = wizardState.step > num;
            const Icon = s.icon;
            return (
              <React.Fragment key={s.label}>
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-full transition-all ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : done
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {done ? <Check size={14} /> : <Icon size={14} />}
                  <span className="text-xs font-black hidden sm:inline">{s.label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 ${done ? 'bg-indigo-300' : 'bg-slate-100'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step content */}
        <div className="flex-1 space-y-8">

          {/* ── Step 1: Story ─────────────────────────────────────────────── */}
          {wizardState.step === 1 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-4xl font-black text-slate-900">Tell us your story</h2>
                <p className="text-slate-500 font-medium">
                  Write a few sentences about what happens in the book. The AI will turn it into a full illustrated story.
                </p>
              </div>
              <textarea
                className="w-full h-56 bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-8 text-lg font-medium outline-none resize-none focus:border-indigo-400 transition-colors leading-relaxed"
                placeholder="E.g. A little girl named Layla finds a magical seed in the garden. She plants it and waters it every day. When it grows, it turns out to be a talking sunflower that takes her on adventures..."
                value={wizardState.storyText}
                onChange={e => updateWizard({ storyText: e.target.value })}
              />
              <p className="text-slate-400 text-sm font-medium text-right mt-1">
                {wizardState.storyText.trim().split(/\s+/).filter(Boolean).length} words
              </p>
              
              <div className="mt-8 space-y-2">
                <h3 className="text-xl font-bold text-slate-900">Cover Instructions (Optional)</h3>
                <p className="text-sm text-slate-500 font-medium">Have specific ideas for the cover illustration? Describe it here.</p>
                <textarea
                  className="w-full h-32 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] p-6 text-base font-medium outline-none resize-none focus:border-indigo-400 transition-colors leading-relaxed"
                  placeholder="E.g. The main scene shows a Moroccan grandfather sitting comfortably... Around them, include softly integrated symbolic scenes..."
                  value={wizardState.coverPrompt || ''}
                  onChange={e => updateWizard({ coverPrompt: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* ── Step 2: Art Style ─────────────────────────────────────────── */}
          {wizardState.step === 2 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-4xl font-black text-slate-900">Pick an art style</h2>
              </div>
              <StylePicker
                selectedIndex={wizardState.selectedStyleIndex}
                customStyleImage={wizardState.customStyleImage}
                onSelect={idx =>
                  updateWizard({
                    selectedStyleIndex: idx,
                    customStyleImage: undefined,
                    customStylePrompt: undefined,
                  })
                }
                onCustomStyleUpload={async base64 => {
                  updateWizard({ customStyleImage: base64, selectedStyleIndex: null });
                  try {
                    const prompt = await analyzeStyleFromImage(base64);
                    updateWizard({ customStylePrompt: prompt });
                  } catch { /* ignore */ }
                }}
              />
            </div>
          )}

          {/* ── Step 3: Characters ───────────────────────────────────────── */}
          {wizardState.step === 3 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-4xl font-black text-slate-900">Who's in your story?</h2>
                <p className="text-slate-500 font-medium">
                  Add your main characters. A name is enough — a short description helps make them unique.
                </p>
              </div>

              <div className="space-y-4">
                {wizardState.characters.map((char, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-50 rounded-[2rem] p-6 space-y-4 border-2 border-slate-100"
                  >
                    <div className="flex items-center gap-4">
                      {/* Photo upload */}
                      <button
                        onClick={() => {
                          setActiveCharPhotoIndex(idx);
                          charPhotoInputRef.current?.click();
                        }}
                        className="w-16 h-16 rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center flex-shrink-0 hover:border-indigo-400 transition-colors overflow-hidden"
                      >
                        {char.photo ? (
                          <img src={char.photo} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User size={24} className="text-slate-300" />
                        )}
                      </button>

                      <div className="flex-1 space-y-2">
                        <input
                          className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-indigo-400 transition-colors"
                          placeholder="Character name (e.g. Layla)"
                          value={char.name}
                          onChange={e => {
                            const updated = [...wizardState.characters];
                            updated[idx] = { ...updated[idx], name: e.target.value };
                            updateWizard({ characters: updated });
                          }}
                        />
                        <input
                          className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 font-medium text-slate-700 outline-none focus:border-indigo-400 transition-colors text-sm"
                          placeholder="Short description (e.g. a curious 6-year-old girl with curly hair)"
                          value={char.description}
                          onChange={e => {
                            const updated = [...wizardState.characters];
                            updated[idx] = { ...updated[idx], description: e.target.value };
                            updateWizard({ characters: updated });
                          }}
                        />
                      </div>

                      {wizardState.characters.length > 1 && (
                        <button
                          onClick={() =>
                            updateWizard({
                              characters: wizardState.characters.filter((_, i) => i !== idx),
                            })
                          }
                          className="p-2 text-red-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {wizardState.characters.length < 4 && (
                  <button
                    onClick={() =>
                      updateWizard({
                        characters: [...wizardState.characters, { name: '', description: '' }],
                      })
                    }
                    className="w-full py-4 border-2 border-dashed border-slate-200 rounded-[2rem] text-slate-400 font-bold flex items-center justify-center gap-2 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                  >
                    <Plus size={18} /> Add another character
                  </button>
                )}
              </div>

              <input
                ref={charPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCharPhotoUpload}
              />
            </div>
          )}

          {/* ── Step 4: Book Format ──────────────────────────────────────── */}
          {wizardState.step === 4 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-4xl font-black text-slate-900">Choose your book size</h2>
                <p className="text-slate-500 font-medium">
                  All sizes are print-ready for publishing.
                </p>
              </div>

              <div className="space-y-4">
                {FORMAT_OPTIONS.map(fmt => (
                  <button
                    key={fmt.key}
                    onClick={() => updateWizard({ bookFormat: fmt.key })}
                    className={`w-full p-6 rounded-[2rem] border-4 text-left flex items-center gap-6 transition-all ${
                      wizardState.bookFormat === fmt.key
                        ? 'border-indigo-600 bg-indigo-50 shadow-lg'
                        : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50'
                    }`}
                  >
                    {/* Shape preview */}
                    <div className="flex-shrink-0 flex items-center justify-center w-16 h-16">
                      <div
                        className={`bg-indigo-200 rounded-md ${
                          fmt.key === 'square'
                            ? 'w-12 h-12'
                            : fmt.key === 'portrait'
                            ? 'w-8 h-14'
                            : 'w-14 h-10'
                        } ${wizardState.bookFormat === fmt.key ? 'bg-indigo-500' : ''}`}
                      />
                    </div>
                    <div>
                      <p className="font-black text-xl text-slate-900">{fmt.label}</p>
                      <p className="text-slate-500 font-medium text-sm">{fmt.subLabel}</p>
                    </div>
                    {wizardState.bookFormat === fmt.key && (
                      <div className="ml-auto w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                        <Check size={16} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Credit notice */}
              <div
                className={`p-4 rounded-2xl text-sm font-medium ${
                  userCredits > 0
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    : 'bg-red-50 text-red-600 border border-red-100'
                }`}
              >
                {userCredits > 0
                  ? `You have ${userCredits} book credit${userCredits !== 1 ? 's' : ''} — this will use 1 credit.`
                  : "You're out of credits. Subscribe to create more books!"}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-4 mt-12 pt-6 border-t border-slate-100">
          <button
            onClick={handleBack}
            className="px-8 py-5 bg-slate-100 text-slate-500 rounded-[2rem] font-black flex items-center gap-2 hover:bg-slate-200 transition-colors"
          >
            <ChevronLeft size={20} />
            {wizardState.step === 1 ? 'Cancel' : 'Back'}
          </button>

          <button
            onClick={handleNext}
            disabled={
              !canProceed() ||
              isGenerating ||
              (wizardState.step === 4 && userCredits < 1)
            }
            className="flex-1 py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xl flex items-center justify-center gap-3 shadow-2xl hover:bg-indigo-700 hover:scale-[1.01] transition-all disabled:opacity-50 disabled:hover:scale-100"
          >
            {isGenerating ? (
              <>
                <Loader2 size={22} className="animate-spin" />
                Creating…
              </>
            ) : wizardState.step === 4 ? (
              <>
                <Sparkles size={24} />
                Create My Book
              </>
            ) : (
              <>
                Next
                <ChevronRight size={20} />
              </>
            )}
          </button>

          {wizardState.step === 4 && userCredits < 1 && (
            <button
              onClick={onShowSubscription}
              className="px-8 py-5 bg-emerald-600 text-white rounded-[2rem] font-black hover:bg-emerald-700 transition-colors shadow-xl"
            >
              Subscribe
            </button>
          )}
        </div>

        {formError && (
          <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100 flex gap-3 items-start">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            {formError}
          </div>
        )}
      </div>
    </div>
  );
};
