
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { CharacterRef, CharacterAssignment } from "./types";

/**
 * Parses a raw script text into a structured prompt pack.
 */
export const parsePromptPack = async (rawText: string): Promise<{ 
  masterBible: string, 
  characterIdentities: { name: string, description: string }[],
  scenes: { prompt: string, isSpread: boolean }[] 
}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are an expert production assistant for children's books. Analyze the provided script to extract structural production data.
    
    1. EXTRACT MASTER BIBLE: Look for sections like "PROMPT:" or "Full style lock". Combine them into a single coherent style instruction.
    2. EXTRACT CHARACTER IDENTITIES: Find the "Consistent characters" section. Extract the exact name and their full physical descriptions.
    3. EXTRACT SCENES: Find every "Scene X" block. Extract the description and constraints. 
    4. ASPECT RATIO: Mark isSpread as true if wide/panoramic.
    
    Script:
    ${rawText}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          masterBible: { type: Type.STRING },
          characterIdentities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ['name', 'description']
            }
          },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                prompt: { type: Type.STRING },
                isSpread: { type: Type.BOOLEAN }
              },
              required: ['prompt', 'isSpread']
            }
          }
        },
        required: ['masterBible', 'characterIdentities', 'scenes']
      }
    }
  });
  
  const jsonStr = response.text?.trim() || '{"masterBible":"", "characterIdentities":[], "scenes":[]}';
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return { masterBible: "", characterIdentities: [], scenes: [] };
  }
};

/**
 * Designs character sheets.
 */
export const identifyAndDesignCharacters = async (charDescription: string, stylePrompt: string): Promise<CharacterRef[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const instruction = `INDUSTRIAL CHARACTER DESIGN SHEET:
  CHARACTER DESCRIPTION: ${charDescription}
  STYLE LOCK: ${stylePrompt}
  - Professional character sheet (Front, Side, 3/4).
  - Accurate ethnicity.
  - Solid white background.`;

  const imgResponse: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts: [{ text: instruction }] },
    config: { imageConfig: { aspectRatio: '1:1', imageSize: '1K' } }
  });

  let base64 = "";
  if (imgResponse.candidates?.[0]?.content?.parts) {
    for (const part of imgResponse.candidates[0].content.parts) {
      if (part.inlineData) { 
        base64 = `data:image/png;base64,${part.inlineData.data}`; 
        break; 
      }
    }
  }
  return [{ 
    id: Math.random().toString(36).substring(7), 
    name: "Character", 
    description: charDescription, 
    images: base64 ? [base64] : [] 
  }];
};

/**
 * Restyles an illustration.
 */
export const restyleIllustration = async (
  originalImageBase64: string | undefined,
  stylePrompt: string,
  styleRefBase64?: string,
  targetText?: string,
  charRefs: CharacterRef[] = [],
  assignments: CharacterAssignment[] = [],
  usePro: boolean = true,
  cleanBackground: boolean = false,
  isSpread: boolean = false,
  masterBible?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = usePro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  
  const instruction = `ILLUSTRATOR TASK:
  BIBLE: ${masterBible}
  LAYOUT: ${isSpread ? "2-page spread" : "Single page"}
  SCENE: ${stylePrompt}
  Maintain character likeness exactly. No text.`;

  const parts: any[] = [{ text: instruction }];
  
  if (originalImageBase64) {
    const data = originalImageBase64.includes(',') ? originalImageBase64.split(',')[1] : originalImageBase64;
    parts.push({ inlineData: { data, mimeType: 'image/png' } });
  }

  charRefs.forEach((ref) => {
    ref.images.forEach((img) => {
      const data = img.includes(',') ? img.split(',')[1] : img;
      parts.push({ inlineData: { data, mimeType: 'image/png' } });
    });
  });

  if (styleRefBase64) { 
    const data = styleRefBase64.includes(',') ? styleRefBase64.split(',')[1] : styleRefBase64;
    parts.push({ inlineData: { data, mimeType: 'image/png' } }); 
  }

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: { parts },
    config: { imageConfig: { aspectRatio: isSpread ? "16:9" : "4:3", ...(usePro ? { imageSize: "1K" } : {}) } }
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Render failed.");
};

