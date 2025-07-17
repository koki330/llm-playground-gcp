import { createAnthropic, AnthropicProvider } from '@ai-sdk/anthropic';

/**
 * Lazily creates and returns the Anthropic provider.
 * This prevents the API key from being required during the build process.
 */
export function getAnthropicProvider(): AnthropicProvider {
    return createAnthropic({
        apiKey: process.env.LLM_GCP_ANTHROPIC_API_KEY,
    });
}