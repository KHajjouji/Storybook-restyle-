const fs = require('fs');
const content = fs.readFileSync('geminiService.ts', 'utf8');

const newContent = content.replace(
  /export const getBestAspectRatio/g,
  `export const generateContentWithRetry = async (ai: GoogleGenAI, params: any, retries: number = 2): Promise<GenerateContentResponse> => {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await ai.models.generateContent(params);
    } catch (e: any) {
      attempt++;
      console.warn(\`[Gemini API] Error on attempt \${attempt}:\`, e.message || e);
      if (attempt > retries) {
        throw e;
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error("Unreachable");
};

export const getBestAspectRatio`
).replace(/await ai\.models\.generateContent\(/g, `await generateContentWithRetry(ai, `);

fs.writeFileSync('geminiService.ts', newContent);
