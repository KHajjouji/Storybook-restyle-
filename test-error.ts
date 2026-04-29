import dotenv from 'dotenv';
dotenv.config();
import { generateBookCover } from './geminiService.js';

(async () => {
  const projectContext = `A children's book cover...`;
  
  try {
    const res = await generateBookCover(projectContext, [], 'soft vibrant Moroccan color palette', undefined, '1K', '9:16', undefined, undefined, 'data:image/png;base64,AABBBCCC');
    console.log(res.substring(0, 50));
  } catch (e: any) {
    if (e.statusDetails) {
        console.error("statusDetails:", JSON.stringify(e.statusDetails, null, 2));
    } else {
        console.error("Error object:", JSON.stringify(e, null, 2));
        console.error("Message:", e.message);
    }
  }
})();
