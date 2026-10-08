import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeHandGesture = async (imageBase64: string): Promise<string> => {
  try {
    // Remove data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          },
          {
            text: "Analyze this hand gesture. What does it signify? If it's a specific sign language letter or common gesture (like thumbs up, peace sign), identify it. Keep the response brief, under 50 words, and fun."
          }
        ]
      }
    });

    return response.text || "Could not analyze gesture.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Error connecting to Gemini. Please check API key.";
  }
};