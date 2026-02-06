
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { CharacterRef, CharacterAssignment } from "./types";

/**
 * Parses a raw script text into a structured prompt pack.
 * Uses gemini-3-flash-preview for text analysis.
 */
export const parsePromptPack = async (rawText: string): Promise<{ 
  masterBible: string, 
  characterIdentities: { name: string, description: string }[],
  scenes: { prompt: string, isSpread: boolean }[] 
}> => {
  // Use named parameter for apiKey and create instance right before call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are an expert production assistant for children's books. Analyze the provided script to extract structural production data.
    
    1. EXTRACT MASTER BIBLE: Look for sections like "PROMPT:" or "Full style lock". Combine them into a single coherent style instruction.
    2. EXTRACT CHARACTER IDENTITIES: Find the "Consistent characters" section. Extract the exact name (e.g., "Spanish Mom", "Moroccan Dad", "Yassin", "Lina") and their full physical descriptions including age, skin tone, hair, and typical clothing.
    3. EXTRACT SCENES: Find every "Scene X" block. For each, extract the "Scene description" and any specific constraints. 
    4. ASPECT RATIO: If a scene is described as "Wide", "Landscape", "Panoramic", or "Spread", mark isSpread as true.
    
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
  
  // Property access for text, handle potential undefined
  const jsonStr = response.text?.trim() || '{"masterBible":"", "characterIdentities":[], "scenes":[]}';
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return { masterBible: "", characterIdentities: [], scenes: [] };
  }
};

/**
 * Designs character sheets based on descriptions.
 * Uses gemini-3-pro-image-preview for high-quality character consistency.
 */
export const identifyAndDesignCharacters = async (charDescription: string, stylePrompt: string): Promise<CharacterRef[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const instruction = `INDUSTRIAL CHARACTER DESIGN SHEET:
  CHARACTER DESCRIPTION: ${charDescription}
  STYLE LOCK: ${stylePrompt}
  
  CORE REQUIREMENTS:
  - Generate a professional character sheet with 3 views: Front, Side, and 3/4.
  - STRICTLY ADHERE TO HUMAN ETHNICITY: If described as Moroccan or Spanish, use those specific facial features and skin tones.
  - DO NOT generate robots or generic creatures. This is for a human family story.
  - Solid white background, no clutter.
  - Rounded simplified shapes, big expressive eyes, soft painterly rendering.
  - High readability and consistent color palette.`;

  const imgResponse: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts: [{ text: instruction }] },
    config: { imageConfig: { aspectRatio: '1:1', imageSize: '1K' } }
  });

  let base64 = "";
  // Safely iterate through candidates and parts to find the image part
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
 * Restyles an illustration while maintaining character consistency.
 * Uses gemini-2.5-flash-image or gemini-3-pro-image-preview.
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
  
  const instruction = `You are a master children's book illustrator.
  
  STRICT GLOBAL RULES (THE BIBLE):
  ${masterBible}
  
  SCENE LAYOUT: ${isSpread ? "Two-page panoramic spread (2:1). Ensure character focus is not in the center gutter." : "Single page landscape."}
  
  SCENE DESCRIPTION:
  ${stylePrompt}
  
  CONSISTENCY ANCHORS:
  I have attached one or more reference images for each character. They MUST look identical to these references in the scene (face, hair, skin, clothing).
  - Pay attention to specific outfits, hair styles, and skin tones.
  - Replicate the facial features exactly.
  
  CONSTRAINTS: No text, no logos, cozy warm lighting, soft painterly style.`;

  const parts: any[] = [{ text: instruction }];

  // Safely extract base64 data for inlineData parts
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
    config: { 
      imageConfig: { 
        aspectRatio: isSpread ? "16:9" : "4:3", 
        ...(usePro ? { imageSize: "1K" } : {})
      } 
    }
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Render failed.");
};

/**
 * Upscales an illustration to 4K.
 * Uses gemini-3-pro-image-preview for high-quality upscaling.
 */
export const upscaleIllustration = async (
  currentImageBase64: string,
  stylePrompt: string,
  isSpread: boolean = false
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const data = currentImageBase64.includes(',') ? currentImageBase64.split(',')[1] : currentImageBase64;
  
  const parts: any[] = [
    { inlineData: { data, mimeType: 'image/png' } },
    { text: `UPSCALE 4K: High-resolution enhancement. Maintain exact character likeness and art style. Context: ${stylePrompt}` }
  ];
  
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: { imageConfig: { aspectRatio: isSpread ? "16:9" : "4:3", imageSize: "4K" } }
  });
  
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Upscale failed.");
};

/**
 * Translates text using gemini-3-flash-preview.
 */
export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  if (targetLanguage === 'NONE_CLEAN_BG' || targetLanguage === 'English') return text;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Translate to ${targetLanguage}: "${text}"`,
  });
  // Use property access for text
  return response.text?.trim() || text;
};

/**
 * Analyzes an image and describes its art style.
 */
export const analyzeStyleFromImage = async (imageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data, mimeType: 'image/png' } },
        { text: "Describe this art style for an AI prompt." }
      ]
    }
  });
  return response.text?.trim() || "";
};

/**
 * Plans story scenes based on a full script.
 */
export const planStoryScenes = async (fullScript: string, characters: CharacterRef[]): Promise<{pages: {text: string, isSpread: boolean, mappedCharacterNames: string[]}[]}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Plan the storyboards for this book. Script: ${fullScript}`,
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

/**
 * Extracts text from an image.
 */
export const extractTextFromImage = async (imageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data, mimeType: 'image/png' } },
        { text: "Extract text." }
      ]
    },
  });
  return response.text?.trim() || "";
};
