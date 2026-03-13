
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
  stylePrompt: string,
  masterBible: string = "",
  targetResolution: '1K' | '2K' | '4K' = '1K',
  targetAspectRatio: "1:1" | "4:3" | "16:9" | "9:16" = "9:16"
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const instruction = `INDUSTRIAL BOOK COVER DESIGN TASK:
  
  PROJECT BRIEF:
  ${projectContext}
  
  ARTISTIC STYLE:
  ${stylePrompt}
  
  MASTER BIBLE / GLOBAL RULES:
  ${masterBible}
  
  RULES:
  1. Generate a SINGLE professional book cover illustration.
  2. NO TITLE TEXT. NO LOGOS. Pure illustration only.
  3. Include the consistent characters provided in the reference images.
  4. Use a cinematic, high-end children's book layout.
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
    model: 'gemini-3.1-flash-image-preview',
    contents: { parts },
    config: { imageConfig: { aspectRatio: targetAspectRatio, imageSize: targetResolution } }
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
    model: 'gemini-3.1-flash-image-preview',
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
  const model = usePro ? 'gemini-3.1-flash-image-preview' : 'gemini-2.5-flash-image';
  
  const layoutRules = isSpread ? `
  LAYOUT RULES FOR 2-PAGE SPREAD:
  - This is a WIDE SPREAD that will be folded in the middle (GUTTER).
  - GUTTER SAFETY: Do NOT place any critical elements, faces, or TEXT in the vertical center of the image (the fold).
  - SAFE MARGINS: Keep all text and critical details at least 10% away from the top, bottom, and outer edges.
  - BALANCE: Ensure the composition works as two distinct halves while remaining a cohesive single image.` : "";

  const textInstruction = targetText ? `
  TEXT EMBEDDING TASK:
  - Include the following text in the illustration: "${targetText}"
  - Ensure the text is readable and fits the artistic style.
  - Placement: Position the text within the SAFE MARGINS. Avoid the GUTTER if this is a spread.` : "";

  const instruction = `ILLUSTRATOR TASK:
  SERIES BIBLE: ${masterBible}
  PROJECT CONTEXT: ${projectContext}
  LAYOUT: ${aspectRatio}
  SCENE SCRIPT: ${stylePrompt}
  ${layoutRules}
  ${textInstruction}
  
  CORE RULE: Maintain character facial likeness exactly as shown in refs. No readable text unless specifically requested in the script or provided in the TEXT EMBEDDING TASK.`;

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
  aspectRatio: "1:1" | "4:3" | "16:9" | "9:16" = "4:3",
  targetText?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const targetData = targetImageBase64.includes(',') ? targetImageBase64.split(',')[1] : targetImageBase64;
  
  const layoutRules = isSpread ? `
  LAYOUT RULES FOR 2-PAGE SPREAD:
  - This is a WIDE SPREAD that will be folded in the middle (GUTTER).
  - GUTTER SAFETY: Do NOT place any critical elements, faces, or TEXT in the vertical center of the image (the fold).
  - SAFE MARGINS: Keep all text and critical details at least 10% away from the top, bottom, and outer edges.` : "";

  const textInstruction = targetText ? `
  TEXT EMBEDDING TASK:
  - Include/Update the following text in the illustration: "${targetText}"
  - Placement: Position the text within the SAFE MARGINS. Avoid the GUTTER if this is a spread.` : "";

  const instruction = `SCENE FIXER TASK:
  SERIES BIBLE: ${masterBible}
  NARRATIVE CONTEXT: ${projectContext}
  FIX REQUEST: "${refinementPrompt}"
  ${layoutRules}
  ${textInstruction}
  
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
    model: 'gemini-3.1-flash-image-preview',
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
    model: 'gemini-3.1-flash-image-preview',
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
 * Refines a layered illustration by making separate calls for BG, Characters, and Props.
 */
