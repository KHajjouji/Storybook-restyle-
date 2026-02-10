
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
  spreadMode: SpreadExportMode = 'WIDE_SPREAD'
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

    if (page.isSpread && spreadMode === 'WIDE_SPREAD') {
      const spreadWidth = (config.width * 2) + (config.bleed * 2);
      if (currentPageNum === 1) {
        (pdf as any).setPage(1);
        pdf.addPage([spreadWidth, fullHeight], 'landscape');
        pdf.deletePage(1);
      } else {
        pdf.addPage([spreadWidth, fullHeight], 'landscape');
      }
      
      pdf.addImage(image, 'PNG', 0, 0, spreadWidth, fullHeight);
      currentPageNum += 2;
    } else {
      if (currentPageNum > 1) pdf.addPage([singleFullWidth, fullHeight], config.width > config.height ? 'landscape' : 'portrait');
      
      // Handle page shifting for bleed/gutter
      // On right pages (odd), the gutter is on the left.
      // On left pages (even), the gutter is on the right.
      const horizontalShift = isRightPage ? (gutter - config.bleed) : -(gutter - config.bleed);
      
      // For full bleed interiors, we stretch slightly or just center.
      // Most platforms expect art to exactly hit the 0.125" bleed line.
      pdf.addImage(image, 'PNG', 0, 0, singleFullWidth, fullHeight);
      currentPageNum++;
    }
  }

  pdf.save(`${title.replace(/\s+/g, '_')}_PRINT_INTERIOR.pdf`);
};
