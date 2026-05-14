
import { jsPDF } from "jspdf";
import { BookPage, PRINT_FORMATS, ExportFormat, SpreadExportMode } from "../types";
import { getInsideMargin, validateProjectForKDP, calculateCoverWithBleed } from "../kdpConfig";

/**
 * Calculates the exact gutter requirement based on platform standards
 * Higher page count requires more gutter for spine curve.
 */
const calculateGutter = (pageCount: number, format: ExportFormat): number => {
  if (format.startsWith('KDP_')) {
    return getInsideMargin(pageCount);
  }

  const config = PRINT_FORMATS[format];
  const base = config?.baseGutter || 0.375;

  // Standard KDP/Lulu paper thickness calculations
  if (pageCount > 600) return base + 0.5;
  if (pageCount > 400) return base + 0.375;
  if (pageCount > 150) return base + 0.25;
  if (pageCount > 76) return base + 0.125;

  return base;
};

const getImageFormat = (dataUri: string) => {
  if (typeof dataUri === 'string') {
    if (dataUri.startsWith('data:image/jpeg') || dataUri.startsWith('data:image/jpg')) return 'JPEG';
    if (dataUri.startsWith('data:image/webp')) return 'WEBP';
  }
  return 'PNG';
};

/**
 * Loads a base64 data URL as an HTMLImageElement using the browser's native
 * image decoder. Passing an HTMLImageElement to jsPDF's addImage() bypasses
 * jsPDF's internal base64→binary→PNG-decode chain, which is the source of the
 * "Maximum call stack size exceeded" error on large 4K images. The image is
 * rendered at its full natural resolution — no quality loss, no format change.
 */
const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for PDF'));
    img.src = src;
  });

/**
 * Safe base64 → Uint8Array conversion that avoids the
 * "Maximum call stack size exceeded" error caused by
 * Uint8Array.from(string, mapFn) on very large strings.
 */
const base64ToBytes = (b64: string): Uint8Array => {
  const binary = atob(b64.includes(',') ? b64.split(',')[1] : b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const generateCoverPDF = async (
  coverImage: string,
  format: ExportFormat,
  title: string,
  totalEstimatedPages: number,
  paperType: 'white' | 'cream' = 'white',
  colorType: 'bw' | 'standard_color' | 'premium_color' = 'standard_color'
) => {
  const config = PRINT_FORMATS[format] || PRINT_FORMATS.KDP_8_5x8_5;
  
  const coverDims = calculateCoverWithBleed(config.width, config.height, totalEstimatedPages, paperType, colorType);
  
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'in',
    format: [coverDims.width, coverDims.height]
  });

  pdf.addImage(coverImage, getImageFormat(coverImage), 0, 0, coverDims.width, coverDims.height, undefined, 'FAST');
  pdf.save(`${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_cover_kdp.pdf`);
};

