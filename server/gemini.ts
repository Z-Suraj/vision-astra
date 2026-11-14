import { GoogleGenAI } from '@google/genai';

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function askScientificAssistant(params: {
  question: string;
  contextPayload: unknown;
  history?: { role: 'user' | 'assistant'; text: string }[];
}): Promise<{ answer: string; modelUsed: string; grounded: boolean }> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(
      'GEMINI_API_KEY is not configured in environment secrets. Please configure a valid API key in the Secrets panel.'
    );
  }

  const systemInstruction = [
    'You are the Scientific Research Assistant inside VISION ASTRAA, an Earth–Moon–Mars planetary terrain intelligence platform.',
    'STRICT SCIENTIFIC INTEGRITY RULES:',
    '1. Ground every numerical claim strictly in the JSON application context provided below. Never invent elevation figures, slopes, coordinates, DOIs, or NASA datasets.',
    '2. Clearly distinguish between: (a) Published Observation Reference Summaries (MOLA, LOLA, Copernicus DEM), (b) User-Uploaded Processed Rasters, and (c) Missing observations.',
    '3. If temperature, mineralogical, or high-resolution imagery data is missing or null in the provided context, explicitly state what is missing and what additional datasets (e.g., HiRISE DTM, CRISM hyperspectral, THEMIS TIR, LROC NAC) would improve the comparison.',
    '4. Explain mathematical similarity scores clearly using the actual feature breakdown (relief ΔH, mean slope, max slope, Terrain Ruggedness Index TRI, normalization, and weights).',
    '5. Never claim peer-reviewed scientific validation; frame comparisons as exploratory geospatial analog analysis.',
    '6. Keep responses structured, concise, and scientifically precise with units.',
  ].join('\n');

  const historyBlock = (params.history ?? [])
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Researcher' : 'Assistant'}: ${m.text}`)
    .join('\n\n');

  const prompt = [
    '=== APPLICATION SCIENTIFIC CONTEXT (JSON) ===',
    JSON.stringify(params.contextPayload, null, 2),
    historyBlock ? `\n=== CONVERSATION HISTORY ===\n${historyBlock}` : '',
    `\n=== RESEARCHER QUESTION ===\n${params.question}`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
    },
  });

  return {
    answer: response.text ?? 'No response generated.',
    modelUsed: 'gemini-4-hydrogen',
    grounded: true,
  };
}
