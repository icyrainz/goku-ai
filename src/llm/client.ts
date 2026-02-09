import OpenAI from 'openai';
import type { Config } from '../config.js';

let _client: OpenAI | null = null;

export function getLlmClient(config: Config): OpenAI {
  if (_client) return _client;
  _client = new OpenAI({
    baseURL: config.llm.baseUrl,
    apiKey: config.llm.apiKey || 'not-needed',
  });
  return _client;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chatCompletion(
  config: Config,
  messages: ChatMessage[],
  model?: string
): Promise<string> {
  const client = getLlmClient(config);
  const useModel = model || config.llm.model;

  try {
    const response = await client.chat.completions.create({
      model: useModel,
      messages,
      temperature: 0.1,  // Low temperature for consistent structured output
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from LLM');
    return content;
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        throw new Error(
          `Cannot connect to LLM at ${config.llm.baseUrl}. Is Ollama running?\n` +
          `Start it with: ollama serve`
        );
      }
    }
    throw error;
  }
}