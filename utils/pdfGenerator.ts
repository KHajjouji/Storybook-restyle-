import { jsPDF } from "jspdf";
import {
  BookPage,
  PRINT_FORMATS,
  ExportFormat,
  SpreadExportMode,
} from "../types";
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const compressImageToJPEG = async (dataUri: string, quality: number = 0.85): Promise<string> => {
  return new Promise((resolve) => {
    if (!dataUri || !dataUri.startsWith('data:image')) return resolve(dataUri);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_SIZE = 2048; // Max size to prevent jsPDF stack overflow
      let w = img.width;
      let h = img.height;
      if (w > MAX_SIZE || h > MAX_SIZE) {
        const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUri);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
};

const safeBase64ToBytes = async (dataUri: string): Promise<Uint8Array> => {
  try {
    const res = await fetch(dataUri);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch (e) {
    let b64Data = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
    b64Data = b64Data.replace(/[^A-Za-z0-9+/=]/g, ""); // Sanitize
    const binaryString = atob(b64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
};

export const generateLayeredEditablePDF = async (
  pages: BookPage[],
  format: ExportFormat,
  title: string,
  totalEstimatedPages: number,
  textFont: string = 'Inter',
  settings: any = {}
) => {
  try {
    const safeTextFont = textFont || 'Inter';
    const config = PRINT_FORMATS[format] || PRINT_FORMATS.KDP_8_5x8_5;
    const singleFullWidthDPI = (config.width + config.bleed) * 72; // pdf-lib uses 72 dpi (points)
    const fullHeightDPI = (config.height + config.bleed * 2) * 72;

    const pdfDoc = await PDFDocument.create();
    // Vite / ESM compatibility for fontkit
    const safeFontkit = fontkit && (fontkit as any).default ? (fontkit as any).default : fontkit;
    if (safeFontkit) {
      pdfDoc.registerFontkit(safeFontkit);
    } else {
      console.warn('Fontkit is undefined, custom fonts may fail to load');
    }

    // Try to load user-selected Google Font
    let customFont;
    try {
      const fontUrl = `https://fonts.googleapis.com/css2?family=${safeTextFont.replace(/\s+/g, '+')}:wght@700&text=` + encodeURIComponent("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;':,./<>?`~ \"");
      const cssResp = await fetch(fontUrl);
      const cssText = await cssResp.text();
      const ttfUrlMatch = cssText.match(/url\((https:\/\/[^)]+)\)/);
      if (ttfUrlMatch && ttfUrlMatch[1]) {
        const fontResp = await fetch(ttfUrlMatch[1]);
        const fontBytes = await fontResp.arrayBuffer();
        customFont = await pdfDoc.embedFont(fontBytes);
      } else {
        customFont = await pdfDoc.embedFont('Helvetica-Bold');
      }
    } catch (e) {
      console.warn("Failed to load Google font, using Helvetica", e);
      customFont = await pdfDoc.embedFont('Helvetica-Bold');
    }

    const drawImageOnPage = async (page: any, dataUri: string, x: number, y: number, width: number, height: number) => {
      if (!dataUri) return;
      try {
        let embeddedImage;
        const format = getImageFormat(dataUri);
        
        // If it's not a valid base64 data URI (e.g. standard URL), we can't embed it easily with base64ToBytes
        if (!dataUri.startsWith('data:')) {
          console.warn('Skipping non-data URI image for export');
          return;
        }

        const bytes = await safeBase64ToBytes(dataUri);
        if (format === 'JPEG') {
          embeddedImage = await pdfDoc.embedJpg(bytes);
        } else {
          embeddedImage = await pdfDoc.embedPng(bytes);
        }
        page.drawImage(embeddedImage, {
          x, y, width, height,
        });
      } catch (err) {
        console.error("Failed to embed image on PDF page", err);
      }
    };

    const drawEditableText = async (pdfPage: any, text: string, textFont: any, detectedBounds?: { centerXFrac: number, centerYFrac: number, widthFrac: number, heightFrac: number } | null) => {
      const fontSize = settings?.overlayTextSize || 24;
      
      let xOffset, yOffset, fieldWidth, fieldHeight;

      if (detectedBounds) {
        fieldWidth = detectedBounds.widthFrac * singleFullWidthDPI;
        fieldHeight = detectedBounds.heightFrac * fullHeightDPI;
        xOffset = detectedBounds.centerXFrac * singleFullWidthDPI - fieldWidth / 2;
        // pdf-lib y=0 is bottom
        yOffset = (1 - detectedBounds.centerYFrac) * fullHeightDPI - fieldHeight / 2;
      } else {
        fieldWidth = singleFullWidthDPI - 72; // default safe area margins
        fieldHeight = 100;
        xOffset = 36;
        yOffset = 100; // default bottom
      }

      const form = pdfDoc.getForm();
      const textField = form.createTextField(`text_${Math.random().toString()}`);
      textField.setText(text || "");
      textField.addToPage(pdfPage, {
        x: xOffset,
        y: yOffset,
        width: fieldWidth,
        height: fieldHeight,
        textColor: rgb(0, 0, 0),
        backgroundColor: undefined,
        borderColor: undefined,
        font: textFont,
      });
      textField.setFontSize(fontSize);
      textField.enableMultiline();
    };

    for (let i = 0; i < pages.length; i++) {
      const bookPage = pages[i];
      const pdfPage = pdfDoc.addPage([singleFullWidthDPI, fullHeightDPI]);
      
      // Background layer
      const bgLayer = bookPage.layers?.find(l => l.type === 'background' && l.isVisible);
      if (bgLayer && bgLayer.image) {
        await drawImageOnPage(pdfPage, bgLayer.image, 0, 0, singleFullWidthDPI, fullHeightDPI);
      } else if (bookPage.processedImage || bookPage.originalImage) {
        await drawImageOnPage(pdfPage, bookPage.processedImage || bookPage.originalImage || '', 0, 0, singleFullWidthDPI, fullHeightDPI);
      }

      // Characters & Foreground
      const chars = bookPage.layers?.filter(l => (l.type === 'character' || l.type === 'foreground') && l.isVisible);
      if (chars) {
        for (const char of chars) {
          if (char.image) {
            await drawImageOnPage(pdfPage, char.image, 0, 0, singleFullWidthDPI, fullHeightDPI);
          }
        }
      }

      // Editable text logic
      const textLayer = bookPage.layers?.find(l => l.type === 'text' && l.isVisible);
      let detectedBounds = null;
      if (textLayer && textLayer.image) {
        detectedBounds = await detectTextBoundsFromLayer(textLayer.image);
      }

      if (bookPage.originalText) {
         await drawEditableText(pdfPage, bookPage.originalText, customFont, detectedBounds);
      }
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(title || 'book').replace(/\s+/g, '_')}_EDITABLE.pdf`;
    link.click();
  } catch (error: any) {
    console.error("FATAL ERROR in generateLayeredEditablePDF:", error);
    const msg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
    throw new Error(msg || "Unknown error generating editable PDF");
  }
};
import {
  getInsideMargin,
  validateProjectForKDP,
  calculateCoverWithBleed,
} from "../kdpConfig";

const calculateGutter = (pageCount: number, format: ExportFormat): number => {
  if (format.startsWith("KDP_")) {
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

/**
 * Converts any image data URI to a JPEG data URI via an HTML canvas.
 * Images that are already JPEG are returned untouched so we never
 * re-encode (and therefore never degrade) the original illustration.
 * The canvas path is handled entirely by the browser — there are no
 * JS-level pixel loops that could overflow the call stack.
 */
const optimizeImageForPDF = async (
  dataUri: string,
  requireTransparency: boolean,
): Promise<string> => {
  if (typeof dataUri !== "string") return dataUri;

  if (
    !requireTransparency &&
    (dataUri.startsWith("data:image/jpeg") ||
      dataUri.startsWith("data:image/jpg"))
  ) {
    return dataUri;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        if (!requireTransparency) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        if (requireTransparency) {
          resolve(canvas.toDataURL("image/png"));
        } else {
          resolve(canvas.toDataURL("image/jpeg", 0.95));
        }
      } else {
        resolve(dataUri);
      }
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
};

/**
 * Builds the project-recovery metadata string embedded in the PDF subject.
 *
 * Two constraints that previously caused "Maximum call stack size exceeded":
 *  1. Strip every heavy / binary field so the metadata string stays small.
 *  2. Escape every non-ASCII char. jsPDF's to8bitStream() calls
 *     String.fromCharCode.apply(undefined, hugeArray) only when the string
 *     contains chars > 0xFF (smart quotes / em-dashes are common in
 *     children's-book text). Forcing pure ASCII makes jsPDF take its safe
 *     early-return path instead.
 */
const buildSafeMetadata = (
  pages: BookPage[],
  settings: any,
  title: string,
  totalEstimatedPages: number,
): string => {
  const strippedPages = pages.map((p) => ({
    ...p,
    originalImage: undefined,
    processedImage: undefined,
    layers: undefined,
    retargeting: undefined,
  }));
  const strippedSettings = {
    ...settings,
    styleReference: undefined,
    masterBible: undefined,
    fullScript: undefined,
    characterReferences: settings?.characterReferences?.map((c: any) => ({
      ...c,
      image: undefined,
      images: undefined,
    })),
  };
  const meta = {
    settings: strippedSettings,
    pages: strippedPages,
    title,
    totalEstimatedPages,
  };
  return JSON.stringify(meta).replace(
    /[\u0080-\uFFFF]/g,
    (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"),
  );
};

export const generateCoverPDF = async (
  coverImage: string,
  format: ExportFormat,
  title: string,
  totalEstimatedPages: number,
  paperType: "white" | "cream" = "white",
  colorType: "bw" | "standard_color" | "premium_color" = "standard_color",
) => {
  const config = PRINT_FORMATS[format] || PRINT_FORMATS.KDP_8_5x8_5;

  const coverDims = calculateCoverWithBleed(
    config.width,
    config.height,
    totalEstimatedPages,
    paperType,
    colorType,
  );

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "in",
    format: [coverDims.width, coverDims.height],
  });

  // Passing the JPEG data URI straight to jsPDF embeds the original bytes
  // with no canvas re-encode (no quality loss).
  const finalCoverImage = await optimizeImageForPDF(coverImage, false);
  pdf.addImage(
    finalCoverImage,
    "JPEG",
    0,
    0,
    coverDims.width,
    coverDims.height,
    undefined,
    "NONE",
  );
  pdf.save(`${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_cover_kdp.pdf`);
};

/**
 * Composites an ordered list of image layers onto a canvas and returns
 * a JPEG data URI.  The text layer is intentionally excluded from the
 * caller before this function is invoked so that text can be added as a
 * separate, selectable vector layer in the PDF.
 */
const flattenLayers = async (
  layers: { type: string; image: string; isVisible: boolean }[],
  widthIn: number,
  heightIn: number,
): Promise<string> => {
  return new Promise((resolve) => {
    const dpi = 300;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(widthIn * dpi);
    canvas.height = Math.round(heightIn * dpi);
    const ctx = canvas.getContext("2d");
    if (!ctx) return resolve("");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const orderedLayers = [
      layers.find((l) => l.type === "background" && l.isVisible),
      layers.find((l) => l.type === "character" && l.isVisible),
      layers.find((l) => l.type === "foreground" && l.isVisible),
    ].filter(Boolean) as { type: string; image: string; isVisible: boolean }[];

    if (orderedLayers.length === 0) return resolve("");

    const render = async () => {
      for (const layer of orderedLayers) {
        if (!layer.image) continue;
        await new Promise<void>((res) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            res();
          };
          img.onerror = () => res();
          img.src = layer.image;
        });
      }
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    render();
  });
};

export const generateBookPDF = async (
  pages: BookPage[],
  format: ExportFormat,
  title: string,
  overlayText: boolean,
  totalEstimatedPages: number,
  spreadMode: SpreadExportMode = "WIDE_SPREAD",
  layeredMode: boolean = false,
  settings: any = {},
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

  const singleFullWidth = config.width + config.bleed;
  const fullHeight = config.height + config.bleed * 2;
  const spreadWidth = config.width * 2 + config.bleed * 2;

  const strippedPages = pages.map((p) => ({
    ...p,
    originalImage: undefined,
    processedImage: undefined,
    layers: undefined,
  }));
  const strippedSettings = {
    ...settings,
    characterReferences: settings.characterReferences?.map((c: any) => ({
      ...c,
      image: undefined,
    })),
  };
  const exportMeta = {
    settings: strippedSettings,
    pages: strippedPages,
    title,
    totalEstimatedPages,
  };

  const pdf = new jsPDF({
    orientation: config.width > config.height ? "landscape" : "portrait",
    unit: "in",
    format: [singleFullWidth, fullHeight],
  });

  // Embed lightweight project-recovery metadata. Wrapped in try/catch so a
  // metadata problem can never block the actual PDF from generating.
  try {
    pdf.setProperties({
      creator: "Storyflow",
      subject: buildSafeMetadata(pages, settings, title, totalEstimatedPages),
    });
  } catch (metaErr) {
    console.warn("Could not embed project metadata in PDF:", metaErr);
  }

  const { loadGoogleFont } = await import("./fontLoader");

  let currentPageNum = 1;

  /**
   * Draw text directly onto the jsPDF page using the PDF vector text API.
   * This completely avoids the PNG canvas encode/decode cycle that causes
   * "Maximum call stack size exceeded" on large (4K / spread) pages.
   *
   * Coordinates are in inches, origin top-left (same as jsPDF with unit:'in').
   */
  const drawTextWithJsPDF = (
    text: string,
    widthIn: number, heightIn: number,
    safeLeftIn: number, safeRightIn: number, safeBottomIn: number,
    textPositionOverride?: string, textBackgroundOverride?: string
  ) => {
    if (textPositionOverride === "hidden" || !text.trim()) return;

    const fontSizePt = settings.overlayTextSize || 24;
    const lineHeightIn = (fontSizePt * 1.25) / 72;
    const maxWidthIn = safeRightIn - safeLeftIn;
    const centerXIn = safeLeftIn + maxWidthIn / 2;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fontSizePt);

    const allLines: string[] = [];
    const paragraphs = text
      .split(/(?:\n|\|\|)/)
      .map((p: string) => p.trim())
      .filter(Boolean);
    for (const para of paragraphs) {
      const wrapped: string[] = pdf.splitTextToSize(para, maxWidthIn);
      allLines.push(...wrapped, "");
    }
    if (allLines.length && allLines[allLines.length - 1] === "") allLines.pop();

    const totalHeightIn = allLines.length * lineHeightIn;
    const pos =
      textPositionOverride || settings.overlayTextPosition || "bottom";

    let firstLineY: number;
    if (pos === "top") {
      firstLineY = 0.5 + lineHeightIn;
    } else if (pos === "center") {
      firstLineY = heightIn / 2 - totalHeightIn / 2 + lineHeightIn;
    } else {
      firstLineY = safeBottomIn - (allLines.length - 1) * lineHeightIn;
    }

    const bgSetting = textBackgroundOverride || settings.overlayTextBackground;
    if (bgSetting && bgSetting !== "transparent") {
      const boxPadIn = (fontSizePt * 0.75) / 72;
      const bgW = maxWidthIn * 0.92 + boxPadIn * 2;
      const bgX = centerXIn - bgW / 2;
      const bgY = firstLineY - lineHeightIn * 0.75 - boxPadIn;
      const bgH = totalHeightIn + boxPadIn * 2;
      if (bgSetting === "solid-white") {
        pdf.setFillColor(255, 255, 255);
      } else if (bgSetting === "semi-transparent-white") {
        pdf.setFillColor(240, 240, 240);
      } else if (bgSetting === "semi-transparent-black") {
        pdf.setFillColor(60, 60, 60);
      }
      pdf.rect(bgX, bgY, bgW, bgH, "F");
    }

    const hex = (settings.overlayTextColor || "#000000").replace("#", "");
    pdf.setTextColor(
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    );

    allLines.forEach((line: string, i: number) => {
      if (!line.trim()) return;
      pdf.text(line.trim(), centerXIn, firstLineY + i * lineHeightIn, {
        align: "center",
      });
    });

    pdf.setTextColor(0, 0, 0);
  };

  // Pre-load the user's chosen font so it renders correctly in the browser
  // preview (the PDF will fall back to helvetica which is a standard PDF font).
  if (settings.textFont) {
    await loadGoogleFont(settings.textFont).catch(() => {});
  }

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const rawImage = page.processedImage || page.originalImage;
    if (!rawImage) continue;

    const image = await optimizeImageForPDF(rawImage, false);

    // Build the layer list. The text layer is kept separate so it becomes
    // real vector text in the PDF rather than a baked-in raster image.
    const rawLayers = page.layers
      ? await Promise.all(
          page.layers.map(async (l) => ({
            ...l,
            image: l.image
              ? await optimizeImageForPDF(l.image, l.type !== "background")
              : l.image,
          })),
        )
      : undefined;

    // A visible text layer means the AI generated text as its own PNG layer.
    // We exclude it from the raster composite and add the text as real PDF
    // vector text instead, making it selectable / editable in any PDF viewer.
    const hasTextLayer = Boolean(
      page.layers?.some((l) => l.type === "text" && l.isVisible && l.image),
    );
    const visualLayers = page.layers
      ? page.layers.filter((l) => l.type !== "text")
      : undefined;
    const useLayeredFlattening =
      (layeredMode || (visualLayers && visualLayers.length > 0)) &&
      visualLayers &&
      visualLayers.length > 0;

    // Emit vector text when:
    //  - overlayText is explicitly enabled by the user, OR
    //  - the AI generated a separate text layer (hasTextLayer) so we replace
    //    the raster text with a real PDF text vector.
    const shouldDrawText =
      page.originalText &&
      page.textPositionOverride !== "hidden" &&
      (overlayText || hasTextLayer);

    const isRightPage = currentPageNum % 2 !== 0;

    if (page.isSpread && spreadMode === "WIDE_SPREAD") {
      if (currentPageNum === 1) {
        (pdf as any).setPage(1);
        pdf.addPage([spreadWidth, fullHeight], "landscape");
        pdf.deletePage(1);
      } else {
        pdf.addPage([spreadWidth, fullHeight], "landscape");
      }

      if (useLayeredFlattening) {
        const flattened = await flattenLayers(
          visualLayers!,
          spreadWidth,
          fullHeight,
        );
        if (flattened) {
          // Use HTMLImageElement to bypass jsPDF's internal base64 decode chain
          const flatImg = await loadImage(flattened);
          pdf.addImage(flatImg, "JPEG", 0, 0, spreadWidth, fullHeight, undefined, "NONE");
        }
      } else {
        const imgEl = await loadImage(compressedImage);
        pdf.addImage(imgEl, "JPEG", 0, 0, spreadWidth, fullHeight, undefined, "NONE");
      }

      if (shouldDrawText && page.originalText) {
        const safeBottom = fullHeight - config.bottom - config.bleed;
        if (settings.spreadTextSide === "left") {
          drawTextWithJsPDF(
            page.originalText, spreadWidth, fullHeight,
            config.outside + config.bleed, spreadWidth / 2 - gutter, safeBottom,
            page.textPositionOverride, page.textBackgroundOverride,
          );
        } else if (settings.spreadTextSide === "both") {
          const textParts = page.originalText
            .split("||")
            .map((t: string) => t.trim())
            .filter(Boolean);
          const mid = Math.ceil(textParts.length / 2);
          drawTextWithJsPDF(
            textParts.slice(0, mid).join("\n\n") || page.originalText,
            spreadWidth, fullHeight,
            config.outside + config.bleed, spreadWidth / 2 - gutter, safeBottom,
            page.textPositionOverride, page.textBackgroundOverride,
          );
          drawTextWithJsPDF(
            textParts.slice(mid).join("\n\n") || page.originalText,
            spreadWidth, fullHeight,
            spreadWidth / 2 + gutter, spreadWidth - config.outside - config.bleed, safeBottom,
            page.textPositionOverride, page.textBackgroundOverride,
          );
        } else {
          drawTextWithJsPDF(
            page.originalText, spreadWidth, fullHeight,
            spreadWidth / 2 + gutter, spreadWidth - config.outside - config.bleed, safeBottom,
            page.textPositionOverride, page.textBackgroundOverride,
          );
        }
      }

      currentPageNum += 2;
    } else if (page.isSpread && spreadMode === "SPLIT_PAGES") {
      if (currentPageNum > 1)
        pdf.addPage([singleFullWidth, fullHeight], config.width > config.height ? "landscape" : "portrait");

      pdf.addImage(image, "JPEG", 0, 0, spreadWidth, fullHeight, undefined, "NONE");

      if (useLayeredFlattening) {
        const flattened = await flattenLayers(
          visualLayers!,
          spreadWidth,
          fullHeight,
        );
        if (flattened) {
          const spreadImgEl = await loadImage(flattened);
          pdf.addImage(spreadImgEl, "JPEG", 0, 0, spreadWidth, fullHeight, undefined, "NONE");
        }
      } else {
          const spreadImgEl = await loadImage(compressedImage);
          pdf.addImage(spreadImgEl, "JPEG", 0, 0, spreadWidth, fullHeight, undefined, "NONE");
      }

      if (shouldDrawText && page.originalText) {
        const safeBottom = fullHeight - config.bottom - config.bleed;
        drawTextWithJsPDF(
          page.originalText, singleFullWidth, fullHeight,
          config.outside + config.bleed, singleFullWidth - gutter, safeBottom,
          page.textPositionOverride, page.textBackgroundOverride,
        );
      }
      currentPageNum++;

      pdf.addPage(
        [singleFullWidth, fullHeight],
        config.width > config.height ? "landscape" : "portrait",
      );

      if (useLayeredFlattening) {
        const flattened = await flattenLayers(
          visualLayers!,
          spreadWidth,
          fullHeight,
        );
        if (flattened) {
          const spreadImgEl2 = await loadImage(flattened);
          pdf.addImage(
            spreadImgEl2, "JPEG",
            -(spreadWidth - singleFullWidth), 0,
            spreadWidth, fullHeight,
            undefined, "NONE",
          );
        }
      } else {
        const spreadImgEl2 = await loadImage(compressedImage);
        pdf.addImage(
          spreadImgEl2, "JPEG",
          -(spreadWidth - singleFullWidth), 0,
          spreadWidth, fullHeight,
          undefined, "NONE",
        );
      }

      currentPageNum++;
    } else {
      if (currentPageNum > 1)
        pdf.addPage([singleFullWidth, fullHeight], config.width > config.height ? "landscape" : "portrait");

      if (useLayeredFlattening) {
        const flattened = await flattenLayers(
          visualLayers!,
          singleFullWidth,
          fullHeight,
        );
        if (flattened) {
          const flatImg = await loadImage(flattened);
          pdf.addImage(flatImg, "JPEG", 0, 0, singleFullWidth, fullHeight, undefined, "NONE");
        }
      } else {
        const imgEl = await loadImage(compressedImage);
        pdf.addImage(imgEl, "JPEG", 0, 0, singleFullWidth, fullHeight, undefined, "NONE");
      }

      if (shouldDrawText && page.originalText) {
        const safeBottom = fullHeight - config.bottom - config.bleed;
        const safeLeft = isRightPage
          ? gutter + config.bleed
          : config.outside + config.bleed;
        const safeRight = isRightPage
          ? singleFullWidth - config.outside - config.bleed
          : singleFullWidth - gutter - config.bleed;
        drawTextWithJsPDF(
          page.originalText, singleFullWidth, fullHeight,
          safeLeft, safeRight, safeBottom,
          page.textPositionOverride, page.textBackgroundOverride,
        );
      }

      currentPageNum++;
    }

    // Yield to the main thread to avoid UI freeze on large books
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  pdf.save(`${title.replace(/\s+/g, "_")}_PRINT_INTERIOR.pdf`);
};