export const generateBookPDF = async (
  pages: BookPage[],
  format: ExportFormat,
  title: string,
  overlayText: boolean,
  totalEstimatedPages: number,
  spreadMode: SpreadExportMode = 'WIDE_SPREAD',
  layeredMode: boolean = false,
  settings: any = {}
) => {
  const validation = validateProjectForKDP(pages, format, totalEstimatedPages);
  if (!validation.isValid) {
    console.error("KDP Pre-flight Validation Errors:", validation.errors);
  }
  if (validation.warnings.length > 0) {
    console.warn("KDP Pre-flight Validation Warnings:", validation.warnings);
  }

  const config = PRINT_FORMATS[format] || PRINT_FORMATS.KDP_8_5x8_5;
  const gutter = calculateGutter(totalEstimatedPages, format);
  
  // Dimensions with bleed (standard 0.125" for KDP/Lulu)
  // KDP requires bleed on top, bottom, and outside edges. No bleed on inside edge.
  const singleFullWidth = config.width + config.bleed; // Only outside edge gets bleed
  const fullHeight = config.height + (config.bleed * 2); // Top and bottom get bleed
  const spreadWidth = (config.width * 2) + (config.bleed * 2); // Both outside edges get bleed

  const strippedPages = pages.map(p => ({
    ...p,
    originalImage: undefined,
    processedImage: undefined,
    layers: undefined
  }));
  const strippedSettings = {
    ...settings,
    characterReferences: settings.characterReferences?.map((c: any) => ({ ...c, image: undefined }))
  };
  const exportMeta = {
    settings: strippedSettings,
    pages: strippedPages,
    title,
    totalEstimatedPages
  };

  const pdf = new jsPDF({
    orientation: config.width > config.height ? 'landscape' : 'portrait',
    unit: 'in',
    format: [singleFullWidth, fullHeight]
  });
  pdf.setProperties({
    creator: 'Storyflow',
    subject: JSON.stringify(exportMeta)
  });

  const { loadGoogleFont } = await import('./fontLoader');

  let currentPageNum = 1;

  // Returns the canvas element directly so jsPDF can read pixel data without an
  // intermediate PNG data-URL (avoids stack overflow on large canvases).
  const createTextImageAsync = async (
    text: string, widthIn: number, heightIn: number, safeLeftIn: number, safeRightIn: number, safeBottomIn: number,
    textPositionOverride?: 'top' | 'center' | 'bottom' | 'hidden',
    textBackgroundOverride?: 'transparent' | 'solid-white' | 'semi-transparent-white' | 'semi-transparent-black'
  ): Promise<HTMLCanvasElement | null> => {
    if (textPositionOverride === 'hidden') return null;
    if (settings.textFont) {
      await loadGoogleFont(settings.textFont);
    }
    const dpi = 300;
    const canvas = document.createElement('canvas');
    canvas.width = widthIn * dpi;
    canvas.height = heightIn * dpi;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fontSize = (settings.overlayTextSize || 24) * (dpi/72);
    ctx.font = `bold ${fontSize}px ${settings.textFont || 'Inter'}, sans-serif`;
    ctx.fillStyle = settings.overlayTextColor || 'black';
    ctx.textAlign = 'center';
    
    const safeLeftPx = safeLeftIn * dpi;
    const safeRightPx = safeRightIn * dpi;
    const safeBottomPx = safeBottomIn * dpi;
    const maxWidthPx = safeRightPx - safeLeftPx;
    const centerXPx = safeLeftPx + (maxWidthPx / 2);
    
    // Simple word wrap with explicit newline and || support
    let allLines: string[] = [];
    const paragraphs = text.split(/(?:\n|\|\|)/).map(p => p.trim()).filter(Boolean);
    
    for (const p of paragraphs) {
      const words = p.split(' ');
      let line = '';
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidthPx && n > 0) {
          allLines.push(line);
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      allLines.push(line);
      // add a small gap after paragraph if it's not the last one? 
      // easiest way is to just let line height handle it, or we could add an empty line
      allLines.push('');
    }
    // Remove the trailing empty line
    if (allLines.length > 0 && allLines[allLines.length - 1] === '') {
      allLines.pop();
    }
    
    const lines = allLines;
    
    const maxLineWidthPx = Math.max(...lines.map(l => ctx.measureText(l.trim()).width));
    const actualWidthPx = Math.min(maxWidthPx, maxLineWidthPx);

    const lineHeight = (settings.overlayTextSize || 24) * 1.25 * (dpi/72);
    const totalHeight = lines.length * lineHeight;
    let startY = safeBottomPx - totalHeight + lineHeight; // default bottom
    
    const pos = textPositionOverride || settings.overlayTextPosition;
    if (pos === 'top') {
        const titleSafeTopPx = 0.5 * dpi; // approx safe top
        startY = titleSafeTopPx + lineHeight;
    } else if (pos === 'center') {
        startY = (canvas.height / 2) - (totalHeight / 2) + lineHeight;
    }

    const bgSetting = textBackgroundOverride || settings.overlayTextBackground;
    if (bgSetting && bgSetting !== 'transparent') {
      let bgColor = 'rgba(255, 255, 255, 1)';
      if (bgSetting === 'semi-transparent-white') bgColor = 'rgba(255, 255, 255, 0.7)';
      if (bgSetting === 'semi-transparent-black') bgColor = 'rgba(0, 0, 0, 0.5)';
      
      ctx.fillStyle = bgColor;
      const boxPad = fontSize * 0.75;
      ctx.beginPath();
      // Use actual width instead of max width for tighter background box
      ctx.roundRect(
        centerXPx - (actualWidthPx / 2) - boxPad, 
        startY - lineHeight - boxPad + (lineHeight * 0.25), 
        actualWidthPx + (boxPad * 2), 
        totalHeight + (boxPad * 2),
        fontSize * 0.5
      );
      ctx.fill();
    }

    if (settings.overlayTextShadow !== false) {
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
    }

    ctx.fillStyle = settings.overlayTextColor || 'black';
    lines.forEach((l, i) => {
      ctx.fillText(l.trim(), centerXPx, startY + i * lineHeight);
    });
    
    return canvas;
  };

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const image = page.processedImage || page.originalImage;
    if (!image) continue;

    const isRightPage = currentPageNum % 2 !== 0;

    if (page.isSpread && spreadMode === 'WIDE_SPREAD') {
      if (currentPageNum === 1) {
        (pdf as any).setPage(1);
        pdf.addPage([spreadWidth, fullHeight], 'landscape');
        pdf.deletePage(1);
      } else {
        pdf.addPage([spreadWidth, fullHeight], 'landscape');
      }
      
      if ((layeredMode || (page.layers && page.layers.length > 0)) && page.layers) {
        // Draw layers separately
        const bg = page.layers.find(l => l.type === 'background' && l.isVisible);
        const chars = page.layers.find(l => l.type === 'character' && l.isVisible);
        const textLayer = page.layers.find(l => l.type === 'text' && l.isVisible);
        const foreground = page.layers.find(l => l.type === 'foreground' && l.isVisible);

        // Use HTMLImageElement so jsPDF decodes via the native browser engine,
        // avoiding the recursive stack overflow that occurs with raw base64 PNGs.
        if (bg)  pdf.addImage(await loadImage(bg.image),  getImageFormat(bg.image),  0, 0, spreadWidth, fullHeight, undefined, 'FAST');
        if (chars) pdf.addImage(await loadImage(chars.image), getImageFormat(chars.image), 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
        if (foreground) pdf.addImage(await loadImage(foreground.image), getImageFormat(foreground.image), 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
        if (textLayer) pdf.addImage(await loadImage(textLayer.image), getImageFormat(textLayer.image), 0, 0, spreadWidth, fullHeight, undefined, 'FAST');

        // Active Text (Dynamic)
        if (overlayText && page.originalText && !textLayer) {
          const safeBottom = fullHeight - config.bottom - config.bleed;

          if (settings.spreadTextSide === 'left') {
            const safeLeft = config.outside + config.bleed;
            const safeRight = (spreadWidth / 2) - gutter;
            const textImg = await createTextImageAsync(page.originalText, spreadWidth, fullHeight, safeLeft, safeRight, safeBottom, page.textPositionOverride, page.textBackgroundOverride);
            if (textImg) pdf.addImage(textImg, 'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
          } else if (settings.spreadTextSide === 'both') {
            const textParts = page.originalText.split('||').map(t => t.trim()).filter(Boolean);
            const mid = Math.ceil(textParts.length / 2);
            const leftText = textParts.slice(0, mid).join('\n\n') || page.originalText;
            const rightText = textParts.slice(mid).join('\n\n') || page.originalText;

            const safeLeftL = config.outside + config.bleed;
            const safeRightL = (spreadWidth / 2) - gutter;
            const textImgL = await createTextImageAsync(leftText, spreadWidth, fullHeight, safeLeftL, safeRightL, safeBottom, page.textPositionOverride, page.textBackgroundOverride);
            if (textImgL) pdf.addImage(textImgL, 'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');

            const safeLeftR = (spreadWidth / 2) + gutter;
            const safeRightR = spreadWidth - config.outside - config.bleed;
            const textImgR = await createTextImageAsync(rightText, spreadWidth, fullHeight, safeLeftR, safeRightR, safeBottom, page.textPositionOverride, page.textBackgroundOverride);
            if (textImgR) pdf.addImage(textImgR, 'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
          } else {
            const safeLeft = (spreadWidth / 2) + gutter;
            const safeRight = spreadWidth - config.outside - config.bleed;
            const textImg = await createTextImageAsync(page.originalText, spreadWidth, fullHeight, safeLeft, safeRight, safeBottom, page.textPositionOverride, page.textBackgroundOverride);
            if (textImg) pdf.addImage(textImg, 'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
          }
        }
      } else {
        pdf.addImage(await loadImage(image), getImageFormat(image), 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
        if (overlayText && page.originalText) {
          const safeBottom = fullHeight - config.bottom - config.bleed;

          if (settings.spreadTextSide === 'left') {
            const safeLeft = config.outside + config.bleed;
            const safeRight = (spreadWidth / 2) - gutter;
            const textCanvas = await createTextImageAsync(page.originalText, spreadWidth, fullHeight, safeLeft, safeRight, safeBottom, page.textPositionOverride, page.textBackgroundOverride);
            if (textCanvas) pdf.addImage(textCanvas, 'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
          } else if (settings.spreadTextSide === 'both') {
            const textParts = page.originalText.split('||').map(t => t.trim()).filter(Boolean);
            const mid = Math.ceil(textParts.length / 2);
            const leftText = textParts.slice(0, mid).join('\n\n') || page.originalText;
            const rightText = textParts.slice(mid).join('\n\n') || page.originalText;

            const safeLeftL = config.outside + config.bleed;
            const safeRightL = (spreadWidth / 2) - gutter;
            const textCanvasL = await createTextImageAsync(leftText, spreadWidth, fullHeight, safeLeftL, safeRightL, safeBottom, page.textPositionOverride, page.textBackgroundOverride);
            if (textCanvasL) pdf.addImage(textCanvasL, 'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');

            const safeLeftR = (spreadWidth / 2) + gutter;
            const safeRightR = spreadWidth - config.outside - config.bleed;
            const textCanvasR = await createTextImageAsync(rightText, spreadWidth, fullHeight, safeLeftR, safeRightR, safeBottom, page.textPositionOverride, page.textBackgroundOverride);
            if (textCanvasR) pdf.addImage(textCanvasR, 'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
          } else {
            const safeLeft = (spreadWidth / 2) + gutter;
            const safeRight = spreadWidth - config.outside - config.bleed;
            const textCanvas = await createTextImageAsync(page.originalText, spreadWidth, fullHeight, safeLeft, safeRight, safeBottom, page.textPositionOverride, page.textBackgroundOverride);
            if (textCanvas) pdf.addImage(textCanvas, 'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
          }
        }
      }
      currentPageNum += 2;
    } else if (page.isSpread && spreadMode === 'SPLIT_PAGES') {
      if (currentPageNum > 1) pdf.addPage([singleFullWidth, fullHeight], config.width > config.height ? 'landscape' : 'portrait');

      const spreadImg = await loadImage(image);
      pdf.addImage(spreadImg, getImageFormat(image), 0, 0, spreadWidth, fullHeight, undefined, 'FAST');

      if (overlayText && page.originalText) {
        const safeBottom = fullHeight - config.bottom - config.bleed;
        const safeLeft = config.outside + config.bleed;
        const safeRight = singleFullWidth - gutter;
        const textCanvas = await createTextImageAsync(page.originalText, singleFullWidth, fullHeight, safeLeft, safeRight, safeBottom, page.textPositionOverride, page.textBackgroundOverride);
        if (textCanvas) pdf.addImage(textCanvas, 'PNG', 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');
      }
      currentPageNum++;

      pdf.addPage([singleFullWidth, fullHeight], config.width > config.height ? 'landscape' : 'portrait');
      pdf.addImage(spreadImg, getImageFormat(image), -(spreadWidth - singleFullWidth), 0, spreadWidth, fullHeight, undefined, 'FAST');
      currentPageNum++;

    } else {
      if (currentPageNum > 1) pdf.addPage([singleFullWidth, fullHeight], config.width > config.height ? 'landscape' : 'portrait');

      if ((layeredMode || (page.layers && page.layers.length > 0)) && page.layers) {
        const bg = page.layers.find(l => l.type === 'background' && l.isVisible);
        const chars = page.layers.find(l => l.type === 'character' && l.isVisible);
        const textLayer = page.layers.find(l => l.type === 'text' && l.isVisible);
        const foreground = page.layers.find(l => l.type === 'foreground' && l.isVisible);

        if (bg)  pdf.addImage(await loadImage(bg.image),  getImageFormat(bg.image),  0, 0, singleFullWidth, fullHeight, undefined, 'FAST');
        if (chars) pdf.addImage(await loadImage(chars.image), getImageFormat(chars.image), 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');
        if (foreground) pdf.addImage(await loadImage(foreground.image), getImageFormat(foreground.image), 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');
        if (textLayer) pdf.addImage(await loadImage(textLayer.image), getImageFormat(textLayer.image), 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');

        if (overlayText && page.originalText && !textLayer) {
          const safeBottom = fullHeight - config.bottom - config.bleed;
          const safeLeft = isRightPage ? (gutter + config.bleed) : (config.outside + config.bleed);
          const safeRight = isRightPage ? (singleFullWidth - config.outside - config.bleed) : (singleFullWidth - gutter - config.bleed);
          const textCanvas = await createTextImageAsync(page.originalText, singleFullWidth, fullHeight, safeLeft, safeRight, safeBottom, page.textPositionOverride, page.textBackgroundOverride);
          if (textCanvas) pdf.addImage(textCanvas, 'PNG', 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');
        }
      } else {
        pdf.addImage(await loadImage(image), getImageFormat(image), 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');
        if (overlayText && page.originalText) {
          const safeBottom = fullHeight - config.bottom - config.bleed;
          const safeLeft = isRightPage ? (gutter + config.bleed) : (config.outside + config.bleed);
          const safeRight = isRightPage ? (singleFullWidth - config.outside - config.bleed) : (singleFullWidth - gutter - config.bleed);
          const textCanvas = await createTextImageAsync(page.originalText, singleFullWidth, fullHeight, safeLeft, safeRight, safeBottom, page.textPositionOverride, page.textBackgroundOverride);
          if (textCanvas) pdf.addImage(textCanvas, 'PNG', 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');
        }
      }
      currentPageNum++;
    }

    // Yield to the main thread to prevent UI freezing
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  pdf.save(`${title.replace(/\s+/g, '_')}_PRINT_INTERIOR.pdf`);
};

/**
 * Generates a PDF where the story text is real, selectable, editable PDF text
 * (embedded Google Font or Helvetica fallback) positioned exactly where the
 * canvas-rendered overlay would appear. A clean background rectangle is drawn
 * beneath the text as a separate vector element so designers can restyle it.
 *
 * Illustration layers (background / character / foreground) are embedded as
 * images; the AI-generated text layer is intentionally omitted so the editable
 * text stands alone.
 */
export const generateLayeredEditablePDF = async (
  pages: BookPage[],
  format: ExportFormat,
  title: string,
  overlayText: boolean,
  totalEstimatedPages: number,
  spreadMode: SpreadExportMode = 'WIDE_SPREAD',
  settings: any = {}
) => {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const fontkitModule = await import('@pdf-lib/fontkit');
  const fontkit = (fontkitModule as any).default ?? fontkitModule;
  const { fetchFontBytesForPDF } = await import('./fontLoader');

  const config = PRINT_FORMATS[format] || PRINT_FORMATS.KDP_8_5x8_5;
  const gutter = calculateGutter(totalEstimatedPages, format);

  const singleFullWidth = config.width + config.bleed;
  const fullHeight = config.height + (config.bleed * 2);
  const spreadWidth = (config.width * 2) + (config.bleed * 2);

  // 1 inch = 72 PDF points
  const singleWidthPts = singleFullWidth * 72;
  const spreadWidthPts = spreadWidth * 72;
  const heightPts = fullHeight * 72;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  // Embed the selected Google Font; fall back to Helvetica Bold
  let embeddedFont = await doc.embedFont(StandardFonts.HelveticaBold);
  if (settings.textFont) {
    const fontBytes = await fetchFontBytesForPDF(settings.textFont);
    if (fontBytes) {
      try {
        embeddedFont = await doc.embedFont(fontBytes);
      } catch {
        console.warn('Could not embed custom font; falling back to Helvetica');
      }
    }
  }

  // --- helpers -----------------------------------------------------------

  const parseHexColor = (hex: string) => {
    const h = hex.replace('#', '');
    return rgb(
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255
    );
  };

  /** Embed & draw a base64 image onto a pdf-lib page at (x, y, w, h) in pts.
   *  Uses base64ToBytes (safe loop) and preserves the original image format
   *  so illustration quality is not degraded in the editable PDF.
   */
  const drawImageOnPage = async (
    pdfPage: any,
    imageData: string,
    x: number, y: number, w: number, h: number
  ) => {
    if (!imageData) return;
    const fmt = getImageFormat(imageData);
    const bytes = base64ToBytes(imageData);
    const img = fmt === 'JPEG' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    pdfPage.drawImage(img, { x, y, width: w, height: h });
  };

  /**
   * Compute word-wrapped text layout identical to createTextImageAsync, then
   * draw background rectangle + editable text onto the pdf-lib page.
   *
   * Coordinate note: pdf-lib origin is BOTTOM-LEFT; canvas origin is TOP-LEFT.
   * safeBottomIn is measured from the TOP (= fullHeight - bottomMargin - bleed).
   */
  const drawEditableText = (
    pdfPage: any,
    text: string,
    pageWidthIn: number,
    pageHeightIn: number,
    safeLeftIn: number,
    safeRightIn: number,
    safeBottomIn: number,   // distance from TOP to safe-bottom boundary (inches)
    textPositionOverride?: string,
    textBackgroundOverride?: string
  ) => {
    if (textPositionOverride === 'hidden') return;
    if (!text.trim()) return;

    const wPts = pageWidthIn * 72;
    const hPts = pageHeightIn * 72;

    const safeLeftPts  = safeLeftIn  * 72;
    const safeRightPts = safeRightIn * 72;
    const maxWidthPts  = safeRightPts - safeLeftPts;
    const centerXPts   = safeLeftPts + maxWidthPts / 2;

    // safeBottomIn is from top → convert to pdf-lib (from bottom)
    const safeBottomFromBottomPts = (pageHeightIn - safeBottomIn) * 72;

    const fontSizePts  = settings.overlayTextSize || 24;
    const lineHeightPts = fontSizePts * 1.25;

    // Word-wrap (mirrors createTextImageAsync logic)
    const allLines: string[] = [];
    const paragraphs = text.split(/(?:\n|\|\|)/).map(p => p.trim()).filter(Boolean);
    for (const para of paragraphs) {
      const words = para.split(' ');
      let line = '';
      for (const word of words) {
        const testLine = line + word + ' ';
        if (embeddedFont.widthOfTextAtSize(testLine, fontSizePts) > maxWidthPts && line) {
          allLines.push(line.trim());
          line = word + ' ';
        } else {
          line = testLine;
        }
      }
      allLines.push(line.trim());
      allLines.push(''); // paragraph gap (empty line)
    }
    if (allLines.length > 0 && allLines[allLines.length - 1] === '') allLines.pop();

    const totalHeightPts = allLines.length * lineHeightPts;

    // Y of the FIRST (topmost) line's baseline, in pdf-lib coords (from bottom)
    const pos = textPositionOverride || settings.overlayTextPosition || 'bottom';
    let firstLineY: number;
    if (pos === 'top') {
      // mirror: startY = 0.5*dpi + lineHeight (from canvas top)
      firstLineY = hPts - 0.5 * 72 - lineHeightPts;
    } else if (pos === 'center') {
      // mirror: startY = canvas.height/2 - totalHeight/2 + lineHeight (from canvas top)
      firstLineY = hPts / 2 + totalHeightPts / 2 - lineHeightPts;
    } else {
      // bottom: last line baseline at safeBottomFromBottomPts
      firstLineY = safeBottomFromBottomPts + (allLines.length - 1) * lineHeightPts;
    }

    // Actual text width for a tight background box
    const maxLineWidthPts = Math.max(
      ...allLines.map(l => embeddedFont.widthOfTextAtSize(l || ' ', fontSizePts))
    );
    const actualWidthPts = Math.min(maxWidthPts, maxLineWidthPts);
    const boxPadPts = fontSizePts * 0.75;

    // Background rectangle (vector, editable)
    const bgSetting = textBackgroundOverride || settings.overlayTextBackground || 'transparent';
    if (bgSetting !== 'transparent') {
      let bgColorRgb = rgb(1, 1, 1);
      let bgOpacity = 1;
      if (bgSetting === 'semi-transparent-white') { bgColorRgb = rgb(1, 1, 1); bgOpacity = 0.7; }
      if (bgSetting === 'semi-transparent-black') { bgColorRgb = rgb(0, 0, 0); bgOpacity = 0.5; }

      // Mirror canvas roundRect: top of box = startY - lineHeight - boxPad + lineHeight*0.25
      //   → pdf-lib bgBottom = firstLineY - (n - 0.75)*lineHeightPts - boxPadPts
      const bgY = firstLineY - (allLines.length - 0.75) * lineHeightPts - boxPadPts;
      pdfPage.drawRectangle({
        x: centerXPts - actualWidthPts / 2 - boxPadPts,
        y: bgY,
        width: actualWidthPts + 2 * boxPadPts,
        height: allLines.length * lineHeightPts + 2 * boxPadPts,
        color: bgColorRgb,
        opacity: bgOpacity,
      });
    }

    // Editable text lines
    const textColor = parseHexColor(settings.overlayTextColor || '#000000');
    allLines.forEach((line, i) => {
      if (!line) return;
      const lineWidth = embeddedFont.widthOfTextAtSize(line, fontSizePts);
      const lineX = centerXPts - lineWidth / 2; // centre-align
      const lineY = firstLineY - i * lineHeightPts;
      pdfPage.drawText(line, {
        x: lineX,
        y: lineY,
        font: embeddedFont,
        size: fontSizePts,
        color: textColor,
      });
    });
  };

  // --- page rendering ----------------------------------------------------

  let currentPageNum = 1;

  for (const page of pages) {
    const image = page.processedImage || page.originalImage;
    if (!image) continue;

    if (page.isSpread && spreadMode === 'WIDE_SPREAD') {
      const pdfPage = doc.addPage([spreadWidthPts, heightPts]);

      if (page.layers && page.layers.length > 0) {
        const bg  = page.layers.find(l => l.type === 'background'  && l.isVisible);
        const chr = page.layers.find(l => l.type === 'character'   && l.isVisible);
        const fg  = page.layers.find(l => l.type === 'foreground'  && l.isVisible);
        // Intentionally skip AI text layer — replaced by editable text below
        if (bg)  await drawImageOnPage(pdfPage, bg.image,  0, 0, spreadWidthPts, heightPts);
        if (chr) await drawImageOnPage(pdfPage, chr.image, 0, 0, spreadWidthPts, heightPts);
        if (fg)  await drawImageOnPage(pdfPage, fg.image,  0, 0, spreadWidthPts, heightPts);
      } else {
        await drawImageOnPage(pdfPage, image, 0, 0, spreadWidthPts, heightPts);
      }

      if (overlayText && page.originalText && page.textPositionOverride !== 'hidden') {
        const safeBottom = fullHeight - config.bottom - config.bleed;
        if (settings.spreadTextSide === 'left') {
          drawEditableText(pdfPage, page.originalText, spreadWidth, fullHeight,
            config.outside + config.bleed, (spreadWidth / 2) - gutter, safeBottom,
            page.textPositionOverride, page.textBackgroundOverride);
        } else if (settings.spreadTextSide === 'both') {
          const parts = page.originalText.split('||').map((t: string) => t.trim()).filter(Boolean);
          const mid = Math.ceil(parts.length / 2);
          drawEditableText(pdfPage, parts.slice(0, mid).join('\n\n') || page.originalText, spreadWidth, fullHeight,
            config.outside + config.bleed, (spreadWidth / 2) - gutter, safeBottom,
            page.textPositionOverride, page.textBackgroundOverride);
          drawEditableText(pdfPage, parts.slice(mid).join('\n\n') || page.originalText, spreadWidth, fullHeight,
            (spreadWidth / 2) + gutter, spreadWidth - config.outside - config.bleed, safeBottom,
            page.textPositionOverride, page.textBackgroundOverride);
        } else {
          drawEditableText(pdfPage, page.originalText, spreadWidth, fullHeight,
            (spreadWidth / 2) + gutter, spreadWidth - config.outside - config.bleed, safeBottom,
            page.textPositionOverride, page.textBackgroundOverride);
        }
      }
      currentPageNum += 2;

    } else if (page.isSpread && spreadMode === 'SPLIT_PAGES') {
      // Left page
      const leftPage = doc.addPage([singleWidthPts, heightPts]);
      await drawImageOnPage(leftPage, image, 0, 0, spreadWidthPts, heightPts);
      if (overlayText && page.originalText && page.textPositionOverride !== 'hidden') {
        const safeBottom = fullHeight - config.bottom - config.bleed;
        drawEditableText(leftPage, page.originalText, singleFullWidth, fullHeight,
          config.outside + config.bleed, singleFullWidth - gutter, safeBottom,
          page.textPositionOverride, page.textBackgroundOverride);
      }
      currentPageNum++;

      // Right page
      const rightPage = doc.addPage([singleWidthPts, heightPts]);
      // Shift image so the right half is visible
      await drawImageOnPage(rightPage, image, -(spreadWidthPts - singleWidthPts), 0, spreadWidthPts, heightPts);
      currentPageNum++;

    } else {
      const pdfPage = doc.addPage([singleWidthPts, heightPts]);
      const isRightPage = currentPageNum % 2 !== 0;

      if (page.layers && page.layers.length > 0) {
        const bg  = page.layers.find(l => l.type === 'background' && l.isVisible);
        const chr = page.layers.find(l => l.type === 'character'  && l.isVisible);
        const fg  = page.layers.find(l => l.type === 'foreground' && l.isVisible);
        if (bg)  await drawImageOnPage(pdfPage, bg.image,  0, 0, singleWidthPts, heightPts);
        if (chr) await drawImageOnPage(pdfPage, chr.image, 0, 0, singleWidthPts, heightPts);
        if (fg)  await drawImageOnPage(pdfPage, fg.image,  0, 0, singleWidthPts, heightPts);
      } else {
        await drawImageOnPage(pdfPage, image, 0, 0, singleWidthPts, heightPts);
      }

      if (overlayText && page.originalText && page.textPositionOverride !== 'hidden') {
        const safeBottom = fullHeight - config.bottom - config.bleed;
        const safeLeft  = isRightPage ? (gutter + config.bleed) : (config.outside + config.bleed);
        const safeRight = isRightPage
          ? (singleFullWidth - config.outside - config.bleed)
          : (singleFullWidth - gutter - config.bleed);
        drawEditableText(pdfPage, page.originalText, singleFullWidth, fullHeight,
          safeLeft, safeRight, safeBottom,
          page.textPositionOverride, page.textBackgroundOverride);
      }
      currentPageNum++;
    }

    // Yield to the main thread
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  const pdfBytes = await doc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${title.replace(/\s+/g, '_')}_LAYERED_EDITABLE.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};
