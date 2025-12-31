
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { CharacterRef, CharacterAssignment } from "./types";

export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  if (targetLanguage === 'NONE_CLEAN_BG') return "";
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Translate this children's book text into ${targetLanguage}. 
    Maintain a whimsical, rhythmic, and professional tone.
    Text: "${text}"`,
  });
  return response.text?.trim() || text;
};

export const restyleIllustration = async (
  originalImageBase64: string,
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

  const parts: any[] = [
    {
      inlineData: {
        data: originalImageBase64.split(',')[1],
        mimeType: 'image/png'
      }
    }
  ];

  let instruction = `You are a master children's book illustrator. 
  TASK: Completely restyle the scene from the first image.
  ${isSpread ? "SCENE TYPE: This is a 2-page panorama spread. Ensure the composition works across a wide landscape format with the main focus not being cut by the center spine gutter." : "SCENE TYPE: Single page illustration."}
  
  STYLE INSTRUCTION:
  1. Base Style Prompt: ${stylePrompt}.
  ${styleRefBase64 ? "2. Visual Reference: Analyze the attached Style Reference image for color palette, brushwork, lighting, and texture. Replicate this EXACT visual feel in the new illustration." : ""}
  
  CHARACTER CONSISTENCY (CRITICAL):
  Use the provided character reference pool ONLY for facial features and identity. 
  - DO NOT COPY the art style from character references; translate their features into the target style.
  ${assignments.map(a => {
    const ref = charRefs.find(r => r.id === a.refId);
    return `- Character "${a.description}" in scene -> Use facial features of reference "${ref?.name}".`;
  }).join('\n')}
  
  TEXT AND LAYOUT:
  ${cleanBackground ? 
    "REMOVE all existing text. If there's a background element (like a scroll or bubble) behind the text, keep it as a clean empty area." : 
    (targetText ? `DIGITALLY RENDER text: "${targetText}". Ensure perfect spelling and child-friendly typography.` : "No text.")
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
