import dotenv from 'dotenv';
dotenv.config();
import { generateBookCover } from './geminiService.js';

(async () => {
  const coverPrompt = `Create a children’s book cover illustration in a soft, vibrant 2D cartoon style with rounded expressive characters, clean outlines, minimal shading, and a warm Moroccan color palette (terracotta, beige, gold, soft blue).
The main scene shows a Moroccan grandfather sitting comfortably...`;
  const storyText = `Some story text here about Morocco...`;

  const projectContext = `A children's book cover illustration. Cover instruction: ${coverPrompt}\n\nStory context: ${storyText.substring(0, 1000)}`;
  
  console.log("Generating cover with augmented context...");
  try {
    const res = await generateBookCover(projectContext, [], 'soft vibrant Moroccan color palette', undefined, '1K', '16:9', undefined, undefined, undefined);
    console.log(res.substring(0, 50));
  } catch (e: any) {
    if (e.statusDetails) {
        console.error(JSON.stringify(e.statusDetails, null, 2));
    } else {
        console.error(JSON.stringify(e, null, 2));
        console.error(e.message);
    }
  }
})();
