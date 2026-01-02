
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

export const planStoryScenes = async (fullScript: string, characters: CharacterRef[]): Promise<{pages: {text: string, isSpread: boolean, mappedCharacterNames: string[]}[]}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const charList = characters.map(c => c.name).join(", ");
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Break this children's book script into distinct pages or panoramic spreads. 
    A typical book is 24-32 pages.
    For each scene, analyze the text and determine which of the characters from this list are present: [${charList}].
    If no characters are present (e.g., a wide forest view or generic background people), leave the mappedCharacterNames array empty.
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
                isSpread: { type: Type.BOOLEAN },
                mappedCharacterNames: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "List of character names from the provided pool who are present in this specific scene."
                }
              },
              required: ['text', 'isSpread', 'mappedCharacterNames']
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
      { text: `Create a professional character design sheet for: ${char.name}. Description: ${char.description}. Style requirement: ${stylePrompt}. High-quality 3D/Digital/Watercolor (matching style) model sheet, white background, multiple angles. Ensure facial features are distinct and will be replicable.` }
    ];

    if (styleRef) {
      parts.push({
        inlineData: {
          data: styleRef.split(',')[1],
          mimeType: 'image/png'
        }
      });
      parts[0].text += " Adhere strictly to the aesthetic, colors, and brushwork of the attached style reference image.";
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
  TASK: ${originalImageBase64 ? "RESTYLE the existing scene image while keeping the composition similar but upgrading to the target aesthetic." : "GENERATE a brand new illustration based on the text script below."}
  SCENE LAYOUT: ${isSpread ? "2-page panoramic spread. Ensure the focal points are on the left and right thirds, avoiding the exact center gutter." : "Single page illustration."}
  
  ARTISTIC STYLE (CRITICAL):
  ${stylePrompt}
  ${styleRefBase64 ? "VISUAL ANCHOR: Use the attached Style Reference for lighting, brushwork, and palette. The output MUST look like it was created by the same artist." : ""}
  
  CHARACTERS AND IDENTITY:
  ${assignments.length > 0 ? 
    `The following characters are present in this scene. Use the attached character sheets for their FACIAL FEATURES and COSTUMES only:
    ${assignments.map(a => {
      const ref = charRefs.find(r => r.id === a.refId);
      return `- Character "${ref?.name}" playing the role of "${a.description}".`;
    }).join('\n')}` : 
    "This is a landscape-only scene or a scene with generic background people. DO NOT include the main character models unless they fit naturally."
  }
  
  TEXT RENDERING:
  ${cleanBackground ? 
    "REMOVE all text. Keep backgrounds clean." : 
    (targetText ? `Incorporate this exact text into the layout: "${targetText}". Use elegant, child-friendly typography.` : "No text.")
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
    if (assignments.some(a => a.refId === ref.id)) {
      parts.push({
        inlineData: {
          data: ref.image.split(',')[1],
          mimeType: 'image/png'
        }
      });
    }
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

export const upscaleIllustration = async (
  currentImageBase64: string,
  stylePrompt: string,
  isSpread: boolean = false
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-image-preview';

  const parts: any[] = [
    {
      inlineData: {
        data: currentImageBase64.split(',')[1],
        mimeType: 'image/png'
      }
    },
    {
      text: `UP SCALE AND ENHANCE: Professional 4K upscale of this children's book illustration. 
      Retain exactly the same composition, characters, and style. 
      Sharpen textures, enhance fine lines, and refine lighting details. 
      Aesthetic context: ${stylePrompt}. 
      Target: High-resolution, crisp master print quality.`
    }
  ];

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: isSpread ? "16:9" : "1:1",
        imageSize: "4K"
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

  throw new Error("4K Upscale failed.");
};

export const extractTextFromImage = async (imageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } },
        { text: "Extract the narrative text from this book page. Return only the text." }
      ]
    },
  });
  return response.text?.trim() || "";
};
