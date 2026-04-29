import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from "@google/genai";

(async () => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

  const p = `Create a children’s book cover illustration in a soft, vibrant 2D cartoon style with rounded expressive characters, clean outlines, minimal shading, and a warm Moroccan color palette (terracotta, beige, gold, soft blue).

The main scene shows a Moroccan grandfather sitting comfortably in a cozy living room with subtle Moroccan elements (rug, cushions). Two young children (a boy around 6 and a girl around 4) sit close to him, looking up with curiosity as he explains something.

Around them, include softly integrated symbolic scenes representing different celebrations, arranged in a circular composition:

* The Kaaba in the distance with a soft glowing light (Hajj)
* A family sitting together sharing food (Eid al-Adha, no animal scene)
* Children gently playing with water (Ashura / Zamzam tradition)
* A small group of kids cooking together outdoors with simple ingredients (Arafat Moroccan kids tradition)

All these elements should appear as soft, floating “memory bubbles” or visual thoughts around the grandfather, not separated panels.

The composition must feel unified and balanced, showing connection between all traditions.

Lighting should be warm and slightly golden to create a feeling of knowledge, warmth, and family transmission.

Leave a clear empty area at the top center for title placement.

No text inside the illustration.`;

  try {
    const res = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: p,
        config: { imageConfig: { aspectRatio: "3:4", imageSize: "1K" } }
    });
    const parts = res.candidates?.[0]?.content?.parts;
    console.log("Success?", parts && parts.length > 0 && !!parts[0].inlineData);
  } catch (e: any) {
    if (e.statusDetails) {
        console.error("statusDetails:", JSON.stringify(e.statusDetails, null, 2));
    } else {
        console.error("Error object:", JSON.stringify(e, null, 2));
        console.error("Message:", e.message);
    }
  }
})();
