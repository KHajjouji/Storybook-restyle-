import * as pdfjsLib from 'pdfjs-dist';

// We'll use CDN for the worker to avoid bundler issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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

export const extractImagesFromPDF = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for decent quality
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
    images.push(canvas.toDataURL('image/jpeg', 0.9));
  }

  return images;
};
