import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

class AnthropicService {
  async getStreamingResponse(messages: any[], modelId: string, systemPrompt: string) {
    // Anthropic handles the system prompt as a separate top-level parameter.
    const formattedMessages = messages.map(({ role, content }) => ({
      role: role === 'model' ? 'assistant' : role,
      content
    }));

    const stream = await anthropic.messages.create({
      model: modelId,
      system: systemPrompt, // Pass the system prompt here
      messages: formattedMessages as any, // Cast because the SDK type is strict
      max_tokens: 4096, // It's good practice to set a max_tokens limit
      stream: true,
    });

    return stream;
  }
}

export const anthropicService = new AnthropicService();
