import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { CharacterRef, CharacterAssignment } from "./types";

export const parsePromptPack = async (rawText: string): Promise<{ masterBible: string, scenes: { prompt: string, isSpread: boolean }[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze this children's book production script. 
    1. Extract the "Master Bible" (Global Style, Character Descriptions, Format rules).
    2. Split the rest into individual scenes. 
    3. For each scene, extract the specific visual prompt and determine if it should be a "spread" (ultra-wide, 2:1, panoramic) based on descriptions like "Wide", "Ultra-wide", or "Spread".
    
    Script:
    ${rawText}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          masterBible: { type: Type.STRING },
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
        required: ['masterBible', 'scenes']
      }
    }
  });
  
  try {
    return JSON.parse(response.text || '{"masterBible":"", "scenes":[]}');
  } catch (e) {
    return { masterBible: "", scenes: [] };
  }
};

export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  if (targetLanguage === 'NONE_CLEAN_BG' || targetLanguage === 'English') return text;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Translate this children's book text into ${targetLanguage}. 
    Maintain a whimsical, rhythmic, and professional tone.
    Text: "${text}"`,
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
        { text: "Analyze the art style of this image. Provide a concise, high-quality description suitable for an image generation prompt. Focus on technique, color, and texture. Output ONLY the description." }
      ]
    }
  });
  return response.text?.trim() || "";
};

export const planStoryScenes = async (fullScript: string, characters: CharacterRef[]): Promise<{pages: {text: string, isSpread: boolean, mappedCharacterNames: string[]}[]}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const charList = characters.map(c => c.name).join(", ");
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Break this script into distinct pages or panoramic spreads. For each scene, determine which characters are present: [${charList}]. Output as JSON. Script: ${fullScript}`,
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
        },
        required: ['pages']
      }
    }
  });
  try { return JSON.parse(response.text || '{"pages":[]}'); } catch (e) { return { pages: [] }; }
};

export const identifyAndDesignCharacters = async (fullScript: string, stylePrompt: string, styleRef?: string): Promise<CharacterRef[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const identification = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Identify the main characters. Script: ${fullScript}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          characters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { name: { type: Type.STRING }, description: { type: Type.STRING } },
              required: ['name', 'description']
            }
          }
        }
      }
    }
  });

  const charData = JSON.parse(identification.text || '{"characters":[]}').characters;
  const results: CharacterRef[] = [];
  for (const char of charData) {
    const parts: any[] = [
      { text: `Character sheet for: ${char.name}. Description: ${char.description}. Style: ${stylePrompt}. White background, multiple angles.` }
    ];
    if (styleRef) { parts.push({ inlineData: { data: styleRef.split(',')[1], mimeType: 'image/png' } }); }

    const imgResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts },
      config: { imageConfig: { aspectRatio: '1:1', imageSize: '1K' } }
    });

    let base64 = "";
    if (imgResponse.candidates?.[0]?.content?.parts) {
      for (const part of imgResponse.candidates[0].content.parts) {
        if (part.inlineData) { base64 = `data:image/png;base64,${part.inlineData.data}`; break; }
      }
    }
    results.push({ id: Math.random().toString(36).substring(7), name: char.name, description: char.description, image: base64 });
  }
  return results;
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

  if (originalImageBase64) {
    parts.push({ inlineData: { data: originalImageBase64.split(',')[1], mimeType: 'image/png' } });
  }

  let instruction = `You are a master industrial illustrator. 
  ${masterBible ? `GLOBAL DIRECTION (THE BIBLE):\n${masterBible}\n\n` : ""}
  TASK: ${originalImageBase64 ? "RE-STYLE the existing scene." : "CREATE a brand new illustration from the prompt below."}
  SCENE LAYOUT: ${isSpread ? "2-page ultra-wide panoramic spread. Ensure characters are at outer thirds." : "Single page."}
  
  SCENE PROMPT:
  ${stylePrompt}
  
  ${styleRefBase64 ? "VISUAL ANCHOR: Follow the attached Style Reference exactly." : ""}
  
  CHARACTERS:
  ${assignments.length > 0 ? 
    `Character mapping:
    ${assignments.map(a => {
      const ref = charRefs.find(r => r.id === a.refId);
      return `- ${ref?.name} as ${a.description}.`;
    }).join('\n')}` : ""}
  
  TEXT: ${cleanBackground ? "No text." : (targetText ? `Embed: "${targetText}".` : "No text.")}`;

  if (styleRefBase64) { parts.push({ inlineData: { data: styleRefBase64.split(',')[1], mimeType: 'image/png' } }); }
  charRefs.forEach((ref) => {
    if (assignments.some(a => a.refId === ref.id)) {
      parts.push({ inlineData: { data: ref.image.split(',')[1], mimeType: 'image/png' } });
    }
  });

  parts.push({ text: instruction });

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: { imageConfig: { aspectRatio: isSpread ? "16:9" : "1:1", imageSize: "1K" } }
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
    { text: `UPSCALE 4K: High-resolution master print quality. Retain all details. Context: ${stylePrompt}` }
  ];
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: { imageConfig: { aspectRatio: isSpread ? "16:9" : "1:1", imageSize: "4K" } }
  });
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Upscale failed.");
};

export const extractTextFromImage = async (imageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } },
        { text: "Extract text from this book page. Return only text." }
      ]
    },
  });
  return response.text?.trim() || "";
};