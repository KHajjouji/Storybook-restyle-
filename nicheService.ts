import { GoogleGenAI } from "@google/genai";

export const searchBookNiches = async (topic: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `Act as a market research expert for self-publishing (similar to tools like Book Beam). 
    Analyze the current market demand, competition, and profitability for books related to: "${topic}".
    Use Google Search to find real-time data, trends, and popular sub-niches.
    Provide a detailed report with:
    - Specific sub-niches and their target audience.
    - Estimated search volume trends and demand.
    - Competition levels (Low/Medium/High).
    - Potential profitability and monetization strategies.
    - Examples of successful book concepts in these niches.
    Format the output in clean Markdown with clear headings and bullet points.`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });
  return response.text || "No data found.";
};
