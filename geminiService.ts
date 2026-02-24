
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
    contents: `Analyze the provided script to extract structural production data.
    
    1. EXTRACT MASTER BIBLE: Look for style lock instructions.
    2. EXTRACT CHARACTER IDENTITIES: Find consistent characters and descriptions.
    3. EXTRACT SCENES: Find scene descriptions.
    
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
 * Specifically parses Activity Master Prompts into discrete spreads.
 */
export const parseActivityPack = async (rawText: string): Promise<{ 
  globalInstructions: string,
  spreads: { title: string, fullPrompt: string }[] 
}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Break down this Activity Master Prompt into individual spreads.
    Extract the "GLOBAL" section separately.
    For each "SPREAD X", extract the specific scene/logic/text requirements.

    Text:
    ${rawText}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          globalInstructions: { type: Type.STRING },
          spreads: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                fullPrompt: { type: Type.STRING }
              },
              required: ['title', 'fullPrompt']
            }
          }
        },
        required: ['globalInstructions', 'spreads']
      }
    }
  });
  
  const jsonStr = response.text?.trim() || '{"globalInstructions":"", "spreads":[]}';
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return { globalInstructions: "", spreads: [] };
  }
};

/**
 * Designs professional children's book cover.
 */
export const generateBookCover = async (
  projectContext: string,
  charRefs: CharacterRef[] = [],
  stylePrompt: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const instruction = `INDUSTRIAL BOOK COVER DESIGN TASK:
  
  PROJECT BRIEF:
  ${projectContext}
  
  ARTISTIC STYLE:
  ${stylePrompt}
  
  RULES:
  1. Generate a SINGLE professional book cover illustration.
  2. NO TITLE TEXT. NO LOGOS. Pure illustration only.
  3. Include the consistent characters provided in the reference images.
  4. Use a cinematic, high-end children's book layout (3:4 aspect ratio).
  5. Composition: Must feel like a series "Master Cover" that makes people eager to buy.`;

  const parts: any[] = [{ text: instruction }];
  
  charRefs.forEach((ref) => {
    ref.images.forEach((img) => {
      if (img && img !== "LOADING") {
        const data = img.includes(',') ? img.split(',')[1] : img;
        parts.push({ text: `REFERENCE CHARACTER: ${ref.name}` });
        parts.push({ inlineData: { data, mimeType: 'image/png' } });
      }
    });
  });

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: { imageConfig: { aspectRatio: "3:4", imageSize: "2K" } }
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Cover render failed.");
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
  masterBible?: string,
  imageSize: '1K' | '2K' | '4K' = '1K',
  projectContext: string = "",
  aspectRatio: "1:1" | "4:3" | "16:9" | "9:16" = "4:3"
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = usePro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  
  const instruction = `ILLUSTRATOR TASK:
  SERIES BIBLE: ${masterBible}
  PROJECT CONTEXT: ${projectContext}
  LAYOUT: ${aspectRatio}
  SCENE SCRIPT: ${stylePrompt}
  
  CORE RULE: Maintain character facial likeness exactly as shown in refs. No readable text unless specifically requested in the script for an activity layout.`;

  const parts: any[] = [{ text: instruction }];
  
  if (originalImageBase64) {
    const data = originalImageBase64.includes(',') ? originalImageBase64.split(',')[1] : originalImageBase64;
    parts.push({ text: "--- ORIGINAL LAYOUT REFERENCE ---" });
    parts.push({ inlineData: { data, mimeType: 'image/png' } });
  }

  charRefs.forEach((ref) => {
    ref.images.forEach((img) => {
      const data = img.includes(',') ? img.split(',')[1] : img;
      parts.push({ text: `CHARACTER IDENTITY: ${ref.name}` });
      parts.push({ inlineData: { data, mimeType: 'image/png' } });
    });
  });

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: { parts },
    config: { imageConfig: { aspectRatio, ...(usePro ? { imageSize } : {}) } }
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Render failed.");
};

/**
 * REFINE ILLUSTRATION: targeted corrective edits with multiple references and context.
 */
export const refineIllustration = async (
  targetImageBase64: string,
  refinementPrompt: string,
  referenceImages: { base64: string, index: number }[] = [],
  isSpread: boolean = false,
  imageSize: '1K' | '2K' | '4K' = '1K',
  masterBible: string = "",
  projectContext: string = "",
  charRefs: CharacterRef[] = [],
  aspectRatio: "1:1" | "4:3" | "16:9" | "9:16" = "4:3"
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const targetData = targetImageBase64.includes(',') ? targetImageBase64.split(',')[1] : targetImageBase64;
  
  const instruction = `SCENE FIXER TASK:
  SERIES BIBLE: ${masterBible}
  NARRATIVE CONTEXT: ${projectContext}
  FIX REQUEST: "${refinementPrompt}"
  
  GOAL: Modify the TARGET IMAGE to align with the FIX REQUEST while maintaining exact style and character features.`;

  const parts: any[] = [
    { text: instruction },
    { text: "--- TARGET IMAGE TO BE FIXED ---" },
    { inlineData: { data: targetData, mimeType: 'image/png' } }
  ];

  charRefs.forEach((ref) => {
    ref.images.forEach((img) => {
      const data = img.includes(',') ? img.split(',')[1] : img;
      parts.push({ text: `CHARACTER IDENTITY: ${ref.name}` });
      parts.push({ inlineData: { data, mimeType: 'image/png' } });
    });
  });

  referenceImages.forEach((ref) => {
    const data = ref.base64.includes(',') ? ref.base64.split(',')[1] : ref.base64;
    parts.push({ text: `--- SERIES REFERENCE ${ref.index} ---` });
    parts.push({ inlineData: { data, mimeType: 'image/png' } });
  });

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: { imageConfig: { aspectRatio, imageSize } }
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
  isSpread: boolean = false,
  imageSize: '1K' | '2K' | '4K' = '4K',
  aspectRatio: "1:1" | "4:3" | "16:9" | "9:16" = "4:3"
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const data = currentImageBase64.includes(',') ? currentImageBase64.split(',')[1] : currentImageBase64;
  
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [
        { inlineData: { data, mimeType: 'image/png' } },
        { text: `MASTER UPSCALE. Context: ${stylePrompt}` }
      ]
    },
    config: { imageConfig: { aspectRatio, imageSize } }
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

/**
 * RETARGET CHARACTERS: Maps characters from a source reference image to a target image using hotspots.
 */
export const retargetCharacters = async (
  sourceImageBase64: string,
  targetImageBase64: string,
  retargeting: { sourceHotspots: {x: number, y: number, label: number}[], targetHotspots: {x: number, y: number, label: number}[], instruction?: string },
  imageSize: '1K' | '2K' | '4K' = '1K',
  aspectRatio: "1:1" | "4:3" | "16:9" | "9:16" = "4:3"
): Promise<string> => {
  console.log("Starting retargetCharacters with:", { sourceHotspots: retargeting.sourceHotspots, targetHotspots: retargeting.targetHotspots });
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const sourceData = sourceImageBase64.includes(',') ? sourceImageBase64.split(',')[1] : sourceImageBase64;
  const targetData = targetImageBase64.includes(',') ? targetImageBase64.split(',')[1] : targetImageBase64;

  const mappingDescription = retargeting.sourceHotspots.map(sh => {
    const th = retargeting.targetHotspots.find(h => h.label === sh.label);
    if (!th) return "";
    return `Character at Source Hotspot ${sh.label} (x:${sh.x}%, y:${sh.y}%) should be mapped to Target Hotspot ${th.label} (x:${th.x}%, y:${th.y}%).`;
  }).filter(Boolean).join("\n");

  const instruction = `CHARACTER RETARGETING TASK:
  
  GOAL: Transfer character identities (faces, clothing, style) from the SOURCE REFERENCE to the TARGET IMAGE.
  
  MAPPING LOGIC:
  ${mappingDescription}
  
  ADDITIONAL INSTRUCTIONS:
  ${retargeting.instruction || "Maintain the exact pose and composition of the target image, but replace the characters with the ones from the source image as mapped by the hotspots."}
  
  RULES:
  1. Keep the background and environment of the TARGET IMAGE.
  2. Ensure character likeness from the SOURCE REFERENCE is preserved.
  3. Seamlessly blend the new character features into the target scene.`;

  const parts: any[] = [
    { text: instruction },
    { text: "--- SOURCE REFERENCE IMAGE ---" },
    { inlineData: { data: sourceData, mimeType: 'image/png' } },
    { text: "--- TARGET IMAGE (TO BE MODIFIED) ---" },
    { inlineData: { data: targetData, mimeType: 'image/png' } }
  ];

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: { imageConfig: { aspectRatio, imageSize } }
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Retargeting failed.");
};
