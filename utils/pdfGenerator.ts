
import { jsPDF } from "jspdf";
import { BookPage, PRINT_FORMATS, ExportFormat, SpreadExportMode } from "../types";
import { getInsideMargin, validateProjectForKDP, calculateCoverWithBleed } from "../kdpConfig";
import { loadGoogleFont, getGoogleFontsParams, getFontRecommendation } from "./fontLoader";

/**
 * Calculates the exact gutter requirement based on platform standards.
 * Higher page count requires more gutter for spine curve.
 */
const calculateGutter = (pageCount: number, format: ExportFormat): number => {
  if (format.startsWith('KDP_')) {
    return getInsideMargin(pageCount);
  }

  const config = PRINT_FORMATS[format];
  const base = config?.baseGutter || 0.375;

  if (pageCount > 600) return base + 0.5;
  if (pageCount > 400) return base + 0.375;
  if (pageCount > 150) return base + 0.25;
  if (pageCount > 76) return base + 0.125;

  return base;
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

  pdf.addImage(coverImage, 'JPEG', 0, 0, coverDims.width, coverDims.height, undefined, 'FAST');
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
  const singleFullWidth = config.width + config.bleed;
  const fullHeight = config.height + (config.bleed * 2);
  const spreadWidth = (config.width * 2) + (config.bleed * 2);

  const pdf = new jsPDF({
    orientation: config.width > config.height ? 'landscape' : 'portrait',
    unit: 'in',
    format: [singleFullWidth, fullHeight]
  });

  // ─── Pre-load the selected Google Font once ───────────────────────────────
  const fontFamily = settings.textFont || 'Nunito';
  const storyType = settings.storyType || 'children_picture_book';
  const fontRec = getFontRecommendation(storyType);
  const baseFontSize = settings.textFontSize || fontRec.fontSize || 24; // pt at 72 dpi
  const googleFontsParams = getGoogleFontsParams(fontFamily, '700');

  if (overlayText) {
    await loadGoogleFont(fontFamily, googleFontsParams, '700');
  }

  /**
   * Renders one or two text blocks onto a transparent canvas at 300 DPI.
   *
   * @param textBlocks  Array of { content, side } where side is 'full' | 'left' | 'right'.
   *                    When side='left' or 'right' the text is constrained to that page half
   *                    so it never crosses the gutter fold on a spread.
   * @param widthIn     Canvas width in inches
   * @param heightIn    Canvas height in inches
   * @param safeLeftIn  Safe-zone left edge (inches)
   * @param safeRightIn Safe-zone right edge (inches)
   * @param safeTopIn   Safe-zone top edge (inches)
   * @param safeBottomIn Safe-zone bottom margin from top (inches) — the y coordinate of the
   *                     safe bottom boundary = heightIn - safeBottomIn
   * @param gutterHalfIn Half the total gutter width in inches (each page side is inset this much
   *                     from the centre). Only used for left/right sided text on spreads.
   */
  const createTextImage = async (
    textBlocks: { content: string; side: 'full' | 'left' | 'right' }[],
    widthIn: number,
    heightIn: number,
    safeLeftIn: number,
    safeRightIn: number,
    safeTopIn: number,
    safeBottomIn: number,
    gutterHalfIn: number = 0
  ): Promise<string> => {
    const dpi = 300;
    const canvasW = Math.round(widthIn * dpi);
    const canvasH = Math.round(heightIn * dpi);

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.clearRect(0, 0, canvasW, canvasH);

    const fontSizePx = baseFontSize * (dpi / 72);
    const lineHeightPx = fontSizePx * (fontRec.lineHeightMultiplier || 1.55);
    const fontSpec = `bold ${fontSizePx}px "${fontFamily}", "${fontRec.fallback || 'sans-serif'}"`;

    const position = settings.overlayTextPosition || 'bottom';
    const hasBg = settings.overlayTextBackground && settings.overlayTextBackground !== 'transparent';
    const hasShadow = settings.overlayTextShadow !== false;

    for (const { content, side } of textBlocks) {
      if (!content?.trim()) continue;

      // ── Determine the horizontal safe column for this block ──────────────
      const halfX = canvasW / 2;
      const gutterPx = gutterHalfIn * dpi;

      let colLeft: number;
      let colRight: number;

      if (side === 'left') {
        colLeft = safeLeftIn * dpi;
        colRight = halfX - gutterPx;
      } else if (side === 'right') {
        colLeft = halfX + gutterPx;
        colRight = safeRightIn * dpi;
      } else {
        colLeft = safeLeftIn * dpi;
        colRight = safeRightIn * dpi;
      }

      const colWidth = colRight - colLeft;
      if (colWidth <= 0) continue;

      const centerX = colLeft + colWidth / 2;

      // ── Word-wrap ────────────────────────────────────────────────────────
      ctx.font = fontSpec;
      ctx.textAlign = 'center';

      const words = content.trim().split(/\s+/);
      const wrappedLines: string[] = [];
      let currentLine = '';
      for (let n = 0; n < words.length; n++) {
        const testLine = currentLine ? `${currentLine} ${words[n]}` : words[n];
        if (ctx.measureText(testLine).width > colWidth && currentLine) {
          wrappedLines.push(currentLine);
          currentLine = words[n];
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) wrappedLines.push(currentLine);

      const blockHeight = wrappedLines.length * lineHeightPx;

      // ── Vertical positioning ─────────────────────────────────────────────
      const safeTopPx = safeTopIn * dpi;
      const safeBottomBoundaryPx = (heightIn - safeBottomIn) * dpi;

      let blockStartY: number;
      if (position === 'top') {
        blockStartY = safeTopPx + lineHeightPx;
      } else if (position === 'center') {
        blockStartY = canvasH / 2 - blockHeight / 2 + lineHeightPx;
      } else {
        // bottom — anchor block just above the safe-bottom boundary
        blockStartY = safeBottomBoundaryPx - blockHeight;
      }

      // ── Background box ───────────────────────────────────────────────────
      if (hasBg) {
        const bgPadX = fontSizePx * 0.65;
        const bgPadY = fontSizePx * 0.4;

        // Measure actual widest line for tight box
        ctx.font = fontSpec;
        const maxLineWidth = Math.max(...wrappedLines.map(l => ctx.measureText(l).width));
        const boxW = Math.min(maxLineWidth + bgPadX * 2, colWidth + bgPadX * 2);
        const boxH = blockHeight + bgPadY * 2;
        const boxX = centerX - boxW / 2;
        const boxY = blockStartY - lineHeightPx + (lineHeightPx - fontSizePx) * 0.5 - bgPadY;
        const radius = fontSizePx * 0.35;

        let bgColor: string;
        switch (settings.overlayTextBackground) {
          case 'solid-white':             bgColor = 'rgba(255,255,255,0.95)'; break;
          case 'semi-transparent-white':  bgColor = 'rgba(255,255,255,0.78)'; break;
          case 'semi-transparent-black':  bgColor = 'rgba(0,0,0,0.55)';       break;
          default:                        bgColor = 'rgba(255,255,255,0.95)'; break;
        }

        ctx.save();
        ctx.fillStyle = bgColor;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, radius);
        ctx.fill();
        ctx.restore();
      }

      // ── Text shadow ──────────────────────────────────────────────────────
      if (hasShadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      // ── Draw text ────────────────────────────────────────────────────────
      ctx.font = fontSpec;
      ctx.textAlign = 'center';
      ctx.fillStyle = settings.overlayTextColor || '#1a1a2e';

      wrappedLines.forEach((line, i) => {
        ctx.fillText(line, centerX, blockStartY + i * lineHeightPx);
      });

      // Reset shadow before next block
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    return canvas.toDataURL('image/png');
  };

  // ── Helper: build text block array for a page ──────────────────────────────
  const buildTextBlocks = (
    page: BookPage,
    isSpread: boolean
  ): { content: string; side: 'full' | 'left' | 'right' }[] => {
    const spreadSide = settings.spreadTextSide || 'right';
    const originalText = page.originalText?.trim() || '';
    const translatedText = page.translatedText?.trim() || '';

    if (!isSpread) {
      return originalText ? [{ content: originalText, side: 'full' }] : [];
    }

    // Spread page — keep text within each page half to avoid gutter cut-off
    if (spreadSide === 'both' && originalText && translatedText) {
      // Bilingual layout: translated on left page, original on right page
      return [
        { content: translatedText, side: 'left' },
        { content: originalText, side: 'right' },
      ];
    }

    if (spreadSide === 'left') {
      return originalText ? [{ content: originalText, side: 'left' }] : [];
    }

    // Default: right page
    return originalText ? [{ content: originalText, side: 'right' }] : [];
  };

  // ─── Page rendering loop ───────────────────────────────────────────────────
  let currentPageNum = 1;

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
        const bg         = page.layers.find(l => l.type === 'background'  && l.isVisible);
        const chars      = page.layers.find(l => l.type === 'character'   && l.isVisible);
        const textLayer  = page.layers.find(l => l.type === 'text'        && l.isVisible);
        const foreground = page.layers.find(l => l.type === 'foreground'  && l.isVisible);

        if (bg)         pdf.addImage(bg.image,         'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
        if (chars)      pdf.addImage(chars.image,      'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
        if (foreground) pdf.addImage(foreground.image, 'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
        if (textLayer)  pdf.addImage(textLayer.image,  'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');

        if (overlayText && page.originalText && !textLayer) {
          const safeTopIn    = config.top + config.bleed;
          const safeBottomIn = config.bottom + config.bleed;
          const safeLeftIn   = config.outside + config.bleed;
          const safeRightIn  = spreadWidth - config.outside - config.bleed;
          const blocks = buildTextBlocks(page, true);
          const textImg = await createTextImage(blocks, spreadWidth, fullHeight, safeLeftIn, safeRightIn, safeTopIn, safeBottomIn, gutter / 2);
          if (textImg) pdf.addImage(textImg, 'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
        }
      } else {
        pdf.addImage(image, 'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');

        if (overlayText && page.originalText) {
          const safeTopIn    = config.top + config.bleed;
          const safeBottomIn = config.bottom + config.bleed;
          const safeLeftIn   = config.outside + config.bleed;
          const safeRightIn  = spreadWidth - config.outside - config.bleed;
          const blocks = buildTextBlocks(page, true);
          const textImg = await createTextImage(blocks, spreadWidth, fullHeight, safeLeftIn, safeRightIn, safeTopIn, safeBottomIn, gutter / 2);
          if (textImg) pdf.addImage(textImg, 'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');
        }
      }
      currentPageNum += 2;

    } else if (page.isSpread && spreadMode === 'SPLIT_PAGES') {
      // Left page
      if (currentPageNum > 1) pdf.addPage([singleFullWidth, fullHeight], config.width > config.height ? 'landscape' : 'portrait');
      pdf.addImage(image, 'PNG', 0, 0, spreadWidth, fullHeight, undefined, 'FAST');

      if (overlayText && page.originalText) {
        const safeTopIn    = config.top + config.bleed;
        const safeBottomIn = config.bottom + config.bleed;
        const safeLeftIn   = config.outside + config.bleed;
        const safeRightIn  = singleFullWidth - gutter;
        const blocks: { content: string; side: 'full' | 'left' | 'right' }[] =
          page.originalText ? [{ content: page.originalText, side: 'full' }] : [];
        const textImg = await createTextImage(blocks, singleFullWidth, fullHeight, safeLeftIn, safeRightIn, safeTopIn, safeBottomIn, 0);
        if (textImg) pdf.addImage(textImg, 'PNG', 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');
      }
      currentPageNum++;

      // Right page
      pdf.addPage([singleFullWidth, fullHeight], config.width > config.height ? 'landscape' : 'portrait');
      pdf.addImage(image, 'PNG', -(spreadWidth - singleFullWidth), 0, spreadWidth, fullHeight, undefined, 'FAST');
      currentPageNum++;

    } else {
      // Single page
      if (currentPageNum > 1) pdf.addPage([singleFullWidth, fullHeight], config.width > config.height ? 'landscape' : 'portrait');

      if ((layeredMode || (page.layers && page.layers.length > 0)) && page.layers) {
        const bg         = page.layers.find(l => l.type === 'background'  && l.isVisible);
        const chars      = page.layers.find(l => l.type === 'character'   && l.isVisible);
        const textLayer  = page.layers.find(l => l.type === 'text'        && l.isVisible);
        const foreground = page.layers.find(l => l.type === 'foreground'  && l.isVisible);

        if (bg)         pdf.addImage(bg.image,         'PNG', 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');
        if (chars)      pdf.addImage(chars.image,      'PNG', 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');
        if (foreground) pdf.addImage(foreground.image, 'PNG', 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');
        if (textLayer)  pdf.addImage(textLayer.image,  'PNG', 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');

        if (overlayText && page.originalText && !textLayer) {
          const safeTopIn    = config.top    + config.bleed;
          const safeBottomIn = config.bottom + config.bleed;
          const safeLeftIn   = isRightPage ? (gutter + config.bleed)             : (config.outside + config.bleed);
          const safeRightIn  = isRightPage ? (singleFullWidth - config.outside - config.bleed) : (singleFullWidth - gutter - config.bleed);
          const blocks = buildTextBlocks(page, false);
          const textImg = await createTextImage(blocks, singleFullWidth, fullHeight, safeLeftIn, safeRightIn, safeTopIn, safeBottomIn, 0);
          if (textImg) pdf.addImage(textImg, 'PNG', 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');
        }
      } else {
        pdf.addImage(image, 'PNG', 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');

        if (overlayText && page.originalText) {
          const safeTopIn    = config.top    + config.bleed;
          const safeBottomIn = config.bottom + config.bleed;
          const safeLeftIn   = isRightPage ? (gutter + config.bleed)             : (config.outside + config.bleed);
          const safeRightIn  = isRightPage ? (singleFullWidth - config.outside - config.bleed) : (singleFullWidth - gutter - config.bleed);
          const blocks = buildTextBlocks(page, false);
          const textImg = await createTextImage(blocks, singleFullWidth, fullHeight, safeLeftIn, safeRightIn, safeTopIn, safeBottomIn, 0);
          if (textImg) pdf.addImage(textImg, 'PNG', 0, 0, singleFullWidth, fullHeight, undefined, 'FAST');
        }
      }
      currentPageNum++;
    }

    // Yield to main thread to prevent UI freeze
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  pdf.save(`${title.replace(/\s+/g, '_')}_PRINT_INTERIOR.pdf`);
};
