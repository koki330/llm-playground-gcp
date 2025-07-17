import { createOpenAI, OpenAIProvider } from '@ai-sdk/openai';

/**
 * Lazily creates and returns the OpenAI provider.
 * This prevents the API key from being required during the build process.
 */
export function getOpenAIProvider(): OpenAIProvider {
    return createOpenAI({
        apiKey: process.env.LLM_GCP_OPENAI_API_KEY,
    });
}