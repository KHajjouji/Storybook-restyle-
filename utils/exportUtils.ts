import JSZip from 'jszip';
import { BookPage } from '../types';

// ─── Helper ────────────────────────────────────────────────────────────────────

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const stripDataPrefix = (base64: string) =>
  base64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

// ─── Canva export ─────────────────────────────────────────────────────────────

export const exportProjectAssetsForCanva = async (
  pages: BookPage[],
  projectName: string
): Promise<void> => {
  return exportForCanva(pages, projectName);
};

export const exportForCanva = async (
  pages: BookPage[],
  projectName: string
): Promise<void> => {
  const zip = new JSZip();
  const name = (projectName || 'StoryFlow_Book').replace(/[^a-z0-9_\- ]/gi, '_');
  const folder = zip.folder(name);
  if (!folder) return;

  const instructions = `HOW TO IMPORT YOUR BOOK INTO CANVA
====================================

1. Unzip this folder on your computer.
2. Go to https://www.canva.com and sign in.
3. Click "Create a design" and choose your book size (e.g. A4 or custom).
4. In the left sidebar, click "Uploads" then "Upload files".
5. Select all the PNG images from the "${name}" folder.
6. Drag each image onto a new page in your Canva design.
7. Add text, stickers, or any finishing touches.
8. Download your finished book as PDF (Print) from Canva.

TIP: Each page is in its own sub-folder. If layers are available,
you'll find them inside a "layers" sub-folder for extra flexibility.

Happy creating!
`;

  folder.file('HOW_TO_IMPORT_CANVA.txt', instructions);

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageNum = String(i + 1).padStart(2, '0');
    const pageFolder = folder.folder(`page_${pageNum}`);
    if (!pageFolder) continue;

    // Composite image (primary)
    const composite = page.processedImage || page.originalImage;
    if (composite) {
      pageFolder.file(`page_${pageNum}_composite.png`, stripDataPrefix(composite), {
        base64: true,
      });
    }

    // Individual layers (if available)
    if (page.layers && page.layers.length > 0) {
      const layersFolder = pageFolder.folder('layers');
      if (layersFolder) {
        page.layers.forEach((layer, li) => {
          if (layer.image) {
            const layerName = layer.type || `layer_${li}`;
            layersFolder.file(`${layerName}.png`, stripDataPrefix(layer.image), {
              base64: true,
            });
          }
        });
      }
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${name}_canva.zip`);
};

// ─── Adobe Express export ─────────────────────────────────────────────────────

export const exportForAdobeExpress = async (
  pages: BookPage[],
  projectName: string
): Promise<void> => {
  const zip = new JSZip();
  const name = (projectName || 'StoryFlow_Book').replace(/[^a-z0-9_\- ]/gi, '_');
  const folder = zip.folder(name);
  if (!folder) return;

  const instructions = `HOW TO IMPORT YOUR BOOK INTO ADOBE EXPRESS
===========================================

1. Unzip this folder on your computer.
2. Go to https://express.adobe.com and sign in.
3. Click "Create" and start a new project (choose your book size).
4. Click "Add media" or the "+" button and upload the PNG images.
5. Place each page image as a full-page background.
6. Add text, effects, and your personal touches.
7. Download your finished book as a PDF or image set.

Your pages are numbered and ready to drop in order:
${pages.map((_, i) => `  page_${String(i + 1).padStart(2, '0')}.png`).join('\n')}

Happy creating!
`;

  folder.file('HOW_TO_IMPORT_ADOBE_EXPRESS.txt', instructions);

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageNum = String(i + 1).padStart(2, '0');
    const composite = page.processedImage || page.originalImage;
    if (composite) {
      folder.file(`page_${pageNum}.png`, stripDataPrefix(composite), { base64: true });
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${name}_adobe_express.zip`);
};

// ─── Google Slides export (PPTX) ─────────────────────────────────────────────

export const exportForGoogleSlides = async (
  pages: BookPage[],
  projectName: string
): Promise<void> => {
  // Dynamically import pptxgenjs to avoid adding it to the initial bundle
  const PptxGenJSModule = await import('pptxgenjs');
  const PptxGenJS = PptxGenJSModule.default ?? PptxGenJSModule;

  const pptx = new (PptxGenJS as any)();
  const name = (projectName || 'StoryFlow_Book').replace(/[^a-z0-9_\- ]/gi, '_');

  // Use a square-ish layout suitable for children's books
  // Standard Google Slides is 10" x 7.5"; we use a close approximation
  pptx.defineLayout({ name: 'BOOK', width: 8.5, height: 8.5 });
  pptx.layout = 'BOOK';
  pptx.title = projectName || 'My Storybook';
  pptx.subject = 'Children\'s book created with StoryFlow AI';

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };

    const composite = page.processedImage || page.originalImage;
    if (composite) {
      slide.addImage({
        data: composite,
        x: 0,
        y: 0,
        w: '100%',
        h: '100%',
        sizing: { type: 'cover', w: 8.5, h: 8.5 },
      });
    }

    // Optional page text overlay at the bottom
    if (page.originalText && page.originalText.trim()) {
      const text = page.originalText.trim();
      slide.addText(text, {
        x: 0.4,
        y: 6.2,
        w: 7.7,
        h: 2.0,
        fontSize: 18,
        color: 'FFFFFF',
        bold: false,
        align: 'center',
        valign: 'middle',
        wrap: true,
        shadow: {
          type: 'outer',
          angle: 45,
          blur: 8,
          color: '000000',
          opacity: 0.85,
          offset: 2,
        },
      });
    }
  }

  // writeFile triggers browser download automatically
  await pptx.writeFile({ fileName: `${name}_google_slides.pptx` });
};
