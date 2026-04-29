import dotenv from 'dotenv';
dotenv.config();
import { generateBookCover } from './geminiService.js';

(async () => {
  const projectContext = `A children's book cover illustration. Cover instruction: ...`;
  
  console.log("Generating cover with augmented context...");
  try {
    const res = await generateBookCover(projectContext, [], 'soft vibrant Moroccan color palette', undefined, '1K', '9:16', 'KDP_8_25x8_25', 24, undefined);
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
