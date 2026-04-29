import dotenv from 'dotenv';
dotenv.config();
import { generateBookCover } from './geminiService.js';

(async () => {
  const projectContext = `A children's book cover...`;
  
  try {
    const res = await generateBookCover(projectContext, [], 'soft vibrant Moroccan color palette', undefined, '4K', '9:16', undefined, undefined);
    console.log(res.substring(0, 50));
  } catch (e: any) {
    console.error("Message:", e.message);
  }
})();
