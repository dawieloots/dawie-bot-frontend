
import { GoogleGenAI, Type } from "@google/genai";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  /**
   * Generates a smart greeting or context-aware suggestion.
   */
  async generateInitialGreeting(agentName: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a short, professional, and friendly welcome message for a chat assistant named ${agentName} that connects users to an n8n workflow automation platform.`,
      config: {
        temperature: 0.7,
        maxOutputTokens: 100,
      }
    });
    return response.text || `Hello! I'm ${agentName}, your automation assistant. How can I help you with your n8n workflows today?`;
  }

  /**
   * Refines or summarizes a response if needed (optional utility).
   */
  async summarizeChat(history: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Summarize the following chat conversation into a short 5-word title: \n\n${history}`,
      config: {
        maxOutputTokens: 20,
      }
    });
    return response.text || "New Conversation";
  }
}

export const geminiService = new GeminiService();
