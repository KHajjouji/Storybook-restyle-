import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { CharacterRef, CharacterAssignment } from "./types";

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
        {
          inlineData: {
            data: imageBase64.split(',')[1],
            mimeType: 'image/png'
          }
        },
        {
          text: "Analyze the art style of this image. Provide a concise, high-quality description suitable for an image generation prompt. Focus on: 1. Artistic technique (e.g., watercolor, 3D render, digital oil), 2. Color palette and lighting, 3. Texture and brushwork. Output ONLY the descriptive prompt text."
        }
      ]
    }
  });
  return response.text?.trim() || "";
};

export const planStoryScenes = async (fullScript: string): Promise<{pages: {text: string, isSpread: boolean}[]}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Break this children's book script into distinct pages or panoramic spreads. 
    A typical book is 24-32 pages. 
    Output as JSON.
    Script: ${fullScript}`,
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
                isSpread: { type: Type.BOOLEAN, description: 'True if this scene should be a panoramic 2-page spread' }
              },
              required: ['text', 'isSpread']
            }
          }
        },
        required: ['pages']
      }
    }
  });
  
  try {
    return JSON.parse(response.text || '{"pages":[]}');
  } catch (e) {
    console.error("Failed to parse scene plan", e);
    return { pages: [] };
  }
};

export const identifyAndDesignCharacters = async (fullScript: string): Promise<CharacterRef[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // First, identify characters
  const identification = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Identify the main recurring characters in this script. For each, provide a name and a detailed physical description suitable for consistent image generation. Focus on facial features, clothing, and unique identifiers.
    Script: ${fullScript}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          characters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING }
              },
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
    // Generate an image for each character
    const imgResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: `Character design sheet for: ${char.name}. Description: ${char.description}. High-quality 3D character design, white background, multiple angles.`,
      config: {
        imageConfig: { aspectRatio: '1:1', imageSize: '1K' }
      }
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

    results.push({
      id: Math.random().toString(36).substring(7),
      name: char.name,
      description: char.description,
      image: base64
    });
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
  isSpread: boolean = false
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = usePro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';

  const parts: any[] = [];

  if (originalImageBase64) {
    parts.push({
      inlineData: {
        data: originalImageBase64.split(',')[1],
        mimeType: 'image/png'
      }
    });
  }

  let instruction = `You are a master children's book illustrator. 
  TASK: ${originalImageBase64 ? "Completely restyle the scene from the first image." : "Generate a new illustration based on the text below."}
  ${isSpread ? "SCENE TYPE: This is a 2-page panorama spread. Ensure the composition works across a wide landscape format with the main focus not being cut by the center spine gutter." : "SCENE TYPE: Single page illustration."}
  
  STYLE INSTRUCTION:
  1. Base Style Prompt: ${stylePrompt}.
  ${styleRefBase64 ? "2. Visual Reference: Analyze the attached Style Reference image for color palette, brushwork, lighting, and texture. Replicate this EXACT visual feel." : ""}
  
  CHARACTER CONSISTENCY (CRITICAL):
  Use the provided character reference images ONLY for facial features and identity. 
  - DO NOT COPY the art style from character references; translate their features into the target style.
  ${assignments.map(a => {
    const ref = charRefs.find(r => r.id === a.refId);
    return `- Character "${a.description}" in scene -> Use facial features of reference "${ref?.name}". Description: ${ref?.description || ''}`;
  }).join('\n')}
  
  TEXT AND LAYOUT:
  ${cleanBackground ? 
    "REMOVE/EXCLUDE all text. If there's a background element (like a scroll or bubble) behind where text might be, keep it as a clean empty area." : 
    (targetText ? `DIGITALLY RENDER this text exactly in the image: "${targetText}". Use child-friendly, professional typography.` : "No text in image.")
  }`;

  if (styleRefBase64) {
    parts.push({
      inlineData: {
        data: styleRefBase64.split(',')[1],
        mimeType: 'image/png'
      }
    });
  }

  charRefs.forEach((ref) => {
    parts.push({
      inlineData: {
        data: ref.image.split(',')[1],
        mimeType: 'image/png'
      }
    });
  });

  parts.push({ text: instruction });

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: isSpread ? "16:9" : "1:1",
        imageSize: "1K"
      }
    }
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  }

  throw new Error("Generation failed.");
};

export const extractTextFromImage = async (imageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } },
        { text: "Extract story text from this page. Return ONLY the text." }
      ]
    },
  });
  return response.text?.trim() || "";
};