export const separateIllustrationIntoLayers = async (
  targetImageBase64: string,
  refinementPrompt: string,
  referenceImages: { base64: string, index: number }[] = [],
  isSpread: boolean = false,
  imageSize: '1K' | '2K' | '4K' = '1K',
  masterBible: string = "",
  projectContext: string = "",
  charRefs: CharacterRef[] = [],
  aspectRatio: "1:1" | "4:3" | "16:9" | "9:16" = "4:3",
  targetText?: string
): Promise<{layers: any[], composite: string}> => {
  console.log("Starting layer separation...");
  
  // 1. BACKGROUND LAYER
  const bgPrompt = `LAYER SEPARATION: Extract the BACKGROUND ONLY from the provided image. Remove all characters, text bubbles, and text. Fill in the missing background details seamlessly. ${refinementPrompt}`;
  const bgImage = await refineIllustration(targetImageBase64, bgPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, [], aspectRatio);

  // 2. CHARACTER LAYER
  const charPrompt = `LAYER SEPARATION: Extract the CHARACTERS ONLY from the provided image. Remove the background, text bubbles, and text. Place the characters on a SOLID PURE WHITE BACKGROUND. ${refinementPrompt}`;
  const charRaw = await refineIllustration(targetImageBase64, charPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, charRefs, aspectRatio);
  const charImage = await removeWhiteBackground(charRaw);

  // 3. TEXT BUBBLE LAYER
  const bubblePrompt = `LAYER SEPARATION: Extract the TEXT BUBBLES or SPEECH BALLOONS ONLY from the provided image. Remove the background, characters, and the text inside the bubbles (leave the bubbles blank). Place the empty bubbles on a SOLID PURE WHITE BACKGROUND. ${refinementPrompt}`;
  const bubbleRaw = await refineIllustration(targetImageBase64, bubblePrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, [], aspectRatio);
  const bubbleImage = await removeWhiteBackground(bubbleRaw);

  // 4. TEXT LAYER
  const textPrompt = `LAYER SEPARATION: Extract the TEXT ONLY from the provided image. Remove the background, characters, and text bubbles. Place the text on a SOLID PURE WHITE BACKGROUND. ${refinementPrompt}`;
  const textRaw = await refineIllustration(targetImageBase64, textPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, [], aspectRatio);
  const textImage = await removeWhiteBackground(textRaw);

  const layers: any[] = [
    { id: 'bg-' + Math.random(), name: 'Background', image: bgImage, isVisible: true, type: 'background' },
    { id: 'char-' + Math.random(), name: 'Characters', image: charImage, isVisible: true, type: 'character' },
    { id: 'bubble-' + Math.random(), name: 'Text Bubbles', image: bubbleImage, isVisible: true, type: 'foreground' },
    { id: 'text-' + Math.random(), name: 'Text', image: textImage, isVisible: true, type: 'text' }
  ];

  // Create a composite for the main preview
  const composite = await new Promise<string>((resolve) => {
    const canvas = document.createElement('canvas');
    const [w, h] = aspectRatio.split(':').map(Number);
    const ratio = w / h;
    canvas.width = 1024 * ratio;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    
    let loaded = 0;
    const imgs = layers.map(l => {
      const img = new Image();
      img.onload = () => {
        loaded++;
        if (loaded === layers.length) {
          const order = ['background', 'character', 'foreground', 'text'];
          order.forEach(type => {
            const layer = layers.find(l => l.type === type);
            if (layer && layer.isVisible) {
              const idx = layers.indexOf(layer);
              ctx.drawImage(imgs[idx], 0, 0, canvas.width, canvas.height);
            }
          });
          resolve(canvas.toDataURL('image/png'));
        }
      };
      img.src = l.image;
      return img;
    });
  });

  return { layers, composite };
};

