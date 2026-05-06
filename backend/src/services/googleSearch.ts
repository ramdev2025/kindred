import { GoogleGenerativeAI } from '@google/generative-ai';

const gemini = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');

/**
 * Perform a Google Search using Gemini's built-in grounding tool.
 * This uses Gemini as the orchestrator: we send the query with googleSearch
 * tool enabled, and Gemini decides when to search and returns grounded results.
 */
export async function searchWithGemini(query: string): Promise<{
  answer: string;
  searchQueries?: string[];
  sources?: Array<{ title: string; url: string }>;
}> {
  const model = gemini.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    tools: [{ googleSearch: {} } as any],
  });

  const result = await model.generateContent(query);
  const response = result.response;

  // Extract grounding metadata if available
  const groundingMetadata = (response.candidates?.[0] as any)?.groundingMetadata;
  const sources: Array<{ title: string; url: string }> = [];

  if (groundingMetadata?.groundingChunks) {
    for (const chunk of groundingMetadata.groundingChunks) {
      if (chunk.web) {
        sources.push({ title: chunk.web.title || '', url: chunk.web.uri || '' });
      }
    }
  }

  return {
    answer: response.text(),
    searchQueries: groundingMetadata?.webSearchQueries || [],
    sources,
  };
}

/**
 * Determine if a message likely needs web search
 */
export function needsSearch(message: string): boolean {
  const lower = message.toLowerCase();
  const searchIndicators = [
    'search for',
    'look up',
    'find out',
    'what is the latest',
    'current',
    'recent',
    'news about',
    'how do i',
    'documentation for',
    'find information',
    'google',
    'web search',
  ];
  return searchIndicators.some((indicator) => lower.includes(indicator));
}
