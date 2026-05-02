
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { CharacterRef, CharacterAssignment, ExportFormat, PRINT_FORMATS } from "./types";
import { calculateCoverWithBleed } from "./kdpConfig";

export const getBestAspectRatio = (
  format?: ExportFormat, 
  isSpread: boolean = false, 
  estimatedPageCount: number = 24,
  fallbackRatio: string = "16:9"
): "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "1:4" | "1:8" | "4:1" | "8:1" => {
  if (!format || !PRINT_FORMATS[format]) {
    const supported = ["1:1", "3:4", "4:3", "9:16", "16:9", "1:4", "1:8", "4:1", "8:1"];
    return supported.includes(fallbackRatio) ? (fallbackRatio as any) : "16:9";
  }
  
  const config = PRINT_FORMATS[format];
  let width = config.width;
  let height = config.height;
  
  if (isSpread) {
    const coverDims = calculateCoverWithBleed(config.width, config.height, estimatedPageCount);
    width = coverDims.width;
    height = coverDims.height;
  } else {
    width = config.width + config.bleed;
    height = config.height + (config.bleed * 2);
  }
  
  const targetRatio = width / height;
  
  const ratios = [
    { str: "1:1", val: 1 },
    { str: "3:4", val: 0.75 },
    { str: "4:3", val: 1.333 },
    { str: "9:16", val: 0.5625 },
    { str: "16:9", val: 1.777 },
    { str: "1:4", val: 0.25 },
    { str: "1:8", val: 0.125 },
    { str: "4:1", val: 4 },
    { str: "8:1", val: 8 }
  ];
  
  let best = ratios[0];
  let minDiff = Math.abs(targetRatio - best.val);
  
  for (const r of ratios) {
    const diff = Math.abs(targetRatio - r.val);
    if (diff < minDiff) {
      minDiff = diff;
      best = r;
    }
  }
  
  return best.str as any;
}

/**
 * Parses a raw script text into a structured prompt pack.
 */
