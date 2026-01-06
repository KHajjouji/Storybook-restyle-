import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { CharacterRef, CharacterAssignment } from "./types";

export const parsePromptPack = async (rawText: string): Promise<{ 
  masterBible: string, 
  characterIdentities: { name: string, description: string }[],
  scenes: { prompt: string, isSpread: boolean }[] 
}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
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
  
  try {
    return JSON.parse(response.text || '{"masterBible":"", "characterIdentities":[], "scenes":[]}');
  } catch (e) {
    return { masterBible: "", characterIdentities: [], scenes: [] };
  }
};

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

  const imgResponse = await ai.models.generateContent({
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
    image: base64 
  }];
};

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
  const parts: any[] = [];

  let instruction = `You are a master children's book illustrator.
  
  STRICT GLOBAL RULES (THE BIBLE):
  ${masterBible}
  
  SCENE LAYOUT: ${isSpread ? "Two-page panoramic spread (2:1). Ensure character focus is not in the center gutter." : "Single page landscape."}
  
  SCENE DESCRIPTION:
  ${stylePrompt}
  
  CONSISTENCY ANCHORS:
  I have attached reference sheets for the main characters. They MUST look identical to these references in the scene.
  - Pay attention to specific outfits, hair styles (e.g. ponytail for mom, simple pigtails for girl), and skin tones.
  
  CONSTRAINTS: No text, no logos, cozy warm lighting, soft painterly style.`;

  parts.push({ text: instruction });

  charRefs.forEach((ref) => {
    if (ref.image) {
      parts.push({ inlineData: { data: ref.image.split(',')[1], mimeType: 'image/png' } });
    }
  });

  if (styleRefBase64) { 
    parts.push({ inlineData: { data: styleRefBase64.split(',')[1], mimeType: 'image/png' } }); 
  }

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: { 
      imageConfig: { 
        aspectRatio: isSpread ? "16:9" : "4:3", 
        imageSize: "1K" 
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

export const upscaleIllustration = async (
  currentImageBase64: string,
  stylePrompt: string,
  isSpread: boolean = false
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [
    { inlineData: { data: currentImageBase64.split(',')[1], mimeType: 'image/png' } },
    { text: `UPSCALE 4K: High-resolution enhancement. Maintain exact character likeness and art style. Context: ${stylePrompt}` }
  ];
  const response = await ai.models.generateContent({
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

export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  if (targetLanguage === 'NONE_CLEAN_BG' || targetLanguage === 'English') return text;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Translate to ${targetLanguage}: "${text}"`,
  });
  return response.text?.trim() || text;
};

export const analyzeStyleFromImage = async (imageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } },
        { text: "Describe this art style for an AI prompt." }
      ]
    }
  });
  return response.text?.trim() || "";
};

export const planStoryScenes = async (fullScript: string, characters: CharacterRef[]): Promise<{pages: {text: string, isSpread: boolean, mappedCharacterNames: string[]}[]}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
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
  try { return JSON.parse(response.text || '{"pages":[]}'); } catch (e) { return { pages: [] }; }
};

export const extractTextFromImage = async (imageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } },
        { text: "Extract text." }
      ]
    },
  });
  return response.text?.trim() || "";
};