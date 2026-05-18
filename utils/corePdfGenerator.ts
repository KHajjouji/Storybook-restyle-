import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { BookPage, PRINT_FORMATS, SpreadExportMode, ExportFormat } from "../types";
import { safeBase64ToBytes, compressImageToJPEG } from "./pdfGenerator";
import { loadGoogleFont } from "./fontLoader";

export const generateCoreBookPDF = async (
  pages: BookPage[],
  format: ExportFormat,
  title: string,
  overlayText: boolean,
  totalEstimatedPages: number,
  spreadMode: SpreadExportMode = "WIDE_SPREAD",
  layeredMode: boolean = false,
  settings: any = {},
) => {
  const config = PRINT_FORMATS[format] || PRINT_FORMATS.KDP_8_5x8_5;
  const gutter = 0.25; 
  const singleFullWidth = config.width + config.bleed;
  const fullHeight = config.height + config.bleed * 2;
  const spreadWidth = config.width * 2 + config.bleed * 2;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  let customFont: any = undefined;
  if (settings.textFont) {
    try {
      const fontUrl = `https://fonts.googleapis.com/css2?family=${settings.textFont.replace(/\s+/g, '+')}:wght@700`;
      const cssResp = await fetch(fontUrl);
      const cssText = await cssResp.text();
      const ttfUrlMatch = cssText.match(/url\((https:\/\/[^)]+)\)/);
      if (ttfUrlMatch && ttfUrlMatch[1]) {
        const fontResp = await fetch(ttfUrlMatch[1]);
        const fontBytes = await fontResp.arrayBuffer();
        customFont = await pdfDoc.embedFont(fontBytes);
      }
    } catch (e) {
      console.warn("Could not load custom font, using Helvetica");
    }
  }
  const fallbackFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontToUse = customFont || fallbackFont;

  const sanitizeWinAnsi = (text: string) => {
    if (!customFont) {
       return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
    }
    return text;
  };

  const wrapText = (text: string, maxWidthIn: number, font: any, fontSize: number): string[] => {
    const safeText = sanitizeWinAnsi(text);
    const maxWidthPts = maxWidthIn * 72;
    const paragraphs = safeText.split(/(?:\n|\|\|)/).map(p => p.trim()).filter(Boolean);
    const lines: string[] = [];
    const defaultFontWidth = (str: string) => str.length * fontSize * 0.5;

    for (const para of paragraphs) {
      const words = para.split(/\s+/);
      let currentLine = "";
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const w = font.widthOfTextAtSize ? font.widthOfTextAtSize(testLine, fontSize) : defaultFontWidth(testLine);
        if (w > maxWidthPts && currentLine !== "") {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
      lines.push(""); 
    }
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines;
  };

  const drawTextWithPdfLib = (
    pdfPage: any,
    pageWidthIn: number, pageHeightIn: number,
    text: string,
    safeLeftIn: number, safeRightIn: number, safeBottomInFromBottomEdge: number,
    textPositionOverride?: string, textBackgroundOverride?: string
  ) => {
    if (textPositionOverride === "hidden" || !text.trim()) return;

    const fontSize = settings.overlayTextSize || 24;
    const lineHeightPt = fontSize * 1.25;
    const maxWidthIn = safeRightIn - safeLeftIn;
    const centerXIn = safeLeftIn + maxWidthIn / 2;

    const lines = wrapText(text, maxWidthIn, fontToUse, fontSize);
    const totalHeightPt = lines.length * lineHeightPt;
    const totalHeightIn = totalHeightPt / 72;

    const pos = textPositionOverride || settings.overlayTextPosition || "bottom";

    let firstLineYIn: number;
    if (pos === "top") {
      firstLineYIn = pageHeightIn - 0.5 - (lineHeightPt / 72); 
    } else if (pos === "center") {
      firstLineYIn = (pageHeightIn / 2) + (totalHeightIn / 2) - (lineHeightPt / 72);
    } else {
      firstLineYIn = safeBottomInFromBottomEdge + totalHeightIn - (lineHeightPt / 72); 
    }

    const bgSetting = textBackgroundOverride || settings.overlayTextBackground;
    if (bgSetting && bgSetting !== "transparent") {
      const boxPadIn = (fontSize * 0.75) / 72;
      const bgW = maxWidthIn * 0.92 + boxPadIn * 2;
      const bgX = centerXIn - bgW / 2;
      const bgY = (firstLineYIn - totalHeightIn) + (lineHeightPt/72) - boxPadIn;
      const bgH = totalHeightIn + boxPadIn * 2;
      
      let fillColor = rgb(1,1,1);
      if (bgSetting === "semi-transparent-white") {
        fillColor = rgb(0.94, 0.94, 0.94);
      } else if (bgSetting === "semi-transparent-black") {
        fillColor = rgb(0.23, 0.23, 0.23); 
      }
      
      pdfPage.drawRectangle({
        x: bgX * 72,
        y: bgY * 72,
        width: bgW * 72,
        height: bgH * 72,
        color: fillColor,
      });
    }

    const hex = (settings.overlayTextColor || "#000000").replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    lines.forEach((line: string, i: number) => {
      if (!line.trim()) return;
      const w = fontToUse.widthOfTextAtSize ? fontToUse.widthOfTextAtSize(line.trim(), fontSize) : line.trim().length * fontSize * 0.5;
      const wIn = w / 72;
      const lineXIn = centerXIn - (wIn / 2);
      const lineYIn = firstLineYIn - (i * (lineHeightPt / 72));

      pdfPage.drawText(line.trim(), {
        x: lineXIn * 72,
        y: lineYIn * 72,
        size: fontSize,
        font: fontToUse,
        color: rgb(r, g, b),
      });
    });
  };

  let currentPageNum = 1;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const rawImage = page.processedImage || page.originalImage;
    if (!rawImage) continue;

    const compressedImage = await compressImageToJPEG(rawImage, 0.85);

    const shouldDrawText = page.originalText && page.textPositionOverride !== "hidden" && overlayText;

    if (page.isSpread && spreadMode === "WIDE_SPREAD") {
      let spreadPage: any;
      if (currentPageNum === 1) {
        spreadPage = pdfDoc.addPage([spreadWidth * 72, fullHeight * 72]); 
      } else {
        spreadPage = pdfDoc.addPage([spreadWidth * 72, fullHeight * 72]);
      }

      const imgBytes = await safeBase64ToBytes(compressedImage);
      const embeddedJpg = await pdfDoc.embedJpg(imgBytes);

      spreadPage.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width: spreadWidth * 72,
        height: fullHeight * 72,
      });

      const safeBottomMarginIn = config.bottom + config.bleed;
      if (shouldDrawText) {
        if (settings.spreadTextSide === "left") {
          drawTextWithPdfLib(
            spreadPage, spreadWidth, fullHeight, page.originalText as string,
            config.outside + config.bleed, spreadWidth / 2 - gutter, safeBottomMarginIn,
            page.textPositionOverride, page.textBackgroundOverride
          );
        } else if (settings.spreadTextSide === "both") {
          const textParts = (page.originalText as string).split("||").map((t: string) => t.trim()).filter(Boolean);
          const mid = Math.ceil(textParts.length / 2);
          drawTextWithPdfLib(
            spreadPage, spreadWidth, fullHeight, textParts.slice(0, mid).join("\n\n") || (page.originalText as string),
            config.outside + config.bleed, spreadWidth / 2 - gutter, safeBottomMarginIn,
            page.textPositionOverride, page.textBackgroundOverride
          );
          drawTextWithPdfLib(
            spreadPage, spreadWidth, fullHeight, textParts.slice(mid).join("\n\n") || (page.originalText as string),
            spreadWidth / 2 + gutter, spreadWidth - config.outside - config.bleed, safeBottomMarginIn,
            page.textPositionOverride, page.textBackgroundOverride
          );
        } else {
          drawTextWithPdfLib(
            spreadPage, spreadWidth, fullHeight, page.originalText as string,
            spreadWidth / 2 + gutter, spreadWidth - config.outside - config.bleed, safeBottomMarginIn,
            page.textPositionOverride, page.textBackgroundOverride
          );
        }
      }
      currentPageNum += 2;
    } else if (page.isSpread && spreadMode === "SPLIT_PAGES") {
      if (currentPageNum > 1) pdfDoc.addPage([singleFullWidth * 72, fullHeight * 72]);
      const leftPage = pdfDoc.addPage([singleFullWidth * 72, fullHeight * 72]);
      const rightPage = pdfDoc.addPage([singleFullWidth * 72, fullHeight * 72]);

      const imgBytes = await safeBase64ToBytes(compressedImage);
      const embeddedJpg = await pdfDoc.embedJpg(imgBytes);

      leftPage.drawImage(embeddedJpg, {
        x: 0, y: 0, width: spreadWidth * 72, height: fullHeight * 72
      });

      rightPage.drawImage(embeddedJpg, {
         x: -(spreadWidth * 72 - singleFullWidth * 72), y: 0, 
         width: spreadWidth * 72, height: fullHeight * 72
      });

      const safeBottomMarginIn = config.bottom + config.bleed;

      if (shouldDrawText) {
        if (settings.spreadTextSide === "left" || settings.spreadTextSide === "both") {
          const text = settings.spreadTextSide === "both" ? (page.originalText as string).split("||")[0]?.trim() : page.originalText;
          drawTextWithPdfLib(
            leftPage, singleFullWidth, fullHeight, text as string || "",
            config.outside + config.bleed, singleFullWidth - gutter, safeBottomMarginIn,
            page.textPositionOverride, page.textBackgroundOverride
          );
        }
        if (settings.spreadTextSide === "right" || settings.spreadTextSide === "both" || !settings.spreadTextSide) {
          const text = settings.spreadTextSide === "both" ? (page.originalText as string).split("||").slice(1).join("\n\n")?.trim() : page.originalText;
          drawTextWithPdfLib(
            rightPage, singleFullWidth, fullHeight, text as string || "",
            gutter, singleFullWidth - config.outside - config.bleed, safeBottomMarginIn,
            page.textPositionOverride, page.textBackgroundOverride
          );
        }
      }
      currentPageNum += 2;
    } else {
      const isRightPage = currentPageNum % 2 !== 0;
      if (currentPageNum > 1 && isRightPage) {
        pdfDoc.addPage([singleFullWidth * 72, fullHeight * 72]);
      }
      const singlePage = pdfDoc.addPage([singleFullWidth * 72, fullHeight * 72]);
      
      const imgBytes = await safeBase64ToBytes(compressedImage);
      const embeddedJpg = await pdfDoc.embedJpg(imgBytes);

      singlePage.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width: singleFullWidth * 72,
        height: fullHeight * 72,
      });
      
      const safeBottomMarginIn = config.bottom + config.bleed;
      if (shouldDrawText) {
        const safeLeft = isRightPage ? gutter : config.outside + config.bleed;
        const safeRight = isRightPage ? singleFullWidth - config.outside - config.bleed : singleFullWidth - gutter;

        drawTextWithPdfLib(
          singlePage, singleFullWidth, fullHeight, page.originalText as string,
          safeLeft, safeRight, safeBottomMarginIn,
          page.textPositionOverride, page.textBackgroundOverride
        );
      }
      currentPageNum++;
    }
  }

  try {
    const strippedPages = pages.map(p => ({
      ...p,
      originalImage: undefined,
      processedImage: undefined,
      layers: undefined,
      retargeting: undefined
    }));
    const metadataStr = JSON.stringify({
      title: title,
      settings: settings,
      pages: strippedPages
    });
    pdfDoc.setSubject(metadataStr);
  } catch(e) {
    console.warn("Could not embed metadata in PDF subject", e);
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_interior.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};
