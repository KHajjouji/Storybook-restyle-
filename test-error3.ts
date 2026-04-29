import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

(async () => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

  try {
    const res = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: "A moroccan book cover",
        config: { imageConfig: { aspectRatio: "3:4", imageSize: "1K" } }
    });
    console.log("Success");
  } catch (e: any) {
    console.error("Message:", e.message);
  }
})();
