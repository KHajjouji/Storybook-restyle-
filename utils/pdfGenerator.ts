import { jsPDF } from "jspdf";
import {
  BookPage,
  PRINT_FORMATS,
  ExportFormat,
  SpreadExportMode,
} from "../types";
import {
  getInsideMargin,
  validateProjectForKDP,
  calculateCoverWithBleed,
} from "../kdpConfig";

/**
 * Calculates the exact gutter requirement based on platform standards
 * Higher page count requires more gutter for spine curve.
 */
const calculateGutter = (pageCount: number, format: ExportFormat): number => {
  if (format.startsWith("KDP_")) {
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

  // Convert WebP or transparent PNGs properly to avoid jsPDF crashes with large opaque PNGs
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
          resolve(canvas.toDataURL("image/jpeg", 0.95)); // jpeg compresses much better inside PDF
        }
      } else {
        resolve(dataUri);
      }
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
};

const getImageFormat = (dataUri: string) => {
  if (typeof dataUri === "string") {
    if (
      dataUri.startsWith("data:image/jpeg") ||
      dataUri.startsWith("data:image/jpg")
    )
      return "JPEG";
    if (dataUri.startsWith("data:image/webp")) return "WEBP";
  }
  return "PNG";
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

  const finalCoverImage = await optimizeImageForPDF(coverImage, false);
  pdf.addImage(
    finalCoverImage,
    getImageFormat(finalCoverImage),
    0,
    0,
    coverDims.width,
    coverDims.height,
    undefined, "NONE",
  );
  pdf.save(`${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_cover_kdp.pdf`);
};

