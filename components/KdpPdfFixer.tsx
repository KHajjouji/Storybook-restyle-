import React, { useState, useRef } from 'react';
import { Upload, FileText, Loader2, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { GoogleGenAI, Type } from '@google/genai';

interface KdpPdfFixerProps {
  onBack: () => void;
}

export const KdpPdfFixer: React.FC<KdpPdfFixerProps> = ({ onBack }) => {
  const [fixMode, setFixMode] = useState<'scale_original' | 'center_original' | 'blank_template'>('scale_original');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [kdpNotes, setKdpNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [fixedPdfUrl, setFixedPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPdfFile(e.target.files[0]);
      setFixedPdfUrl(null);
      setError(null);
      setSuccessMsg(null);
    }
  };

  const processPdf = async () => {
    if (!pdfFile || !kdpNotes) {
      setError("Please upload a PDF and paste the KDP email notes.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccessMsg(null);

    try {
      // 1. Load the uploaded PDF to get original dimensions
      const pdfBytes = await pdfFile.arrayBuffer();
      const originalPdf = await PDFDocument.load(pdfBytes);
      const pageCount = originalPdf.getPageCount();
      const indices = Array.from({ length: pageCount }, (_, i) => i);
      
      // Get dimensions of the first page (in points, 72 pts = 1 inch)
      const firstPage = originalPdf.getPage(0);
      const origWidthInches = firstPage.getWidth() / 72;
      const origHeightInches = firstPage.getHeight() / 72;

      // 2. Parse KDP Notes using Gemini
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is missing.");
      
      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `
        Analyze the following KDP (Kindle Direct Publishing) rejection email or notes.
        Extract the required dimensions and specifications for the PDF.
        
        The user uploaded a PDF with original dimensions: ${origWidthInches.toFixed(3)}" x ${origHeightInches.toFixed(3)}".
        If the email does not explicitly state the target trim size, assume the original dimensions are the intended trim size (or close to it) and calculate the target size by adding the required bleed.
        
        KDP Notes:
        "${kdpNotes}"
        
        Return a JSON object with the following structure:
        {
          "isCover": boolean, // true if the notes refer to a cover, false if interior
          "targetWidthInches": number, // The FINAL required width of the PDF page in inches (MUST include bleed if required by KDP). E.g., if trim is 8.5x11 and interior bleed is required, width is 8.625 and height is 11.25.
          "targetHeightInches": number, // The FINAL required height of the PDF page in inches (MUST include bleed if required).
          "trimWidthInches": number, // The intended trim width in inches (without bleed).
          "trimHeightInches": number, // The intended trim height in inches (without bleed).
          "hasBleed": boolean, // true if the document requires bleed
          "action": "scale_to_fit" | "scale_to_bleed" | "center" // How to handle the original pages. If background needs to extend to edges, use "scale_to_bleed". If content is cut off, use "scale_to_fit".
        }
        
        Important KDP Bleed Rules:
        - Interior Bleed: Add 0.125" to top, bottom, and outside edges. (Total added: 0.125" to width, 0.25" to height).
        - Cover Bleed: Add 0.125" to top, bottom, and outside edges. (Total added: 0.25" to width, 0.25" to height).
        Calculate the exact targetWidthInches and targetHeightInches based on the email's stated expected size or trim size.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isCover: { type: Type.BOOLEAN },
              targetWidthInches: { type: Type.NUMBER },
              targetHeightInches: { type: Type.NUMBER },
              trimWidthInches: { type: Type.NUMBER },
              trimHeightInches: { type: Type.NUMBER },
              hasBleed: { type: Type.BOOLEAN },
              action: { type: Type.STRING }
            },
            required: ["isCover", "targetWidthInches", "targetHeightInches", "trimWidthInches", "trimHeightInches", "hasBleed", "action"]
          }
        }
      });

      const specs = JSON.parse(response.text || '{}');
      if (!specs.targetWidthInches || !specs.targetHeightInches) {
        throw new Error("Could not determine target dimensions from the provided notes.");
      }

      // 3. Create a new PDF
      const newPdf = await PDFDocument.create();
      
      // Convert inches to points (1 inch = 72 points)
      const targetWidthPts = specs.targetWidthInches * 72;
      const targetHeightPts = specs.targetHeightInches * 72;

      if (fixMode === 'blank_template') {
        // Generate blank template with guides
        const { rgb } = await import('pdf-lib');
        
        for (let i = 0; i < pageCount; i++) {
          const newPage = newPdf.addPage([targetWidthPts, targetHeightPts]);
          
          const bleedPts = 0.125 * 72;
          const safePts = 0.25 * 72;
          
          // Draw Bleed Area (Red border)
          newPage.drawRectangle({
            x: bleedPts,
            y: bleedPts,
            width: targetWidthPts - (bleedPts * 2),
            height: targetHeightPts - (bleedPts * 2),
            borderColor: rgb(1, 0, 0),
            borderWidth: 1,
          });
          
          // Draw Safe Area (Blue dashed border)
          newPage.drawRectangle({
            x: bleedPts + safePts,
            y: bleedPts + safePts,
            width: targetWidthPts - (bleedPts * 2) - (safePts * 2),
            height: targetHeightPts - (bleedPts * 2) - (safePts * 2),
            borderColor: rgb(0, 0, 1),
            borderWidth: 1,
            borderDashArray: [5, 5],
          });
          
          // Add text
          newPage.drawText(`Page ${i + 1} Template`, { x: 50, y: targetHeightPts - 50, size: 24, color: rgb(0,0,0) });
          newPage.drawText(`Target Size (with Bleed): ${specs.targetWidthInches}" x ${specs.targetHeightInches}"`, { x: 50, y: targetHeightPts - 80, size: 14 });
          newPage.drawText(`Trim Size: ${specs.trimWidthInches}" x ${specs.trimHeightInches}"`, { x: 50, y: targetHeightPts - 100, size: 14 });
          newPage.drawText(`Red Box = Trim Line`, { x: 50, y: targetHeightPts - 130, size: 12, color: rgb(1,0,0) });
          newPage.drawText(`Dashed Blue Box = Safe Area`, { x: 50, y: targetHeightPts - 150, size: 12, color: rgb(0,0,1) });
        }
        
        setSuccessMsg(`Successfully generated ${pageCount}-page template at ${specs.targetWidthInches}" x ${specs.targetHeightInches}".`);
      } else {
        // 4. Embed and place pages
        const embeddedPages = await newPdf.embedPdf(pdfBytes, indices);

        for (let i = 0; i < embeddedPages.length; i++) {
          const embeddedPage = embeddedPages[i];
          const newPage = newPdf.addPage([targetWidthPts, targetHeightPts]);
          
          const origWidth = embeddedPage.width;
          const origHeight = embeddedPage.height;

          let scale = 1;
          let x = 0;
          let y = 0;

          if (fixMode === 'center_original') {
            x = (targetWidthPts - origWidth) / 2;
            y = (targetHeightPts - origHeight) / 2;
          } else if (specs.action === 'scale_to_bleed') {
            // Scale to fill the entire new page (might crop slightly if aspect ratios differ)
            const scaleX = targetWidthPts / origWidth;
            const scaleY = targetHeightPts / origHeight;
            scale = Math.max(scaleX, scaleY);
            x = (targetWidthPts - origWidth * scale) / 2;
            y = (targetHeightPts - origHeight * scale) / 2;
          } else if (specs.action === 'scale_to_fit') {
            // Scale to fit within the safe area (assuming 0.25" safe margin)
            const safeMarginPts = 0.25 * 72;
            const safeWidth = targetWidthPts - (safeMarginPts * 2);
            const safeHeight = targetHeightPts - (safeMarginPts * 2);
            
            const scaleX = safeWidth / origWidth;
            const scaleY = safeHeight / origHeight;
            scale = Math.min(scaleX, scaleY);
            x = (targetWidthPts - origWidth * scale) / 2;
            y = (targetHeightPts - origHeight * scale) / 2;
          } else {
            // Center without scaling
            x = (targetWidthPts - origWidth) / 2;
            y = (targetHeightPts - origHeight) / 2;
          }

          newPage.drawPage(embeddedPage, {
            x,
            y,
            width: origWidth * scale,
            height: origHeight * scale,
          });
        }
        setSuccessMsg(`Successfully resized to ${specs.targetWidthInches}" x ${specs.targetHeightInches}" (${specs.isCover ? 'Cover' : 'Interior'}, ${specs.action}).`);
      }

      // 5. Save and create URL
      const fixedPdfBytes = await newPdf.save();
      const blob = new Blob([fixedPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      setFixedPdfUrl(url);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while processing the PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-20 px-8 space-y-12 animate-in slide-in-from-bottom duration-500">
      <div className="text-center space-y-4">
        <h2 className="text-6xl font-black text-slate-900">KDP PDF Fixer</h2>
        <p className="text-slate-500 text-xl font-medium">Upload a rejected PDF and paste the KDP email to automatically fix bleed and margins.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: Inputs */}
        <div className="bg-white rounded-[3rem] p-10 shadow-2xl border border-slate-100 space-y-8">
          
          <div className="space-y-4">
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
              <CheckCircle2 className="text-emerald-500" /> Mode
            </h3>
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => setFixMode('scale_original')}
                className={`flex-1 py-4 px-6 rounded-2xl font-bold border-2 transition-all ${fixMode === 'scale_original' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300'}`}
              >
                Fix & Scale Original
              </button>
              <button 
                onClick={() => setFixMode('center_original')}
                className={`flex-1 py-4 px-6 rounded-2xl font-bold border-2 transition-all ${fixMode === 'center_original' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300'}`}
              >
                Center Original (No Scale)
              </button>
              <button 
                onClick={() => setFixMode('blank_template')}
                className={`flex-1 py-4 px-6 rounded-2xl font-bold border-2 transition-all ${fixMode === 'blank_template' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300'}`}
              >
                Generate Blank Template
              </button>
            </div>
            <p className="text-sm text-slate-500">
              {fixMode === 'scale_original' && "Resizes your uploaded PDF and scales the existing pages to fit the new KDP dimensions."}
              {fixMode === 'center_original' && "Adds the required KDP margins/bleed around your existing pages without stretching or scaling them (best for text manuscripts)."}
              {fixMode === 'blank_template' && "Creates a blank PDF with the exact same number of pages, but adds KDP bleed and safe area guides so you can place your own images."}
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
              <Upload className="text-indigo-500" /> 1. Upload PDF
            </h3>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-4 border-dashed border-slate-200 rounded-3xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all"
            >
              <input 
                type="file" 
                accept="application/pdf" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              {pdfFile ? (
                <div className="space-y-2">
                  <FileText size={48} className="mx-auto text-indigo-500" />
                  <p className="font-bold text-slate-700">{pdfFile.name}</p>
                  <p className="text-sm text-slate-400">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload size={48} className="mx-auto text-slate-300" />
                  <p className="font-bold text-slate-500">Click to upload PDF</p>
                  <p className="text-sm text-slate-400">Interior or Cover PDF</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
              <FileText className="text-amber-500" /> 2. Paste KDP Email
            </h3>
            <textarea
              value={kdpNotes}
              onChange={(e) => setKdpNotes(e.target.value)}
              placeholder="Paste the exact text from the KDP rejection email here. E.g., 'Update your file to ensure all background images and graphics extend 0.125” (3.2 mm) beyond the trim line...'"
              className="w-full h-48 p-6 bg-slate-50 rounded-3xl border-2 border-slate-100 focus:border-amber-400 focus:ring-0 resize-none font-medium text-slate-700"
            />
          </div>

          <button
            onClick={processPdf}
            disabled={!pdfFile || !kdpNotes || isProcessing}
            className="w-full py-6 bg-indigo-600 text-white rounded-full font-black text-xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50 disabled:hover:scale-100"
          >
            {isProcessing ? <Loader2 className="animate-spin" size={28} /> : <CheckCircle2 size={28} />}
            {isProcessing ? "ANALYZING & FIXING..." : "FIX PDF NOW"}
          </button>
        </div>

        {/* Right Column: Results */}
        <div className="bg-slate-50 rounded-[3rem] p-10 border border-slate-200 flex flex-col justify-center items-center text-center space-y-6">
          {error && (
            <div className="p-6 bg-rose-100 text-rose-700 rounded-3xl flex items-start gap-4 text-left w-full">
              <AlertCircle size={24} className="shrink-0 mt-1" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          {successMsg && (
            <div className="p-6 bg-emerald-100 text-emerald-700 rounded-3xl flex items-start gap-4 text-left w-full">
              <CheckCircle2 size={24} className="shrink-0 mt-1" />
              <p className="font-medium">{successMsg}</p>
            </div>
          )}

          {!fixedPdfUrl && !isProcessing && !error && !successMsg && (
            <div className="text-slate-400 space-y-4">
              <FileText size={64} className="mx-auto opacity-50" />
              <p className="font-medium text-lg">Your fixed PDF will appear here.</p>
            </div>
          )}

          {isProcessing && (
            <div className="text-indigo-500 space-y-4 animate-pulse">
              <Loader2 size={64} className="mx-auto animate-spin" />
              <p className="font-bold text-lg">AI is calculating new dimensions...</p>
            </div>
          )}

          {fixedPdfUrl && (
            <div className="space-y-6 w-full animate-in zoom-in duration-500">
              <div className="w-32 h-40 bg-white shadow-xl mx-auto rounded-lg border border-slate-200 flex items-center justify-center">
                <FileText size={48} className="text-emerald-500" />
              </div>
              <a
                href={fixedPdfUrl}
                download={`Fixed_${pdfFile?.name || 'Document.pdf'}`}
                className="w-full py-6 bg-emerald-500 text-white rounded-full font-black text-xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4 block"
              >
                <Download size={28} /> DOWNLOAD FIXED PDF
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="text-center pt-8">
        <button onClick={onBack} className="text-slate-400 font-bold hover:text-slate-600 underline text-xl">Back to Main Menu</button>
      </div>
    </div>
  );
};
