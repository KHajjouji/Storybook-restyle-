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
    A typical book is 24-32 pages. Ensure a balanced flow.
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

export const identifyAndDesignCharacters = async (fullScript: string, stylePrompt: string, styleRef?: string): Promise<CharacterRef[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const identification = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Identify the main recurring characters in this script. For each, provide a name and a physical description.
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
    const parts: any[] = [
      { text: `Create a character design sheet for: ${char.name}. Description: ${char.description}. Style requirement: ${stylePrompt}. White background, 3D model sheet style but adhering to the artistic rendering described. Ensure consistent facial features.` }
    ];

    if (styleRef) {
      parts.push({
        inlineData: {
          data: styleRef.split(',')[1],
          mimeType: 'image/png'
        }
      });
      parts[0].text += " Adhere strictly to the art style shown in the reference image.";
    }

    const imgResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts },
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

  let instruction = `You are a master industrial children's book illustrator. 
  TASK: ${originalImageBase64 ? "RESTYLE the existing scene image." : "GENERATE a new illustration based on the script text."}
  FORMAT: ${isSpread ? "Wide 2-page panorama spread. Ensure important action is NOT in the middle where the book spine/gutter will be." : "Single page illustration."}
  
  ARTISTIC STYLE (CRITICAL):
  ${stylePrompt}
  ${styleRefBase64 ? "EXACT AESTHETIC MATCH: Use the attached Style Reference image for lighting, color values, brushstrokes, and overall mood." : ""}
  
  CHARACTERS:
  Use the provided character sheets for IDENTITY ONLY (features, hair, clothes).
  ${assignments.map(a => {
    const ref = charRefs.find(r => r.id === a.refId);
    return `- Character "${a.description || 'Main Character'}" -> Use facial features of reference "${ref?.name}".`;
  }).join('\n')}
  
  TEXT:
  ${cleanBackground ? 
    "No text." : 
    (targetText ? `Overlay this exact text: "${targetText}". Professional typesetting.` : "No text.")
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

  throw new Error("Industrial render failed.");
};

export const extractTextFromImage = async (imageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } },
        { text: "Return only the text found in this book page." }
      ]
    },
  });
  return response.text?.trim() || "";
};