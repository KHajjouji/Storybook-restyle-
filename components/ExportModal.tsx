import React, { useState } from 'react';
import {
  X, Download, ExternalLink, Loader2, CheckCircle2,
  FileText, Presentation, Image as ImageIcon,
} from 'lucide-react';
import { BookPage } from '../types';
import {
  exportForCanva,
  exportForAdobeExpress,
  exportForGoogleSlides,
} from '../utils/exportUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExportStatus = 'idle' | 'loading' | 'done' | 'error';

interface ExportOption {
  id: 'pdf' | 'canva' | 'adobe' | 'slides';
  label: string;
  subLabel: string;
  icon: React.ReactNode;
  accentColor: string;
  badgeColor: string;
  actionLabel: string;
  openUrl?: string;
  openLabel?: string;
}

interface ExportModalProps {
  pages: BookPage[];
  projectName: string;
  onDownloadPdf: () => Promise<void>;
  onClose: () => void;
}

// ─── Export option definitions ────────────────────────────────────────────────

const OPTIONS: ExportOption[] = [
  {
    id: 'pdf',
    label: 'Print-Ready PDF',
    subLabel: 'High-quality PDF formatted for home printing or publishing (Amazon KDP, Lulu, etc.)',
    icon: <FileText size={22} />,
    accentColor: 'indigo',
    badgeColor: 'bg-indigo-600',
    actionLabel: 'Download PDF',
  },
  {
    id: 'canva',
    label: 'Edit in Canva',
    subLabel: 'Download your pages as PNGs in an organized folder, then import into Canva to add text, stickers, and more.',
    icon: <ImageIcon size={22} />,
    accentColor: 'violet',
    badgeColor: 'bg-violet-600',
    actionLabel: 'Download for Canva',
    openUrl: 'https://www.canva.com/design/new',
    openLabel: 'Open Canva',
  },
  {
    id: 'adobe',
    label: 'Edit in Adobe Express',
    subLabel: 'Export page images and import them into Adobe Express for professional-looking layouts and finishing.',
    icon: <ImageIcon size={22} />,
    accentColor: 'rose',
    badgeColor: 'bg-rose-600',
    actionLabel: 'Download for Adobe Express',
    openUrl: 'https://express.adobe.com',
    openLabel: 'Open Adobe Express',
  },
  {
    id: 'slides',
    label: 'Edit in Google Slides',
    subLabel: 'Export as a PowerPoint file (.pptx) — open it in Google Slides to arrange pages, add text, and share easily.',
    icon: <Presentation size={22} />,
    accentColor: 'amber',
    badgeColor: 'bg-amber-500',
    actionLabel: 'Download for Google Slides',
    openUrl: 'https://slides.google.com',
    openLabel: 'Open Google Slides',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const ExportModal: React.FC<ExportModalProps> = ({
  pages,
  projectName,
  onDownloadPdf,
  onClose,
}) => {
  const [statuses, setStatuses] = useState<Record<string, ExportStatus>>({
    pdf: 'idle',
    canva: 'idle',
    adobe: 'idle',
    slides: 'idle',
  });

  const setStatus = (id: string, status: ExportStatus) =>
    setStatuses(prev => ({ ...prev, [id]: status }));

  const handleExport = async (option: ExportOption) => {
    if (statuses[option.id] === 'loading') return;
    setStatus(option.id, 'loading');
    try {
      if (option.id === 'pdf') {
        await onDownloadPdf();
      } else if (option.id === 'canva') {
        await exportForCanva(pages, projectName);
      } else if (option.id === 'adobe') {
        await exportForAdobeExpress(pages, projectName);
      } else if (option.id === 'slides') {
        await exportForGoogleSlides(pages, projectName);
      }
      setStatus(option.id, 'done');
    } catch (err) {
      console.error(`Export failed for ${option.id}:`, err);
      setStatus(option.id, 'error');
    }
  };

  const handleOpen = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ─── Accent class helpers ──────────────────────────────────────────────────

  const buttonBg: Record<string, string> = {
    indigo: 'bg-indigo-600 hover:bg-indigo-700',
    violet: 'bg-violet-600 hover:bg-violet-700',
    rose:   'bg-rose-600 hover:bg-rose-700',
    amber:  'bg-amber-500 hover:bg-amber-600',
  };

  const iconBg: Record<string, string> = {
    indigo: 'bg-indigo-100 text-indigo-600',
    violet: 'bg-violet-100 text-violet-600',
    rose:   'bg-rose-100 text-rose-600',
    amber:  'bg-amber-100 text-amber-600',
  };

  const borderDone: Record<string, string> = {
    indigo: 'border-indigo-200 bg-indigo-50',
    violet: 'border-violet-200 bg-violet-50',
    rose:   'border-rose-200 bg-rose-50',
    amber:  'border-amber-200 bg-amber-50',
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-8">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 bg-white w-full sm:max-w-xl rounded-t-[3rem] sm:rounded-[3rem] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-black text-slate-900">Export your book</h3>
            <p className="text-slate-500 font-medium text-sm mt-1">
              Choose how you'd like to download or continue editing.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-3 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-2xl transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        {/* Options list */}
        <div className="px-8 pb-8 space-y-3 max-h-[70vh] overflow-y-auto">
          {OPTIONS.map(option => {
            const status = statuses[option.id];
            const isDone = status === 'done';
            const isLoading = status === 'loading';
            const isError = status === 'error';

            return (
              <div
                key={option.id}
                className={`p-5 rounded-[2rem] border-2 transition-all ${isDone ? borderDone[option.accentColor] : 'border-slate-100 bg-slate-50'}`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${isDone ? option.badgeColor + ' text-white' : iconBg[option.accentColor]}`}>
                    {isDone ? <CheckCircle2 size={20} /> : option.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <p className="font-black text-slate-800 leading-tight">{option.label}</p>
                      <p className="text-slate-500 text-xs font-medium mt-0.5 leading-relaxed">
                        {option.subLabel}
                      </p>
                    </div>

                    {isError && (
                      <p className="text-red-500 text-xs font-medium">
                        Export failed — please try again.
                      </p>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      {/* Primary export button */}
                      <button
                        onClick={() => handleExport(option)}
                        disabled={isLoading}
                        className={`px-4 py-2.5 rounded-xl font-black text-sm text-white flex items-center gap-2 transition-all disabled:opacity-60 ${buttonBg[option.accentColor]}`}
                      >
                        {isLoading ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : isDone ? (
                          <CheckCircle2 size={15} />
                        ) : (
                          <Download size={15} />
                        )}
                        {isDone ? 'Downloaded!' : isLoading ? 'Exporting…' : option.actionLabel}
                      </button>

                      {/* Open-in-tool button (shown after download) */}
                      {option.openUrl && isDone && (
                        <button
                          onClick={() => handleOpen(option.openUrl!)}
                          className="px-4 py-2.5 rounded-xl font-black text-sm bg-white border-2 border-slate-200 text-slate-700 flex items-center gap-2 hover:border-slate-300 hover:bg-slate-50 transition-all"
                        >
                          <ExternalLink size={15} />
                          {option.openLabel}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Close */}
          <button
            onClick={onClose}
            className="w-full py-4 bg-slate-100 text-slate-500 rounded-[2rem] font-bold hover:bg-slate-200 transition-colors mt-2"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