/**
 * REFINE ILLUSTRATION: targeted corrective edits with multiple references.
 */
export const refineIllustration = async (
  targetImageBase64: string,
  refinementPrompt: string,
  referenceImages: { base64: string, index: number }[] = [],
  isSpread: boolean = false
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const targetData = targetImageBase64.includes(',') ? targetImageBase64.split(',')[1] : targetImageBase64;
  
  const instruction = `TARGETED IMAGE CORRECTION TASK:
  
  GOAL: Modify the "TARGET IMAGE" based on this prompt: "${refinementPrompt}"
  
  CONTEXT: You are provided with the "TARGET IMAGE" and several "REFERENCE IMAGES" labeled by number.
  
  STRICT RULES:
  1. Only generate a modified version of the TARGET IMAGE.
  2. If the prompt mentions "Image X", refer to the corresponding numbered REFERENCE IMAGE.
  3. Maintain the artistic style, lighting, and composition of the TARGET IMAGE.
  4. Transfer specific features (like faces, clothing, or objects) from the REFERENCE IMAGES to the TARGET IMAGE if requested.
  5. The output must be a single cohesive illustration.`;

  const parts: any[] = [
    { text: instruction },
    { text: "--- TARGET IMAGE ---" },
    { inlineData: { data: targetData, mimeType: 'image/png' } }
  ];

  // Add reference images labeled clearly
  referenceImages.forEach((ref) => {
    const data = ref.base64.includes(',') ? ref.base64.split(',')[1] : ref.base64;
    parts.push({ text: `--- REFERENCE IMAGE ${ref.index} ---` });
    parts.push({ inlineData: { data, mimeType: 'image/png' } });
  });

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: { imageConfig: { aspectRatio: isSpread ? "16:9" : "4:3", imageSize: "1K" } }
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Refinement failed.");
};

/**
 * Upscales an illustration to 4K.
 */
export const upscaleIllustration = async (
  currentImageBase64: string,
  stylePrompt: string,
  isSpread: boolean = false
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const data = currentImageBase64.includes(',') ? currentImageBase64.split(',')[1] : currentImageBase64;
  
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [
        { inlineData: { data, mimeType: 'image/png' } },
        { text: `UPSCALE 4K enhancement. Context: ${stylePrompt}` }
      ]
    },
    config: { imageConfig: { aspectRatio: isSpread ? "16:9" : "4:3", imageSize: "4K" } }
  });
  
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Upscale failed.");
};

export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  if (targetLanguage === 'NONE_CLEAN_BG' || targetLanguage === 'English') return text;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Translate to ${targetLanguage}: "${text}"`,
  });
  return response.text?.trim() || text;
};

export const analyzeStyleFromImage = async (imageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [{ inlineData: { data, mimeType: 'image/png' } }, { text: "Describe style." }] }
  });
  return response.text?.trim() || "";
};

export const planStoryScenes = async (fullScript: string, characters: CharacterRef[]): Promise<{pages: {text: string, isSpread: boolean, mappedCharacterNames: string[]}[]}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Plan storyboards. Script: ${fullScript}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          pages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                isSpread: { type: Type.BOOLEAN },
                mappedCharacterNames: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ['text', 'isSpread', 'mappedCharacterNames']
            }
          }
        }
      }
    }
  });
  const jsonStr = response.text || '{"pages":[]}';
  try { return JSON.parse(jsonStr); } catch (e) { return { pages: [] }; }
};

export const extractTextFromImage = async (imageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [{ inlineData: { data, mimeType: 'image/png' } }, { text: "Extract text." }] },
  });
  return response.text?.trim() || "";
};
