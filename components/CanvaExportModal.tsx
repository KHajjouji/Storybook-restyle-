import React, { useState } from 'react';
import { X, Download, ExternalLink, Loader2, CheckCircle2, BookOpen } from 'lucide-react';
import { BookPage } from '../types';
import { exportProjectAssetsForCanva } from '../utils/exportUtils';

interface CanvaExportModalProps {
  pages: BookPage[];
  projectName: string;
  onClose: () => void;
}

export const CanvaExportModal: React.FC<CanvaExportModalProps> = ({
  pages,
  projectName,
  onClose,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const handleExportZip = async () => {
    setIsExporting(true);
    try {
      await exportProjectAssetsForCanva(pages, projectName);
      setExported(true);
    } catch (e) {
      console.error('Export failed', e);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenInCanva = () => {
    // Canva Connect API — opens a new blank design in Canva
    // Users can then import the ZIP file downloaded above
    const canvaUrl = 'https://www.canva.com/design/new';
    window.open(canvaUrl, '_blank', 'noopener noreferrer');
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-8">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200">

        {/* Header */}
        <div className="px-10 pt-10 pb-6 space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="text-3xl font-black text-slate-900">Edit your book</h3>
            <button onClick={onClose} className="text-slate-300 hover:text-slate-700 transition-colors">
              <X size={28} />
            </button>
          </div>
          <p className="text-slate-500 font-medium">
            Export your illustrations and open them in Canva, Photoshop, or any design tool.
          </p>
        </div>

        <div className="px-10 pb-10 space-y-4">

          {/* Step 1: Download ZIP */}
          <div className={`p-6 rounded-[2rem] border-2 transition-all ${exported ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${exported ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                {exported ? <CheckCircle2 size={20} className="text-white" /> : <span className="text-slate-600 font-black text-sm">1</span>}
              </div>
              <div className="flex-1 space-y-3">
                <p className="font-black text-slate-800">Download your illustrations</p>
                <p className="text-slate-500 text-sm font-medium">
                  All {pages.length} pages are saved as PNG images in an organised ZIP folder.
                </p>
                <button
                  onClick={handleExportZip}
                  disabled={isExporting}
                  className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-60"
                >
                  {isExporting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : exported ? (
                    <><CheckCircle2 size={18} className="text-emerald-400" /> Downloaded!</>
                  ) : (
                    <><Download size={18} /> Download ZIP</>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: Open in Canva */}
          <div className={`p-6 rounded-[2rem] border-2 transition-all ${exported ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${exported ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                <span className={`font-black text-sm ${exported ? 'text-white' : 'text-slate-500'}`}>2</span>
              </div>
              <div className="flex-1 space-y-3">
                <p className="font-black text-slate-800">Open in your design tool</p>
                <p className="text-slate-500 text-sm font-medium">
                  Upload the ZIP to Canva, Photoshop, or any editing tool to add text, adjust layouts, and finalise your book.
                </p>
                <button
                  onClick={handleOpenInCanva}
                  disabled={!exported}
                  className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-40"
                >
                  <ExternalLink size={18} /> Open Canva
                </button>
              </div>
            </div>
          </div>

          {/* Other tools hint */}
          <p className="text-center text-slate-400 text-xs font-medium">
            Works with Canva, Adobe Express, Photoshop, Figma, and more.
          </p>

          <button
            onClick={onClose}
            className="w-full py-3 bg-slate-100 text-slate-500 rounded-2xl font-bold hover:bg-slate-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
