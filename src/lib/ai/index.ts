import { SUPPORTED_MODELS } from './models';
import { streamGemini } from './gemini';
import { streamAnthropic } from './anthropic';
import { streamOpenAI } from './openai';

/**
 * The main factory function to get an AI stream based on the model ID.
 * @param modelId The ID of the model to use (e.g., 'gpt-4o').
 * @param prompt The user's prompt.
 * @returns The appropriate AI stream.
 */
export function getAiStream(modelId: string, prompt: string) {
  const model = SUPPORTED_MODELS.find((m) => m.id === modelId);

  if (!model) {
    throw new Error(`Unsupported model: ${modelId}`);
  }

  switch (model.provider) {
    case 'gemini':
      return streamGemini(model.id, prompt);
    case 'anthropic':
      return streamAnthropic(model.id, prompt);
    case 'openai':
      return streamOpenAI(model.id, prompt);
    default:
      // This case should be unreachable if models.ts is correct
      throw new Error(`Unknown provider for model: ${modelId}`);
  }
}
