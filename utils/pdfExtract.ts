import * as pdfjsLib from 'pdfjs-dist';

// Use Vite's module resolution instead of CDN. CDN lags behind npm releases
// so the exact version (e.g. 5.7.284) often 404s, making getDocument() hang forever.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

export const extractProjectFromPDF = async (file: File): Promise<any> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const info = await pdf.getMetadata();

    // Check if we injected the project in the Subject field
    const subject = (info?.info as any)?.Subject;
    if (subject) {
      try {
        const metadata = JSON.parse(subject);
        return { metadata, pdf };
      } catch (e) {
        console.warn("Could not parse PDF subject as JSON", e);
      }
    }
    return { metadata: null, pdf };
  } catch (err) {
    console.error("Error extracting PDF metadata", err);
    throw err;
  }
};

export const extractImagesFromPDF = async (
  file: File,
  onProgress?: (imgUrl: string, idx: number, total: number) => void
): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) continue;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    const imgData = canvas.toDataURL('image/jpeg', 0.85);

    // Release canvas memory immediately — holding 40+ canvases in RAM causes
    // the tab to run out of memory and the UI to freeze on large PDFs.
    canvas.width = 0;
    canvas.height = 0;

    images.push(imgData);

    if (onProgress) {
      onProgress(imgData, i - 1, pdf.numPages);
      // Yield to main thread so React can paint the progress bar update
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  return images;
};