export const refineLayeredIllustration = async (
  targetImageBase64: string,
  refinementPrompt: string,
  referenceImages: { base64: string, index: number }[] = [],
  isSpread: boolean = false,
  imageSize: '1K' | '2K' | '4K' = '1K',
  masterBible: string = "",
  projectContext: string = "",
  charRefs: CharacterRef[] = [],
  aspectRatio: "1:1" | "4:3" | "16:9" | "9:16" = "4:3",
  targetText?: string
): Promise<{layers: any[], composite: string}> => {
  console.log("Starting precision layered refinement...");
  
  // 1. BACKGROUND LAYER REFINEMENT
  const bgPrompt = `ENVIRONMENT/BACKGROUND FIX: ${refinementPrompt}. ABSOLUTELY NO CHARACTERS, NO PEOPLE, NO ANIMALS, AND NO FOREGROUND PROPS. Just the empty scene environment.`;
  const bgImage = await refineIllustration(targetImageBase64, bgPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, [], aspectRatio);

  // 2. CHARACTER LAYER REFINEMENT
  const charPrompt = `CHARACTER LAYER FIX: ${refinementPrompt}. Render the characters ONLY. ABSOLUTELY NO BACKGROUND, NO ENVIRONMENT, AND NO PROPS OR OBJECTS. Place them on a SOLID PURE WHITE BACKGROUND.`;
  const charRaw = await refineIllustration(targetImageBase64, charPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, charRefs, aspectRatio);
  const charImage = await removeWhiteBackground(charRaw);

  // 3. FOREGROUND PROPS LAYER REFINEMENT
  const propsPrompt = `FOREGROUND PROPS FIX: ${refinementPrompt}. Render only the interactive objects, toys, or foreground elements. ABSOLUTELY NO CHARACTERS AND NO BACKGROUND. Place them on a SOLID PURE WHITE BACKGROUND.`;
  const propsRaw = await refineIllustration(targetImageBase64, propsPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, [], aspectRatio);
  const propsImage = await removeWhiteBackground(propsRaw);

  // 4. TEXT LAYER (If applicable)
  let textLayer = null;
  if (targetText) {
    const textPrompt = `TEXT LAYER FIX: Render/Update the text "${targetText}" in a professional book font style. 
    IMPORTANT: Place the text in the LOWER CENTER of the frame, leaving at least 15% margin from all edges to ensure it stays within print safe zones. 
    Place it on a SOLID PURE WHITE BACKGROUND. No other elements.`;
    const textRaw = await refineIllustration(targetImageBase64, textPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, [], aspectRatio);
    textLayer = await removeWhiteBackground(textRaw);
  }

  const layers: any[] = [
    { id: 'bg-' + Math.random(), name: 'Background', image: bgImage, isVisible: true, type: 'background' },
    { id: 'props-' + Math.random(), name: 'Foreground Props', image: propsImage, isVisible: true, type: 'foreground' },
    { id: 'char-' + Math.random(), name: 'Characters', image: charImage, isVisible: true, type: 'character' }
  ];

  if (textLayer) {
    layers.push({ id: 'text-' + Math.random(), name: 'Text', image: textLayer, isVisible: true, type: 'text' });
  }

  // Create a composite for the main preview
  const composite = await new Promise<string>((resolve) => {
    const canvas = document.createElement('canvas');
    const [wStr, hStr] = aspectRatio.split(':');
    const w = parseInt(wStr);
    const h = parseInt(hStr);
    canvas.width = 1024 * (w/h);
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    
    let loaded = 0;
    const imgs = layers.map(l => {
      const img = new Image();
      img.onload = () => {
        loaded++;
        if (loaded === layers.length) {
          const order = ['background', 'foreground', 'character', 'text'];
          order.forEach(type => {
            const layer = layers.find(l => l.type === type);
            if (layer && layer.isVisible) {
              const idx = layers.indexOf(layer);
              ctx.drawImage(imgs[idx], 0, 0, canvas.width, canvas.height);
            }
          });
          resolve(canvas.toDataURL('image/png'));
        }
      };
      img.src = l.image;
      return img;
    });
  });

  return { layers, composite };
};

/**
 * Removes white background from a base64 image using canvas with edge softening.
 */
export const removeWhiteBackground = (base64: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Calculate "whiteness"
        const min = Math.min(r, g, b);
        const max = Math.max(r, g, b);
        const isWhiteish = min > 220 && (max - min) < 30; // High brightness, low saturation
        
        if (isWhiteish) {
          // Linear alpha based on brightness for smoother edges
          const brightness = (r + g + b) / 3;
          if (brightness > 250) {
            data[i + 3] = 0;
          } else if (brightness > 220) {
            // Smooth transition
            const alpha = Math.floor((255 * (255 - brightness)) / 35);
            data[i + 3] = Math.min(data[i + 3], alpha);
          }
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = base64;
  });
};

/**
 * Generates a multi-layered illustration by making separate calls for BG, Characters, and Props.
 */
