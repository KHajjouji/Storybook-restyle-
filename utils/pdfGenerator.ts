
import { jsPDF } from "jspdf";
import { BookPage, PRINT_FORMATS, ExportFormat, SpreadExportMode } from "../types";

/**
 * Technical Gutter Calculation based on User Guide:
 * Inside Margin = Base Margin (0.75) + Page Count Factor
 */
const calculateGutter = (pageCount: number): number => {
  let increase = 0;
  if (pageCount > 500) increase = 0.375;
  else if (pageCount > 300) increase = 0.25;
  else if (pageCount > 150) increase = 0.125;
  
  const baseGutter = 0.75; // Recommended Universal Safe Value
  return baseGutter + increase;
};

export const generateBookPDF = async (
  pages: BookPage[],
  format: ExportFormat,
  title: string,
  overlayText: boolean,
  totalEstimatedPages: number,
  spreadMode: SpreadExportMode = 'WIDE_SPREAD'
) => {
  const config = PRINT_FORMATS[format] || PRINT_FORMATS.KDP_SQUARE;
  const gutter = calculateGutter(totalEstimatedPages);
  
  // Standard single page dimensions including bleed
  const singleFullWidth = config.width + (config.bleed * 2);
  const fullHeight = config.height + (config.bleed * 2);

  // Wide spread dimensions (e.g., 17" + bleeds)
  const spreadFullWidth = (config.width * 2) + (config.bleed * 2);

  const pdf = new jsPDF({
    orientation: 'portrait', // Will be adjusted per page
    unit: 'in',
    format: [singleFullWidth, fullHeight]
  });

  let currentPageNum = 1;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const image = page.processedImage || page.originalImage;
    const text = page.translatedText || page.originalText;

    if (page.isSpread && spreadMode === 'WIDE_SPREAD') {
      // WIDE SPREAD: A single 17" wide sheet
      if (currentPageNum === 1) {
        // Correcting first page size if it's a spread
        (pdf as any).setPage(1);
        pdf.addPage([spreadFullWidth, fullHeight], 'landscape');
        pdf.deletePage(1);
      } else {
        pdf.addPage([spreadFullWidth, fullHeight], 'landscape');
      }

      // Draw the wide illustration
      pdf.addImage(image, 'PNG', 0, 0, spreadFullWidth, fullHeight);

      if (overlayText && text) {
        // Safe zone on a spread involves the far outside edges and the center gutter
        const outsideSafe = config.outside + config.bleed;
        const centerGutterHalf = gutter / 2;
        
        // Example: Overlay text on the right half of the spread
        const leftLimit = config.width + centerGutterHalf; 
        const rightLimit = spreadFullWidth - outsideSafe;
        const rectWidth = rightLimit - leftLimit;

        pdf.setFillColor(255, 255, 255);
        pdf.setGState(new (pdf as any).GState({ opacity: 0.85 }));
        pdf.rect(leftLimit, fullHeight - config.bottom - config.bleed - 1.0, rectWidth, 1.0, 'F');
        
        pdf.setGState(new (pdf as any).GState({ opacity: 1 }));
        pdf.setTextColor(30, 30, 30);
        pdf.setFontSize(14);
        pdf.text(text, leftLimit + 0.2, fullHeight - config.bottom - config.bleed - 0.4, { 
          maxWidth: rectWidth - 0.4 
        });
      }
      currentPageNum += 2;
    } 
    else if (page.isSpread && spreadMode === 'SPLIT_PAGES') {
      // Split into two physical pages (Left Page then Right Page)
      if (currentPageNum > 1) pdf.addPage([singleFullWidth, fullHeight], 'portrait');
      
      // Left Page (Even)
      pdf.addImage(image, 'PNG', 0, 0, singleFullWidth * 2, fullHeight);
      currentPageNum++;

      pdf.addPage([singleFullWidth, fullHeight], 'portrait');
      // Right Page (Odd)
      pdf.addImage(image, 'PNG', -singleFullWidth, 0, singleFullWidth * 2, fullHeight);
      currentPageNum++;
    } 
    else {
      // SINGLE PAGE
      if (currentPageNum > 1) pdf.addPage([singleFullWidth, fullHeight], 'portrait');
      
      const isRightPage = currentPageNum % 2 !== 0;
      pdf.addImage(image, 'PNG', 0, 0, singleFullWidth, fullHeight);

      if (overlayText && text) {
        const currentGutter = gutter + config.bleed;
        const currentOutside = config.outside + config.bleed;
        const leftMargin = isRightPage ? currentGutter : currentOutside;
        const rightMargin = isRightPage ? currentOutside : currentGutter;
        
        const rectWidth = singleFullWidth - leftMargin - rightMargin;
        pdf.setFillColor(255, 255, 255);
        pdf.setGState(new (pdf as any).GState({ opacity: 0.85 }));
        pdf.rect(leftMargin, fullHeight - config.bottom - config.bleed - 1.0, rectWidth, 1.0, 'F');
        
        pdf.setGState(new (pdf as any).GState({ opacity: 1 }));
        pdf.setTextColor(30, 30, 30);
        pdf.setFontSize(14);
        pdf.text(text, leftMargin + 0.2, fullHeight - config.bottom - config.bleed - 0.4, { 
          maxWidth: rectWidth - 0.4 
        });
      }
      currentPageNum++;
    }
  }

  pdf.save(`${title.replace(/\s+/g, '_')}_PRODUCTION_READY.pdf`);
};