export const parsePromptPack = async (rawText: string): Promise<{ 
  masterBible: string, 
  characterIdentities: { name: string, description: string }[],
  scenes: { prompt: string, isSpread: boolean }[] 
}> => {
  const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY || process.env.GEMINI_API_KEY) as string });
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze the provided script to extract structural production data.
    
    1. EXTRACT MASTER BIBLE: Look for style lock instructions.
    2. EXTRACT CHARACTER IDENTITIES: Find consistent characters and descriptions.
    3. EXTRACT SCENES: Find scene descriptions. CRITICAL: Strip out any mention of bleeds, margins, crop marks, or print layout dimensions from the scene descriptions.
    
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
  spreads: { title: string, fullPrompt: string, pageText?: string }[] 
}> => {
  const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY || process.env.GEMINI_API_KEY) as string });
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Break down this Activity Master Prompt into individual spreads.
    Extract the "GLOBAL" section separately.
    For each "SPREAD X" or "ACTIVITY PAGE X":
    1. Extract the specific visual scene/logic requirements into 'fullPrompt'. CRITICAL: Strip out any mention of bleeds, margins, crop marks, or print layout dimensions from the fullPrompt. ALSO CRITICAL: Strip out any specific text that is meant to be written on the page (e.g. "TEXT ON PAGE", "TEXT", "Top:", "Bottom:"). The image generator should NOT draw text.
    2. Extract the exact text that is meant to be written on the page into 'pageText'. This includes titles, vocabulary words, instructions, etc.
    3. Provide a short descriptive 'title'.

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
                fullPrompt: { type: Type.STRING },
                pageText: { type: Type.STRING }
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
  targetAspectRatio: "1:1" | "4:3" | "16:9" | "9:16" = "9:16",
  exportFormat?: ExportFormat,
  estimatedPageCount?: number,
  styleRefBase64?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY || process.env.GEMINI_API_KEY) as string });
  
  let formatRules = "";
  if (exportFormat && estimatedPageCount && PRINT_FORMATS[exportFormat]) {
    const config = PRINT_FORMATS[exportFormat];
    const coverDims = calculateCoverWithBleed(config.width, config.height, estimatedPageCount);
    formatRules = `
  TARGET PRINT FORMAT: ${config.name} (${estimatedPageCount} pages)
  - Exact Target Dimensions (including bleed and spine): ${coverDims.width.toFixed(3)}" wide x ${coverDims.height.toFixed(3)}" high.
  - Spine Width: ${coverDims.spine.toFixed(3)}".
  - Bleed Zone: The outer 0.125" will be trimmed off. Extend background art to the edges but keep critical details out.
  - Safe Margins: Keep all critical details at least 0.5" away from the edges.
  - CRITICAL: DO NOT draw visible bleed lines, margin lines, crop marks, or text describing the layout on the generated image. The layout instructions are for composition only.`;
  }

  const instruction = `INDUSTRIAL BOOK COVER DESIGN TASK:
  
  PROJECT BRIEF:
  ${projectContext}
  
  ARTISTIC STYLE:
  ${stylePrompt}
  
  MASTER BIBLE / GLOBAL RULES:
  ${masterBible}
  
  LAYOUT RULES FOR KDP COVER: ${formatRules}
  - SPINE SAFETY ZONE: This is a full wrap cover. The EXACT VERTICAL CENTER is the spine of the physical book.
  - CRITICAL: DO NOT place any faces, characters, or important details in the dead center (spine). Keep the main cover art focused on the right half (front cover) and left half (back cover).

  RULES:
  1. Generate a SINGLE professional book cover illustration.
  2. NO TITLE TEXT. NO LOGOS. Pure illustration only.
  3. Include the consistent characters provided in the reference images.
  4. Use a cinematic, high-end children's book layout.
  5. Composition: Must feel like a series "Master Cover" that makes people eager to buy.`;

  const parts: any[] = [{ text: instruction }];
  
  if (styleRefBase64) {
    const data = styleRefBase64.includes(',') ? styleRefBase64.split(',')[1] : styleRefBase64;
    parts.push({ text: "--- STRICT STYLE REFERENCE --- \nCRITICAL: You MUST exactly match the illustration style, brush strokes, medium, and color palette of this reference image." });
    parts.push({ inlineData: { data, mimeType: 'image/png' } });
  }

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
    config: { imageConfig: { aspectRatio: getBestAspectRatio(exportFormat, true, estimatedPageCount, targetAspectRatio), imageSize: targetResolution } }
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
  const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY || process.env.GEMINI_API_KEY) as string });
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
  aspectRatio: "1:1" | "4:3" | "16:9" | "9:16" = "4:3",
  exportFormat?: ExportFormat,
  estimatedPageCount?: number
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY || process.env.GEMINI_API_KEY) as string });
  const model = usePro ? 'gemini-3.1-flash-image-preview' : 'gemini-3.1-flash-image-preview';
  
  let formatRules = "";
  if (exportFormat && PRINT_FORMATS[exportFormat]) {
    const config = PRINT_FORMATS[exportFormat];
    const bleed = config.bleed;
    const safe = config.outside;
    const width = isSpread ? (config.width * 2) + (bleed * 2) : config.width + bleed;
    const height = config.height + (bleed * 2);
    formatRules = `
  TARGET PRINT FORMAT: ${config.name}
  - Exact Target Dimensions (including bleed): ${width.toFixed(3)}" wide x ${height.toFixed(3)}" high.
  - Bleed Zone: The outer ${bleed}" will be trimmed off. Extend background art to the very edge, but keep critical details out.
  - Safe Margins: Keep all text and critical details at least ${safe}" away from the top, bottom, and outer edges.
  - CRITICAL: DO NOT draw visible bleed lines, margin lines, crop marks, or text describing the layout on the generated image. The layout instructions are for composition only.`;
  }

  const layoutRules = isSpread ? `
  LAYOUT RULES FOR KDP 2-PAGE SPREAD: ${formatRules}
  - This is a WIDE SPREAD that will be folded in the middle (GUTTER).
  - GUTTER SAFETY: Do NOT place any critical elements, faces, or TEXT in the vertical center of the image (the fold). Leave a safe zone of at least 0.375" (approx 5%) around the center fold.
  - BALANCE: Ensure the composition works as two distinct halves while remaining a cohesive single image.
  - CRITICAL: DO NOT draw a literal fold line, shadow, crease, or book binding in the middle of the image. The image MUST be a perfectly flat, continuous, seamless piece of art.` : `
  LAYOUT RULES FOR KDP SINGLE PAGE: ${formatRules}
  - GUTTER: The side that binds to the spine needs extra margin. Keep critical elements away from the binding edge.`;

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

  if (styleRefBase64) {
    const data = styleRefBase64.includes(',') ? styleRefBase64.split(',')[1] : styleRefBase64;
    parts.push({ text: "--- STRICT STYLE REFERENCE --- \nCRITICAL: You MUST exactly match the illustration style, brush strokes, medium, and color palette of this reference image." });
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
    config: { imageConfig: { aspectRatio: getBestAspectRatio(exportFormat, isSpread, estimatedPageCount, aspectRatio), ...(usePro ? { imageSize } : {}) } }
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
  targetText?: string,
  exportFormat?: ExportFormat,
  estimatedPageCount?: number,
  styleRefBase64?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY || process.env.GEMINI_API_KEY) as string });
  const targetData = targetImageBase64.includes(',') ? targetImageBase64.split(',')[1] : targetImageBase64;
  
  let formatRules = "";
  if (exportFormat && PRINT_FORMATS[exportFormat]) {
    const config = PRINT_FORMATS[exportFormat];
    const bleed = config.bleed;
    const safe = config.outside;
    const width = isSpread ? (config.width * 2) + (bleed * 2) : config.width + bleed;
    const height = config.height + (bleed * 2);
    formatRules = `
  TARGET PRINT FORMAT: ${config.name}
  - Exact Target Dimensions (including bleed): ${width.toFixed(3)}" wide x ${height.toFixed(3)}" high.
  - Bleed Zone: The outer ${bleed}" will be trimmed off. Extend background art to the very edge, but keep critical details out.
  - Safe Margins: Keep all text and critical details at least ${safe}" away from the top, bottom, and outer edges.
  - CRITICAL: DO NOT draw visible bleed lines, margin lines, crop marks, or text describing the layout on the generated image. The layout instructions are for composition only.`;
  }

  const layoutRules = isSpread ? `
  LAYOUT RULES FOR 2-PAGE SPREAD: ${formatRules}
  - This is a WIDE SPREAD that will be folded in the middle (GUTTER).
  - GUTTER SAFETY: Do NOT place any critical elements, faces, or TEXT in the vertical center of the image (the fold).
  - SAFE MARGINS: Keep all text and critical details at least 10% away from the top, bottom, and outer edges.
  - CRITICAL: DO NOT draw a literal fold line, shadow, crease, or book binding in the middle of the image. The image MUST be a perfectly flat, continuous, seamless piece of art.` : `
  LAYOUT RULES FOR SINGLE PAGE: ${formatRules}`;

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
    { text: instruction }
  ];

  if (styleRefBase64) {
    const data = styleRefBase64.includes(',') ? styleRefBase64.split(',')[1] : styleRefBase64;
    parts.push({ text: "--- STRICT STYLE REFERENCE --- \nCRITICAL: You MUST exactly match the illustration style, brush strokes, medium, and color palette of this reference image." });
    parts.push({ inlineData: { data, mimeType: 'image/png' } });
  }

  parts.push({ text: "--- TARGET IMAGE TO BE FIXED ---" });
  parts.push({ inlineData: { data: targetData, mimeType: 'image/png' } });

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
    config: { imageConfig: { aspectRatio: getBestAspectRatio(exportFormat, isSpread, estimatedPageCount, aspectRatio), imageSize } }
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
  const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY || process.env.GEMINI_API_KEY) as string });
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
  const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY || process.env.GEMINI_API_KEY) as string });
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Translate to ${targetLanguage}: "${text}"`,
  });
  return response.text?.trim() || text;
};

export const analyzeStyleFromImage = async (imageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY || process.env.GEMINI_API_KEY) as string });
  const data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [{ inlineData: { data, mimeType: 'image/png' } }, { text: "Analyze the illustration style of this image in detail." }] }
  });
  return response.text?.trim() || "";
};

export const planStoryScenes = async (fullScript: string, characters: CharacterRef[], enableActivityDesigner: boolean = false): Promise<{
  globalInstructions?: string,
  characterIdentities?: { name: string, description: string }[],
  pages: {text: string, isSpread: boolean, mappedCharacterNames: string[], fullPrompt?: string, pageText?: string}[]
}> => {
  const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY || process.env.GEMINI_API_KEY) as string });
  const prompt = enableActivityDesigner 
    ? `Break this script into distinct pages/spreads. The script may contain both narrative story scenes and design activities (like flashcards, coloring pages, etc.). 
    Extract any "GLOBAL" style or layout instructions into 'globalInstructions'. 
    Extract all distinct characters and their descriptions into 'characterIdentities'.
    For each page or spread:
    - Provide a visual description in 'text'. CRITICAL: Strip out any mention of bleeds, margins, crop marks, or print layout dimensions from the visual description. ALSO CRITICAL: Strip out any specific text that is meant to be written on the page. The image generator should NOT draw text.
    - Extract the exact text that is meant to be written on the page into 'pageText'. This includes titles, vocabulary words, dialogue, etc.
    - Set 'isSpread' to true if it spans 2 pages, false if 1 page.
    - List character names present in 'mappedCharacterNames'.
    - If it's an activity or requires specific layout logic, provide a 'fullPrompt' with the detailed layout and style instructions. CRITICAL: Strip out any mention of bleeds, margins, crop marks, or print layout dimensions from the fullPrompt. ALSO CRITICAL: Strip out any specific text that is meant to be written on the page.
    Script: ${fullScript}`
    : `Break this script into distinct pages/spreads. 
    Extract all distinct characters and their descriptions into 'characterIdentities'. 
    For each page, provide a visual description (text), whether it's a 2-page spread (isSpread), and an array of character names present (mappedCharacterNames). 
    CRITICAL: Strip out any mention of bleeds, margins, crop marks, or print layout dimensions from the visual description. The visual description should ONLY describe what is happening in the scene. ALSO CRITICAL: Strip out any specific text that is meant to be written on the page.
    Extract the exact text that is meant to be written on the page into 'pageText'.
    Script: ${fullScript}`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          globalInstructions: { type: Type.STRING },
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
          pages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                isSpread: { type: Type.BOOLEAN },
                mappedCharacterNames: { type: Type.ARRAY, items: { type: Type.STRING } },
                fullPrompt: { type: Type.STRING },
                pageText: { type: Type.STRING }
              },
              required: ['text', 'isSpread', 'mappedCharacterNames']
            }
          }
        },
        required: ['characterIdentities', 'pages']
      }
    }
  });
  const jsonStr = response.text || '{"pages":[]}';
  try { return JSON.parse(jsonStr); } catch (e) { return { pages: [] }; }
};

export const extractTextFromImage = async (imageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY || process.env.GEMINI_API_KEY) as string });
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
  targetText?: string,
  exportFormat?: ExportFormat,
  estimatedPageCount?: number
): Promise<{layers: any[], composite: string}> => {
  console.log("Starting layer separation...");
  
  // 1. BACKGROUND LAYER
  const bgPrompt = `LAYER SEPARATION: Extract the BACKGROUND ONLY from the provided image. Remove all characters, text bubbles, and text. Fill in the missing background details seamlessly. ${refinementPrompt}`;
  const bgImage = await refineIllustration(targetImageBase64, bgPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, [], aspectRatio, undefined, exportFormat, estimatedPageCount);

  // 2. CHARACTER LAYER
  const charPrompt = `LAYER SEPARATION: Extract the CHARACTERS ONLY from the provided image. Remove the background, text bubbles, and text. Place the characters on a SOLID PURE WHITE BACKGROUND. ${refinementPrompt}`;
  const charRaw = await refineIllustration(targetImageBase64, charPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, charRefs, aspectRatio, undefined, exportFormat, estimatedPageCount);
  const charImage = await removeWhiteBackground(charRaw);

  // 3. TEXT BUBBLE LAYER
  const bubblePrompt = `LAYER SEPARATION: Extract the TEXT BUBBLES or SPEECH BALLOONS ONLY from the provided image. Remove the background, characters, and the text inside the bubbles (leave the bubbles blank). Place the empty bubbles on a SOLID PURE WHITE BACKGROUND. ${refinementPrompt}`;
  const bubbleRaw = await refineIllustration(targetImageBase64, bubblePrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, [], aspectRatio, undefined, exportFormat, estimatedPageCount);
  const bubbleImage = await removeWhiteBackground(bubbleRaw);

  // 4. TEXT LAYER
  const textPrompt = `LAYER SEPARATION: Extract the TEXT ONLY from the provided image. Remove the background, characters, and text bubbles. Place the text on a SOLID PURE WHITE BACKGROUND. ${refinementPrompt}`;
  const textRaw = await refineIllustration(targetImageBase64, textPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, [], aspectRatio, undefined, exportFormat, estimatedPageCount);
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
    const [w, h] = getBestAspectRatio(exportFormat, isSpread, estimatedPageCount, aspectRatio).split(':').map(Number);
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
  targetText?: string,
  exportFormat?: ExportFormat,
  estimatedPageCount?: number
): Promise<{layers: any[], composite: string}> => {
  console.log("Starting precision layered refinement...");
  
  // 1. BACKGROUND LAYER REFINEMENT
  const bgPrompt = `ENVIRONMENT/BACKGROUND FIX: ${refinementPrompt}. ABSOLUTELY NO CHARACTERS, NO PEOPLE, NO ANIMALS, AND NO FOREGROUND PROPS. Just the empty scene environment.`;
  const bgImage = await refineIllustration(targetImageBase64, bgPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, [], aspectRatio, undefined, exportFormat, estimatedPageCount);

  // 2. CHARACTER LAYER REFINEMENT
  const charPrompt = `CHARACTER LAYER FIX: ${refinementPrompt}. Render the characters ONLY. ABSOLUTELY NO BACKGROUND, NO ENVIRONMENT, AND NO PROPS OR OBJECTS. Place them on a SOLID PURE WHITE BACKGROUND.`;
  const charRaw = await refineIllustration(targetImageBase64, charPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, charRefs, aspectRatio, undefined, exportFormat, estimatedPageCount);
  const charImage = await removeWhiteBackground(charRaw);

  // 3. FOREGROUND PROPS LAYER REFINEMENT
  const propsPrompt = `FOREGROUND PROPS FIX: ${refinementPrompt}. Render only the interactive objects, toys, or foreground elements. ABSOLUTELY NO CHARACTERS AND NO BACKGROUND. Place them on a SOLID PURE WHITE BACKGROUND.`;
  const propsRaw = await refineIllustration(targetImageBase64, propsPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, [], aspectRatio, undefined, exportFormat, estimatedPageCount);
  const propsImage = await removeWhiteBackground(propsRaw);

  // 4. TEXT LAYER (If applicable)
  let textLayer = null;
  if (targetText) {
    const textPrompt = `TEXT LAYER FIX: Render/Update the text "${targetText}" in a professional book font style. 
    IMPORTANT: Place the text in the LOWER CENTER of the frame, leaving at least 15% margin from all edges to ensure it stays within print safe zones. 
    Place it on a SOLID PURE WHITE BACKGROUND. No other elements.`;
    const textRaw = await refineIllustration(targetImageBase64, textPrompt, referenceImages, isSpread, imageSize, masterBible, projectContext, [], aspectRatio, undefined, exportFormat, estimatedPageCount);
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
    const [wStr, hStr] = getBestAspectRatio(exportFormat, isSpread, estimatedPageCount, aspectRatio).split(':');
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
  targetText?: string,
  isSpread: boolean = false,
  exportFormat?: ExportFormat,
  estimatedPageCount?: number,
  styleRefBase64?: string
): Promise<{layers: any[], composite: string}> => {
  console.log("Starting precision layered generation...");
  
  let formatRules = "";
  if (exportFormat && PRINT_FORMATS[exportFormat]) {
    const config = PRINT_FORMATS[exportFormat];
    const bleed = config.bleed;
    const safe = config.outside;
    const width = isSpread ? (config.width * 2) + (bleed * 2) : config.width + bleed;
    const height = config.height + (bleed * 2);
    formatRules = `
  TARGET PRINT FORMAT: ${config.name}
  - Exact Target Dimensions (including bleed): ${width.toFixed(3)}" wide x ${height.toFixed(3)}" high.
  - Bleed Zone: The outer ${bleed}" will be trimmed off. Extend background art to the very edge, but keep critical details out.
  - Safe Margins: Keep all text and critical details at least ${safe}" away from the top, bottom, and outer edges.
  - CRITICAL: DO NOT draw visible bleed lines, margin lines, crop marks, or text describing the layout on the generated image. The layout instructions are for composition only.`;
  }

  const layoutRules = isSpread ? `
  LAYOUT RULES FOR KDP 2-PAGE SPREAD: ${formatRules}
  - GUTTER SAFETY: Do NOT place any critical elements, faces, or TEXT in the vertical center of the image (the fold). Leave a safe zone of at least 0.375" around the center fold.
  - CRITICAL: DO NOT draw a literal fold line, shadow, crease, or book binding in the middle of the image. The image MUST be a perfectly flat, continuous, seamless piece of art.` : `
  LAYOUT RULES FOR KDP SINGLE PAGE: ${formatRules}`;

  // 1. BACKGROUND LAYER
  const bgPrompt = `ENVIRONMENT/BACKGROUND ONLY: ${stylePrompt}. ABSOLUTELY NO CHARACTERS, NO PEOPLE, NO ANIMALS, AND NO FOREGROUND PROPS. Just the empty scene environment. ${layoutRules}`;
  const bgImage = await restyleIllustration(undefined, bgPrompt, styleRefBase64, undefined, [], [], true, false, isSpread, masterBible, targetResolution, projectContext, aspectRatio, exportFormat, estimatedPageCount);

  // 2. CHARACTER LAYER
  const charPrompt = `CHARACTER LAYER ONLY: ${stylePrompt}. Render the characters ONLY. ABSOLUTELY NO BACKGROUND, NO ENVIRONMENT, AND NO PROPS OR OBJECTS. Place them on a SOLID PURE WHITE BACKGROUND. ${layoutRules}`;
  const charRaw = await restyleIllustration(undefined, charPrompt, styleRefBase64, undefined, charRefs, [], true, false, isSpread, masterBible, targetResolution, projectContext, aspectRatio, exportFormat, estimatedPageCount);
  const charImage = await removeWhiteBackground(charRaw);

  // 3. FOREGROUND PROPS LAYER
  const propsPrompt = `FOREGROUND PROPS AND ELEMENTS ONLY: ${stylePrompt}. Render only the interactive objects, toys, or foreground elements mentioned in the scene. ABSOLUTELY NO CHARACTERS AND NO BACKGROUND. Place them on a SOLID PURE WHITE BACKGROUND. ${layoutRules}`;
  const propsRaw = await restyleIllustration(undefined, propsPrompt, styleRefBase64, undefined, [], [], true, false, isSpread, masterBible, targetResolution, projectContext, aspectRatio, exportFormat, estimatedPageCount);
  const propsImage = await removeWhiteBackground(propsRaw);

  // 4. TEXT LAYER (If applicable)
  let textLayer = null;
  if (targetText) {
    const textPrompt = `TEXT LAYER: Render the text "${targetText}" in a professional book font style. 
    IMPORTANT: Place the text in the LOWER CENTER of the frame, leaving at least 15% margin from all edges to ensure it stays within print safe zones. 
    Place it on a SOLID PURE WHITE BACKGROUND. No other elements. ${layoutRules}`;
    const textRaw = await restyleIllustration(undefined, textPrompt, styleRefBase64, undefined, [], [], true, false, false, masterBible, targetResolution, projectContext, aspectRatio, exportFormat, estimatedPageCount);
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
    const [wStr, hStr] = getBestAspectRatio(exportFormat, isSpread, estimatedPageCount, aspectRatio).split(':');
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
  aspectRatio: "1:1" | "4:3" | "16:9" | "9:16" = "9:16",
  exportFormat?: ExportFormat,
  estimatedPageCount?: number,
  styleRefBase64?: string
): Promise<{layers: any[], composite: string}> => {
  console.log("Starting precision layered cover generation...");
  
  let formatRules = "";
  if (exportFormat && estimatedPageCount && PRINT_FORMATS[exportFormat]) {
    const config = PRINT_FORMATS[exportFormat];
    const coverDims = calculateCoverWithBleed(config.width, config.height, estimatedPageCount);
    formatRules = `
  TARGET PRINT FORMAT: ${config.name} (${estimatedPageCount} pages)
  - Exact Target Dimensions (including bleed and spine): ${coverDims.width.toFixed(3)}" wide x ${coverDims.height.toFixed(3)}" high.
  - Spine Width: ${coverDims.spine.toFixed(3)}".
  - Bleed Zone: The outer 0.125" will be trimmed off. Extend background art to the edges but keep critical details out.
  - Safe Margins: Keep all critical details at least 0.5" away from the edges.
  - CRITICAL: DO NOT draw visible bleed lines, margin lines, crop marks, or text describing the layout on the generated image. The layout instructions are for composition only.`;
  }

  const coverRules = `
  LAYOUT RULES FOR KDP COVER: ${formatRules}
  - SPINE SAFETY ZONE: This is a full wrap cover. The EXACT VERTICAL CENTER is the spine of the book.
  - CRITICAL: DO NOT place any faces, characters, or important details in the dead center (spine). Keep the main cover art on the Right side (front cover) and Left side (back cover).
  `;

  // 1. BACKGROUND LAYER
  const bgPrompt = `BOOK COVER BACKGROUND ONLY: ${context}. Style: ${stylePrompt}. ABSOLUTELY NO CHARACTERS, NO PEOPLE, NO ANIMALS, AND NO TEXT. Just the environment and atmosphere. ${coverRules}`;
  const bgImage = await restyleIllustration(undefined, bgPrompt, styleRefBase64, undefined, [], [], true, false, false, masterBible, targetResolution, "", aspectRatio, exportFormat, estimatedPageCount);

  // 2. CHARACTER LAYER
  const charPrompt = `BOOK COVER CHARACTER LAYER: ${context}. Style: ${stylePrompt}. Render the characters ONLY. ABSOLUTELY NO BACKGROUND, NO ENVIRONMENT, AND NO TEXT. Place them on a SOLID PURE WHITE BACKGROUND. ${coverRules}`;
  const charRaw = await restyleIllustration(undefined, charPrompt, styleRefBase64, undefined, characters, [], true, false, false, masterBible, targetResolution, "", aspectRatio, exportFormat, estimatedPageCount);
  const charImage = await removeWhiteBackground(charRaw);

  // 3. TEXT LAYER (If applicable)
  let textLayer = null;
  if (title) {
    const textPrompt = `BOOK COVER TITLE LAYER: Render the title "${title}" in a bold, cinematic book cover font style. 
    IMPORTANT: Place the title in the UPPER THIRD of the frame, leaving at least 15% margin from all edges (SAFE MARGINS). 
    Place it on a SOLID PURE WHITE BACKGROUND. No other elements. ${coverRules}`;
    const textRaw = await restyleIllustration(undefined, textPrompt, styleRefBase64, undefined, [], [], true, false, false, masterBible, targetResolution, "", aspectRatio, exportFormat, estimatedPageCount);
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
    const [w, h] = getBestAspectRatio(exportFormat, true, estimatedPageCount, aspectRatio).split(':').map(Number);
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
  const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY || process.env.GEMINI_API_KEY) as string });
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