export const generateLayeredIllustration = async (
  stylePrompt: string,
  charRefs: CharacterRef[] = [],
  masterBible: string = "",
  projectContext: string = "",
  aspectRatio: "1:1" | "4:3" | "16:9" | "9:16" = "4:3",
  targetResolution: '1K' | '2K' | '4K' = '1K',
  targetText?: string
): Promise<{layers: any[], composite: string}> => {
  console.log("Starting precision layered generation...");
  
  // 1. BACKGROUND LAYER
  const bgPrompt = `ENVIRONMENT/BACKGROUND ONLY: ${stylePrompt}. ABSOLUTELY NO CHARACTERS, NO PEOPLE, NO ANIMALS, AND NO FOREGROUND PROPS. Just the empty scene environment.`;
  const bgImage = await restyleIllustration(undefined, bgPrompt, undefined, undefined, [], [], true, false, false, masterBible, targetResolution, projectContext, aspectRatio);

  // 2. CHARACTER LAYER
  const charPrompt = `CHARACTER LAYER ONLY: ${stylePrompt}. Render the characters ONLY. ABSOLUTELY NO BACKGROUND, NO ENVIRONMENT, AND NO PROPS OR OBJECTS. Place them on a SOLID PURE WHITE BACKGROUND.`;
  const charRaw = await restyleIllustration(undefined, charPrompt, undefined, undefined, charRefs, [], true, false, false, masterBible, targetResolution, projectContext, aspectRatio);
  const charImage = await removeWhiteBackground(charRaw);

  // 3. FOREGROUND PROPS LAYER
  const propsPrompt = `FOREGROUND PROPS AND ELEMENTS ONLY: ${stylePrompt}. Render only the interactive objects, toys, or foreground elements mentioned in the scene. ABSOLUTELY NO CHARACTERS AND NO BACKGROUND. Place them on a SOLID PURE WHITE BACKGROUND.`;
  const propsRaw = await restyleIllustration(undefined, propsPrompt, undefined, undefined, [], [], true, false, false, masterBible, targetResolution, projectContext, aspectRatio);
  const propsImage = await removeWhiteBackground(propsRaw);

  // 4. TEXT LAYER (If applicable)
  let textLayer = null;
  if (targetText) {
    const textPrompt = `TEXT LAYER: Render the text "${targetText}" in a professional book font style. 
    IMPORTANT: Place the text in the LOWER CENTER of the frame, leaving at least 15% margin from all edges to ensure it stays within print safe zones. 
    Place it on a SOLID PURE WHITE BACKGROUND. No other elements.`;
    const textRaw = await restyleIllustration(undefined, textPrompt, undefined, undefined, [], [], true, false, false, masterBible, targetResolution, projectContext, aspectRatio);
    textLayer = await removeWhiteBackground(textRaw);
  }

  const layers: any[] = [
    { id: 'bg-' + Math.random(), name: 'Background', image: bgImage, isVisible: true, type: 'background' },
    { id: 'props-' + Math.random(), name: 'Foreground Props', image: propsImage, isVisible: true, type: 'foreground' },
    { id: 'char-' + Math.random(), name: 'Characters', image: charImage, isVisible: true, type: 'character' }
  ];

  if (textLayer) {
    layers.push({ id: 'text-' + Math.random(), name: 'Text', image: textLayer, isVisible: true, type: 'text' });
  }

  // Create a composite for the main preview
  const composite = await new Promise<string>((resolve) => {
    const canvas = document.createElement('canvas');
    const [wStr, hStr] = aspectRatio.split(':');
    const w = parseInt(wStr);
    const h = parseInt(hStr);
    canvas.width = 1024 * (w/h);
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    
    let loaded = 0;
    const imgs = layers.map(l => {
      const img = new Image();
      img.onload = () => {
        loaded++;
        if (loaded === layers.length) {
          // Draw in order: BG -> Props -> Chars -> Text
          const order = ['background', 'foreground', 'character', 'text'];
          order.forEach(type => {
            const layer = layers.find(l => l.type === type);
            if (layer && layer.isVisible) {
              const idx = layers.indexOf(layer);
              ctx.drawImage(imgs[idx], 0, 0, canvas.width, canvas.height);
            }
          });
          resolve(canvas.toDataURL('image/png'));
        }
      };
      img.src = l.image;
      return img;
    });
  });

  return { layers, composite };
};

