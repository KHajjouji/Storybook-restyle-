import JSZip from 'jszip';
import { BookPage } from '../types';

export const exportProjectAssetsForCanva = async (pages: BookPage[], projectName: string) => {
  const zip = new JSZip();
  const projectFolder = zip.folder(projectName || 'StoryFlow_Project');
  
  if (!projectFolder) return;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageNum = i + 1;
    const pageFolder = projectFolder.folder(`Page_${pageNum}`);
    
    if (!pageFolder) continue;

    // Add composite image
    const compositeImage = page.processedImage || page.originalImage;
    if (compositeImage) {
      const base64Data = compositeImage.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
      pageFolder.file(`Page_${pageNum}_Composite.png`, base64Data, { base64: true });
    }

    // Add individual layers if they exist
    if (page.layers && page.layers.length > 0) {
      const layersFolder = pageFolder.folder('Layers');
      if (layersFolder) {
        page.layers.forEach((layer, layerIdx) => {
          if (layer.image) {
            const base64Data = layer.image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
            layersFolder.file(`${layer.type}_${layerIdx}.png`, base64Data, { base64: true });
          }
        });
      }
    }
  }

  // Generate the zip file
  const content = await zip.generateAsync({ type: 'blob' });
  
  // Trigger download
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName || 'StoryFlow_Project'}_Canva_Assets.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
