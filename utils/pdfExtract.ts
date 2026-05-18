import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

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

export const extractImagesFromPDF = async (file: File, onProgress?: (imgUrl: string, idx: number, total: number) => void): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // Lower scale slightly to drastically improve memory and speed
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) continue;
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
      canvas: canvas,
    } as any;

    await page.render(renderContext).promise;
    const imgData = canvas.toDataURL('image/jpeg', 0.85);
    images.push(imgData);
    
    if (onProgress) {
      onProgress(imgData, i - 1, pdf.numPages);
      // Yield to main thread to allow React to paint the new page smoothly
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Release native memory for this canvas immediately
    canvas.width = 0;
    canvas.height = 0;
  }

  return images;
};