const flattenLayers = async (layers: { type: string; image: string; isVisible: boolean }[], width: number, height: number, bleed: number): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = width * 300; // assumed 300 dpi
    canvas.height = height * 300;
    const ctx = canvas.getContext("2d");
    if (!ctx) return resolve("");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const orderedLayers = [
      layers.find((l) => l.type === "background" && l.isVisible),
      layers.find((l) => l.type === "character" && l.isVisible),
      layers.find((l) => l.type === "foreground" && l.isVisible),
      layers.find((l) => l.type === "text" && l.isVisible)
    ].filter(Boolean) as { type: string; image: string; isVisible: boolean }[];

    let loaded = 0;
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
          img.onerror = () => res(); // skip on error
          img.src = layer.image;
        });
      }
      resolve(canvas.toDataURL("image/jpeg", 0.95)); // output standard JPEG layout!
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

  // Dimensions with bleed (standard 0.125" for KDP/Lulu)
  // KDP requires bleed on top, bottom, and outside edges. No bleed on inside edge.
  const singleFullWidth = config.width + config.bleed; // Only outside edge gets bleed
  const fullHeight = config.height + config.bleed * 2; // Top and bottom get bleed
  const spreadWidth = config.width * 2 + config.bleed * 2; // Both outside edges get bleed

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
  pdf.setProperties({
    creator: "Storyflow",
    subject: JSON.stringify(exportMeta),
  });

  const { loadGoogleFont } = await import("./fontLoader");

  let currentPageNum = 1;

  // Returns the canvas element directly so jsPDF can read pixel data without an
  // intermediate PNG data-URL (avoids stack overflow on large canvases).
  const createTextImageAsync = async (
    text: string,
    widthIn: number,
    heightIn: number,
    safeLeftIn: number,
    safeRightIn: number,
    safeBottomIn: number,
    textPositionOverride?: "top" | "center" | "bottom" | "hidden",
    textBackgroundOverride?:
      | "transparent"
      | "solid-white"
      | "semi-transparent-white"
      | "semi-transparent-black",
  ): Promise<string> => {
    if (textPositionOverride === "hidden") return "";
    if (settings.textFont) {
      await loadGoogleFont(settings.textFont);
    }
    const dpi = 300;
    const canvas = document.createElement("canvas");
    canvas.width = widthIn * dpi;
    canvas.height = heightIn * dpi;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fontSize = (settings.overlayTextSize || 24) * (dpi / 72);
    ctx.font = `bold ${fontSize}px ${settings.textFont || "Inter"}, sans-serif`;
    ctx.fillStyle = settings.overlayTextColor || "black";
    ctx.textAlign = "center";

    const safeLeftPx = safeLeftIn * dpi;
    const safeRightPx = safeRightIn * dpi;
    const safeBottomPx = safeBottomIn * dpi;
    const maxWidthPx = safeRightPx - safeLeftPx;
    const centerXPx = safeLeftPx + maxWidthPx / 2;

    // Simple word wrap with explicit newline and || support
    let allLines: string[] = [];
    const paragraphs = text
      .split(/(?:\n|\|\|)/)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const p of paragraphs) {
      const words = p.split(" ");
      let line = "";
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + " ";
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidthPx && n > 0) {
          allLines.push(line);
          line = words[n] + " ";
        } else {
          line = testLine;
        }
      }
      allLines.push(line);
      // add a small gap after paragraph if it's not the last one?
      // easiest way is to just let line height handle it, or we could add an empty line
      allLines.push("");
    }
    // Remove the trailing empty line
    if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
      allLines.pop();
    }

    const lines = allLines;

    const maxLineWidthPx = lines.reduce(
      (max, l) => Math.max(max, ctx.measureText(l.trim()).width),
      0,
    );
    const actualWidthPx = Math.min(maxWidthPx, maxLineWidthPx);

    const lineHeight = (settings.overlayTextSize || 24) * 1.25 * (dpi / 72);
    const totalHeight = lines.length * lineHeight;
    let startY = safeBottomPx - totalHeight + lineHeight; // default bottom

    const pos = textPositionOverride || settings.overlayTextPosition;
    if (pos === "top") {
      const titleSafeTopPx = 0.5 * dpi; // approx safe top
      startY = titleSafeTopPx + lineHeight;
    } else if (pos === "center") {
      startY = canvas.height / 2 - totalHeight / 2 + lineHeight;
    }

    const bgSetting = textBackgroundOverride || settings.overlayTextBackground;
    if (bgSetting && bgSetting !== "transparent") {
      let bgColor = "rgba(255, 255, 255, 1)";
      if (bgSetting === "semi-transparent-white")
        bgColor = "rgba(255, 255, 255, 0.7)";
      if (bgSetting === "semi-transparent-black")
        bgColor = "rgba(0, 0, 0, 0.5)";

      ctx.fillStyle = bgColor;
      const boxPad = fontSize * 0.75;
      ctx.beginPath();
      // Use actual width instead of max width for tighter background box
      ctx.roundRect(
        centerXPx - actualWidthPx / 2 - boxPad,
        startY - lineHeight - boxPad + lineHeight * 0.25,
        actualWidthPx + boxPad * 2,
        totalHeight + boxPad * 2,
        fontSize * 0.5,
      );
      ctx.fill();
    }

    if (settings.overlayTextShadow !== false) {
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
    }

    ctx.fillStyle = settings.overlayTextColor || "black";
    lines.forEach((l, i) => {
      ctx.fillText(l.trim(), centerXPx, startY + i * lineHeight);
    });

    return canvas.toDataURL("image/png");
  };

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const rawImage = page.processedImage || page.originalImage;
    if (!rawImage) continue;

    const image = await optimizeImageForPDF(rawImage, false);
    const safeLayers = page.layers
      ? await Promise.all(
          page.layers.map(async (l) => ({
            ...l,
            image: l.image
              ? await optimizeImageForPDF(l.image, l.type !== "background")
              : l.image,
          })),
        )
      : undefined;

    const isRightPage = currentPageNum % 2 !== 0;

    if (page.isSpread && spreadMode === "WIDE_SPREAD") {
      if (currentPageNum === 1) {
        (pdf as any).setPage(1);
        pdf.addPage([spreadWidth, fullHeight], "landscape");
        pdf.deletePage(1);
      } else {
        pdf.addPage([spreadWidth, fullHeight], "landscape");
      }

      if (
        (layeredMode || (safeLayers && safeLayers.length > 0)) &&
        safeLayers
      ) {
        const flattened = await flattenLayers(safeLayers, spreadWidth, fullHeight, config.bleed);
        if (flattened) {
          pdf.addImage(
            flattened,
            getImageFormat(flattened),
            0,
            0,
            spreadWidth,
            fullHeight,
            undefined, "NONE",
          );
        }

        // Active Text (Dynamic)
        if (overlayText && page.originalText && !safeLayers.find((l) => l.type === "text" && l.isVisible)) {
          const safeBottom = fullHeight - config.bottom - config.bleed;

          if (settings.spreadTextSide === "left") {
            const safeLeft = config.outside + config.bleed;
            const safeRight = spreadWidth / 2 - gutter;
            const textImg = await createTextImageAsync(
              page.originalText,
              spreadWidth,
              fullHeight,
              safeLeft,
              safeRight,
              safeBottom,
              page.textPositionOverride,
              page.textBackgroundOverride,
            );
            if (textImg)
              pdf.addImage(
                textImg,
                "PNG",
                0,
                0,
                spreadWidth,
                fullHeight,
                undefined, "NONE",
              );
          } else if (settings.spreadTextSide === "both") {
            // Bilingual or both pages text
            const textParts = page.originalText
              .split("||")
              .map((t) => t.trim())
              .filter(Boolean);
            const mid = Math.ceil(textParts.length / 2);
            const leftText =
              textParts.slice(0, mid).join("\n\n") || page.originalText;
            const rightText =
              textParts.slice(mid).join("\n\n") || page.originalText;

            const safeLeftL = config.outside + config.bleed;
            const safeRightL = spreadWidth / 2 - gutter;
            const textImgL = await createTextImageAsync(
              leftText,
              spreadWidth,
              fullHeight,
              safeLeftL,
              safeRightL,
              safeBottom,
              page.textPositionOverride,
              page.textBackgroundOverride,
            );
            if (textImgL)
              pdf.addImage(
                textImgL,
                "PNG",
                0,
                0,
                spreadWidth,
                fullHeight,
                undefined, "NONE",
              );

            const safeLeftR = spreadWidth / 2 + gutter;
            const safeRightR = spreadWidth - config.outside - config.bleed;
            const textImgR = await createTextImageAsync(
              rightText,
              spreadWidth,
              fullHeight,
              safeLeftR,
              safeRightR,
              safeBottom,
              page.textPositionOverride,
              page.textBackgroundOverride,
            );
            if (textImgR)
              pdf.addImage(
                textImgR,
                "PNG",
                0,
                0,
                spreadWidth,
                fullHeight,
                undefined, "NONE",
              );
          } else {
            // default 'right'
            const safeLeft = spreadWidth / 2 + gutter;
            const safeRight = spreadWidth - config.outside - config.bleed;
            const textImg = await createTextImageAsync(
              page.originalText,
              spreadWidth,
              fullHeight,
              safeLeft,
              safeRight,
              safeBottom,
              page.textPositionOverride,
              page.textBackgroundOverride,
            );
            if (textImg)
              pdf.addImage(
                textImg,
                "PNG",
                0,
                0,
                spreadWidth,
                fullHeight,
                undefined, "NONE",
              );
          }
        }
      } else {
        pdf.addImage(
          image,
          getImageFormat(image),
          0,
          0,
          spreadWidth,
          fullHeight,
          undefined, "NONE",
        );
        if (overlayText && page.originalText) {
          const safeBottom = fullHeight - config.bottom - config.bleed;

          if (settings.spreadTextSide === "left") {
            const safeLeft = config.outside + config.bleed;
            const safeRight = spreadWidth / 2 - gutter;
            const textImg = await createTextImageAsync(
              page.originalText,
              spreadWidth,
              fullHeight,
              safeLeft,
              safeRight,
              safeBottom,
              page.textPositionOverride,
              page.textBackgroundOverride,
            );
            if (textImg)
              pdf.addImage(
                textImg,
                "PNG",
                0,
                0,
                spreadWidth,
                fullHeight,
                undefined, "NONE",
              );
          } else if (settings.spreadTextSide === "both") {
            const textParts = page.originalText
              .split("||")
              .map((t) => t.trim())
              .filter(Boolean);
            const mid = Math.ceil(textParts.length / 2);
            const leftText =
              textParts.slice(0, mid).join("\n\n") || page.originalText;
            const rightText =
              textParts.slice(mid).join("\n\n") || page.originalText;

            const safeLeftL = config.outside + config.bleed;
            const safeRightL = spreadWidth / 2 - gutter;
            const textImgL = await createTextImageAsync(
              leftText,
              spreadWidth,
              fullHeight,
              safeLeftL,
              safeRightL,
              safeBottom,
              page.textPositionOverride,
              page.textBackgroundOverride,
            );
            if (textImgL)
              pdf.addImage(
                textImgL,
                "PNG",
                0,
                0,
                spreadWidth,
                fullHeight,
                undefined, "NONE",
              );

            const safeLeftR = spreadWidth / 2 + gutter;
            const safeRightR = spreadWidth - config.outside - config.bleed;
            const textImgR = await createTextImageAsync(
              rightText,
              spreadWidth,
              fullHeight,
              safeLeftR,
              safeRightR,
              safeBottom,
              page.textPositionOverride,
              page.textBackgroundOverride,
            );
            if (textImgR)
              pdf.addImage(
                textImgR,
                "PNG",
                0,
                0,
                spreadWidth,
                fullHeight,
                undefined, "NONE",
              );
          } else {
            // default 'right'
            const safeLeft = spreadWidth / 2 + gutter;
            const safeRight = spreadWidth - config.outside - config.bleed;
            const textImg = await createTextImageAsync(
              page.originalText,
              spreadWidth,
              fullHeight,
              safeLeft,
              safeRight,
              safeBottom,
              page.textPositionOverride,
              page.textBackgroundOverride,
            );
            if (textImg)
              pdf.addImage(
                textImg,
                "PNG",
                0,
                0,
                spreadWidth,
                fullHeight,
                undefined, "NONE",
              );
          }
        }
      }
      currentPageNum += 2;
    } else if (page.isSpread && spreadMode === "SPLIT_PAGES") {
      // Split the spread into two single pages
      // Left Page (Even page, usually page 2, 4, etc. if starting from 1)
      if (currentPageNum > 1)
        pdf.addPage(
          [singleFullWidth, fullHeight],
          config.width > config.height ? "landscape" : "portrait",
        );

      // Draw left half of the spread. The spread is `spreadWidth` wide. We want to draw it such that the left half fits into `singleFullWidth`.
      // Since the left page has bleed on the left, but NO bleed on the right (gutter), the left half of the spread is exactly `singleFullWidth` wide.
      pdf.addImage(
        image,
        getImageFormat(image),
        0,
        0,
        spreadWidth,
        fullHeight,
        undefined, "NONE",
      );

      // Active Text (Dynamic) for Left Page
      if (overlayText && page.originalText) {
        const safeBottom = fullHeight - config.bottom - config.bleed;
        const safeLeft = config.outside + config.bleed;
        const safeRight = singleFullWidth - gutter;
        const textImg = await createTextImageAsync(
          page.originalText,
          singleFullWidth,
          fullHeight,
          safeLeft,
          safeRight,
          safeBottom,
          page.textPositionOverride,
          page.textBackgroundOverride,
        );
        if (textImg)
          pdf.addImage(
            textImg,
            "PNG",
            0,
            0,
            singleFullWidth,
            fullHeight,
            undefined, "NONE",
          );
      }
      currentPageNum++;

      // Right Page (Odd page)
      pdf.addPage(
        [singleFullWidth, fullHeight],
        config.width > config.height ? "landscape" : "portrait",
      );

      // Draw right half of the spread. We shift the image left by `singleFullWidth`.
      // Wait, the spread image has bleed on the left and right.
      // The right page needs bleed on the right, but NO bleed on the left (gutter).
      // So we shift the image left by `spreadWidth - singleFullWidth`.
      pdf.addImage(
        image,
        getImageFormat(image),
        -(spreadWidth - singleFullWidth),
        0,
        spreadWidth,
        fullHeight,
        undefined, "NONE",
      );

      currentPageNum++;

    } else {
      if (currentPageNum > 1)
        pdf.addPage(
          [singleFullWidth, fullHeight],
          config.width > config.height ? "landscape" : "portrait",
        );

      if (
        (layeredMode || (safeLayers && safeLayers.length > 0)) &&
        safeLayers
      ) {
        const flattened = await flattenLayers(safeLayers, singleFullWidth, fullHeight, config.bleed);
        if (flattened) {
          pdf.addImage(
            flattened,
            getImageFormat(flattened),
            0,
            0,
            singleFullWidth,
            fullHeight,
            undefined, "NONE",
          );
        }

        // Active Text (Dynamic)
        if (overlayText && page.originalText && !safeLayers.find((l) => l.type === "text" && l.isVisible)) {
          const safeBottom = fullHeight - config.bottom - config.bleed;
          const safeLeft = isRightPage
            ? gutter + config.bleed
            : config.outside + config.bleed;
          const safeRight = isRightPage
            ? singleFullWidth - config.outside - config.bleed
            : singleFullWidth - gutter - config.bleed;
          const textImg = await createTextImageAsync(
            page.originalText,
            singleFullWidth,
            fullHeight,
            safeLeft,
            safeRight,
            safeBottom,
            page.textPositionOverride,
            page.textBackgroundOverride,
          );
          if (textImg)
            pdf.addImage(
              textImg,
              "PNG",
              0,
              0,
              singleFullWidth,
              fullHeight,
              undefined, "NONE",
            );
        }
      } else {
        pdf.addImage(
          image,
          getImageFormat(image),
          0,
          0,
          singleFullWidth,
          fullHeight,
          undefined, "NONE",
        );
        if (overlayText && page.originalText) {
          const safeBottom = fullHeight - config.bottom - config.bleed;
          const safeLeft = isRightPage
            ? gutter + config.bleed
            : config.outside + config.bleed;
          const safeRight = isRightPage
            ? singleFullWidth - config.outside - config.bleed
            : singleFullWidth - gutter - config.bleed;
          const textImg = await createTextImageAsync(
            page.originalText,
            singleFullWidth,
            fullHeight,
            safeLeft,
            safeRight,
            safeBottom,
            page.textPositionOverride,
            page.textBackgroundOverride,
          );
          if (textImg)
            pdf.addImage(
              textImg,
              "PNG",
              0,
              0,
              singleFullWidth,
              fullHeight,
              undefined, "NONE",
            );
        }
      }
      currentPageNum++;
    }

    // Yield to the main thread to prevent UI freezing
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  pdf.save(`${title.replace(/\s+/g, "_")}_PRINT_INTERIOR.pdf`);
};
