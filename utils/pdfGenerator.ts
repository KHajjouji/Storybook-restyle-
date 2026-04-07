
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
  textFont: string = 'Inter'
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

  const pdf = new jsPDF({
    orientation: config.width > config.height ? 'landscape' : 'portrait',
    unit: 'in',
    format: [singleFullWidth, fullHeight]
  });

  let currentPageNum = 1;

  const createTextImage = (text: string, widthIn: number, heightIn: number, safeLeftIn: number, safeRightIn: number, safeBottomIn: number): string => {
    const dpi = 300;
    const canvas = document.createElement('canvas');
    canvas.width = widthIn * dpi;
    canvas.height = heightIn * dpi;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `bold ${24 * (dpi/72)}px ${textFont}, sans-serif`;
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    const safeLeftPx = safeLeftIn * dpi;
    const safeRightPx = safeRightIn * dpi;
    const safeBottomPx = safeBottomIn * dpi;
    const maxWidthPx = safeRightPx - safeLeftPx;
    const centerXPx = safeLeftPx + (maxWidthPx / 2);
    
    // Simple word wrap
    const words = text.split(' ');
    let line = '';
    const lines = [];
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidthPx && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    
    const lineHeight = 30 * (dpi/72);
    const startY = safeBottomPx - (lines.length - 1) * lineHeight;
    
    lines.forEach((l, i) => {
      ctx.fillText(l.trim(), centerXPx, startY + i * lineHeight);
    });
    
    return canvas.toDataURL('image/png');
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

        if (bg) pdf.addImage(bg.image, 'PNG', 0, 0, spreadWidth, fullHeight);
        if (chars) pdf.addImage(chars.image, 'PNG', 0, 0, spreadWidth, fullHeight);
        if (foreground) pdf.addImage(foreground.image, 'PNG', 0, 0, spreadWidth, fullHeight);
        if (textLayer) pdf.addImage(textLayer.image, 'PNG', 0, 0, spreadWidth, fullHeight);
        
        // Active Text (Dynamic)
        if (overlayText && page.originalText && !textLayer) {
          const safeBottom = fullHeight - config.bottom - config.bleed;
          const safeLeft = config.outside + config.bleed;
          const safeRight = spreadWidth - config.outside - config.bleed;
          const textImg = createTextImage(page.originalText, spreadWidth, fullHeight, safeLeft, safeRight, safeBottom);
          if (textImg) pdf.addImage(textImg, 'PNG', 0, 0, spreadWidth, fullHeight);
        }
      } else {
        pdf.addImage(image, 'PNG', 0, 0, spreadWidth, fullHeight);
        if (overlayText && page.originalText) {
          const safeBottom = fullHeight - config.bottom - config.bleed;
          const safeLeft = config.outside + config.bleed;
          const safeRight = spreadWidth - config.outside - config.bleed;
          const textImg = createTextImage(page.originalText, spreadWidth, fullHeight, safeLeft, safeRight, safeBottom);
          if (textImg) pdf.addImage(textImg, 'PNG', 0, 0, spreadWidth, fullHeight);
        }
      }
      currentPageNum += 2;
    } else if (page.isSpread && spreadMode === 'SPLIT_PAGES') {
      // Split the spread into two single pages
      // Left Page (Even page, usually page 2, 4, etc. if starting from 1)
      if (currentPageNum > 1) pdf.addPage([singleFullWidth, fullHeight], config.width > config.height ? 'landscape' : 'portrait');
      
      // Draw left half of the spread. The spread is `spreadWidth` wide. We want to draw it such that the left half fits into `singleFullWidth`.
      // Since the left page has bleed on the left, but NO bleed on the right (gutter), the left half of the spread is exactly `singleFullWidth` wide.
      pdf.addImage(image, 'PNG', 0, 0, spreadWidth, fullHeight);
      
      // Active Text (Dynamic) for Left Page
      if (overlayText && page.originalText) {
        const safeBottom = fullHeight - config.bottom - config.bleed;
        const safeLeft = config.outside + config.bleed;
        const safeRight = singleFullWidth - gutter;
        const textImg = createTextImage(page.originalText, singleFullWidth, fullHeight, safeLeft, safeRight, safeBottom);
        if (textImg) pdf.addImage(textImg, 'PNG', 0, 0, singleFullWidth, fullHeight);
      }
      currentPageNum++;

      // Right Page (Odd page)
      pdf.addPage([singleFullWidth, fullHeight], config.width > config.height ? 'landscape' : 'portrait');
      
      // Draw right half of the spread. We shift the image left by `singleFullWidth`.
      // Wait, the spread image has bleed on the left and right. 
      // The right page needs bleed on the right, but NO bleed on the left (gutter).
      // So we shift the image left by `spreadWidth - singleFullWidth`.
      pdf.addImage(image, 'PNG', -(spreadWidth - singleFullWidth), 0, spreadWidth, fullHeight);
      
      currentPageNum++;
    } else {
      if (currentPageNum > 1) pdf.addPage([singleFullWidth, fullHeight], config.width > config.height ? 'landscape' : 'portrait');
      
      if ((layeredMode || (page.layers && page.layers.length > 0)) && page.layers) {
        const bg = page.layers.find(l => l.type === 'background' && l.isVisible);
        const chars = page.layers.find(l => l.type === 'character' && l.isVisible);
        const textLayer = page.layers.find(l => l.type === 'text' && l.isVisible);
        const foreground = page.layers.find(l => l.type === 'foreground' && l.isVisible);
        
        if (bg) pdf.addImage(bg.image, 'PNG', 0, 0, singleFullWidth, fullHeight);
        if (chars) pdf.addImage(chars.image, 'PNG', 0, 0, singleFullWidth, fullHeight);
        if (foreground) pdf.addImage(foreground.image, 'PNG', 0, 0, singleFullWidth, fullHeight);
        if (textLayer) pdf.addImage(textLayer.image, 'PNG', 0, 0, singleFullWidth, fullHeight);

        // Active Text (Dynamic)
        if (overlayText && page.originalText && !textLayer) {
          const safeBottom = fullHeight - config.bottom - config.bleed;
          const safeLeft = isRightPage ? (gutter + config.bleed) : (config.outside + config.bleed);
          const safeRight = isRightPage ? (singleFullWidth - config.outside - config.bleed) : (singleFullWidth - gutter - config.bleed);
          const textImg = createTextImage(page.originalText, singleFullWidth, fullHeight, safeLeft, safeRight, safeBottom);
          if (textImg) pdf.addImage(textImg, 'PNG', 0, 0, singleFullWidth, fullHeight);
        }
      } else {
        pdf.addImage(image, 'PNG', 0, 0, singleFullWidth, fullHeight);
        if (overlayText && page.originalText) {
          const safeBottom = fullHeight - config.bottom - config.bleed;
          const safeLeft = isRightPage ? (gutter + config.bleed) : (config.outside + config.bleed);
          const safeRight = isRightPage ? (singleFullWidth - config.outside - config.bleed) : (singleFullWidth - gutter - config.bleed);
          const textImg = createTextImage(page.originalText, singleFullWidth, fullHeight, safeLeft, safeRight, safeBottom);
          if (textImg) pdf.addImage(textImg, 'PNG', 0, 0, singleFullWidth, fullHeight);
        }
      }
      currentPageNum++;
    }
  }

  pdf.save(`${title.replace(/\s+/g, '_')}_PRINT_INTERIOR.pdf`);
};
