
import { jsPDF } from "jspdf";
import { BookPage, PRINT_FORMATS, ExportFormat, SpreadExportMode } from "../types";

/**
 * Calculates the exact gutter requirement based on platform standards
 * Higher page count requires more gutter for spine curve.
 */
const calculateGutter = (pageCount: number, format: ExportFormat): number => {
  const config = PRINT_FORMATS[format];
  const base = config?.baseGutter || 0.375;
  
  // Standard KDP/Lulu paper thickness calculations
  if (pageCount > 600) return base + 0.5;
  if (pageCount > 400) return base + 0.375;
  if (pageCount > 150) return base + 0.25;
  if (pageCount > 76) return base + 0.125;
  
  return base;
};

export const generateBookPDF = async (
  pages: BookPage[],
  format: ExportFormat,
  title: string,
  overlayText: boolean,
  totalEstimatedPages: number,
  spreadMode: SpreadExportMode = 'WIDE_SPREAD',
  layeredMode: boolean = false
) => {
  const config = PRINT_FORMATS[format] || PRINT_FORMATS.KDP_SQUARE;
  const gutter = calculateGutter(totalEstimatedPages, format);
  
  // Dimensions with bleed (standard 0.125" for KDP/Lulu)
  const singleFullWidth = config.width + (config.bleed * 2);
  const fullHeight = config.height + (config.bleed * 2);

  const pdf = new jsPDF({
    orientation: config.width > config.height ? 'landscape' : 'portrait',
    unit: 'in',
    format: [singleFullWidth, fullHeight]
  });

  let currentPageNum = 1;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const image = page.processedImage || page.originalImage;
    if (!image) continue;

    const isRightPage = currentPageNum % 2 !== 0;
    const spreadWidth = (config.width * 2) + (config.bleed * 2);

    if (page.isSpread && spreadMode === 'WIDE_SPREAD') {
      if (currentPageNum === 1) {
        (pdf as any).setPage(1);
        pdf.addPage([spreadWidth, fullHeight], 'landscape');
        pdf.deletePage(1);
      } else {
        pdf.addPage([spreadWidth, fullHeight], 'landscape');
      }
      
      if (layeredMode && page.layers) {
        // Draw layers separately
        const bg = page.layers.find(l => l.type === 'background' && l.isVisible);
        const chars = page.layers.find(l => l.type === 'character' && l.isVisible);
        const textLayer = page.layers.find(l => l.type === 'text' && l.isVisible);

        if (bg) pdf.addImage(bg.image, 'PNG', 0, 0, spreadWidth, fullHeight);
        if (chars) pdf.addImage(chars.image, 'PNG', 0, 0, spreadWidth, fullHeight);
        
        // Active Text (Dynamic)
        if (page.originalText) {
          pdf.setFontSize(18);
          pdf.setTextColor(0, 0, 0);
          // Place in safe area (approximate)
          const textX = spreadWidth / 2;
          const textY = fullHeight - 1.5;
          pdf.text(page.originalText, textX, textY, { align: 'center', maxWidth: spreadWidth - 2 });
        }
      } else {
        pdf.addImage(image, 'PNG', 0, 0, spreadWidth, fullHeight);
      }
      currentPageNum += 2;
    } else {
      if (currentPageNum > 1) pdf.addPage([singleFullWidth, fullHeight], config.width > config.height ? 'landscape' : 'portrait');
      
      if (layeredMode && page.layers) {
        const bg = page.layers.find(l => l.type === 'background' && l.isVisible);
        const chars = page.layers.find(l => l.type === 'character' && l.isVisible);
        
        if (bg) pdf.addImage(bg.image, 'PNG', 0, 0, singleFullWidth, fullHeight);
        if (chars) pdf.addImage(chars.image, 'PNG', 0, 0, singleFullWidth, fullHeight);

        // Active Text (Dynamic)
        if (page.originalText) {
          pdf.setFontSize(16);
          pdf.setTextColor(0, 0, 0);
          const textX = singleFullWidth / 2;
          const textY = fullHeight - 1.2;
          pdf.text(page.originalText, textX, textY, { align: 'center', maxWidth: singleFullWidth - 1 });
        }
      } else {
        pdf.addImage(image, 'PNG', 0, 0, singleFullWidth, fullHeight);
      }
      currentPageNum++;
    }
  }

  pdf.save(`${title.replace(/\s+/g, '_')}_PRINT_INTERIOR.pdf`);
};