/**
 * Generates a multi-layered book cover.
 */
export const generateLayeredCover = async (
  context: string,
  characters: CharacterRef[],
  stylePrompt: string,
  masterBible: string = "",
  targetResolution: '1K' | '2K' | '4K' = '1K',
  title?: string,
  aspectRatio: "1:1" | "4:3" | "16:9" | "9:16" = "9:16"
): Promise<{layers: any[], composite: string}> => {
  console.log("Starting precision layered cover generation...");
  
  // 1. BACKGROUND LAYER
  const bgPrompt = `BOOK COVER BACKGROUND ONLY: ${context}. Style: ${stylePrompt}. ABSOLUTELY NO CHARACTERS, NO PEOPLE, NO ANIMALS, AND NO TEXT. Just the environment and atmosphere.`;
  const bgImage = await restyleIllustration(undefined, bgPrompt, undefined, undefined, [], [], true, false, false, masterBible, targetResolution, "", aspectRatio);

  // 2. CHARACTER LAYER
  const charPrompt = `BOOK COVER CHARACTER LAYER: ${context}. Style: ${stylePrompt}. Render the characters ONLY. ABSOLUTELY NO BACKGROUND, NO ENVIRONMENT, AND NO TEXT. Place them on a SOLID PURE WHITE BACKGROUND.`;
  const charRaw = await restyleIllustration(undefined, charPrompt, undefined, undefined, characters, [], true, false, false, masterBible, targetResolution, "", aspectRatio);
  const charImage = await removeWhiteBackground(charRaw);

  // 3. TEXT LAYER (If applicable)
  let textLayer = null;
  if (title) {
    const textPrompt = `BOOK COVER TITLE LAYER: Render the title "${title}" in a bold, cinematic book cover font style. 
    IMPORTANT: Place the title in the UPPER THIRD of the frame, leaving at least 15% margin from all edges. 
    Place it on a SOLID PURE WHITE BACKGROUND. No other elements.`;
    const textRaw = await restyleIllustration(undefined, textPrompt, undefined, undefined, [], [], true, false, false, masterBible, targetResolution, "", aspectRatio);
    textLayer = await removeWhiteBackground(textRaw);
  }

  const layers: any[] = [
    { id: 'bg-' + Math.random(), name: 'Background', image: bgImage, isVisible: true, type: 'background' },
    { id: 'char-' + Math.random(), name: 'Characters', image: charImage, isVisible: true, type: 'character' }
  ];

  if (textLayer) {
    layers.push({ id: 'text-' + Math.random(), name: 'Title', image: textLayer, isVisible: true, type: 'text' });
  }

  // Create a composite
  const composite = await new Promise<string>((resolve) => {
    const canvas = document.createElement('canvas');
    const [w, h] = aspectRatio.split(':').map(Number);
    const ratio = w / h;
    canvas.width = 1024 * ratio;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    
    let loaded = 0;
    const imgs = layers.map(l => {
      const img = new Image();
      img.onload = () => {
        loaded++;
        if (loaded === layers.length) {
          const order = ['background', 'character', 'text'];
          order.forEach(type => {
            const layer = layers.find(l => l.type === type);
            if (layer && layer.isVisible) {
              const idx = layers.indexOf(layer);
              ctx.drawImage(imgs[idx], 0, 0, canvas.width, canvas.height);
            }
          });
          resolve(canvas.toDataURL('image/png'));
        }
      };
      img.src = l.image;
      return img;
    });
  });

  return { layers, composite };
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
    return `Character at Source Hotspot ${sh.label} (x:${Math.round(sh.x)}%, y:${Math.round(sh.y)}%) should be mapped to Target Hotspot ${th.label} (x:${Math.round(th.x)}%, y:${Math.round(th.y)}%).`;
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
    { inlineData: { data: targetData, mimeType: 'image/png' } },
    { text: instruction },
    { text: "--- SOURCE REFERENCE IMAGE ---" },
    { inlineData: { data: sourceData, mimeType: 'image/png' } }
  ];

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
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
