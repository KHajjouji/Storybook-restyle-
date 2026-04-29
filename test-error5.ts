import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from "@google/genai";

(async () => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

  const textPrompt = `BOOK COVER TITLE LAYER: Render the title "My Title" in a bold, cinematic book cover font style. 
    IMPORTANT: Place the title in the UPPER THIRD of the frame, leaving at least 15% margin from all edges (SAFE MARGINS). 
    Place it on a SOLID PURE WHITE BACKGROUND. No other elements.`;

  try {
    console.log("Generating title layer...");
    const res = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: textPrompt,
        config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    console.log("Success?", !!res.text);
  } catch (e: any) {
    console.error("Message:", e.message);
  }
})();
