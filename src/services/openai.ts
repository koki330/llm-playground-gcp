import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class OpenAIService {
  async getStreamingResponse(messages: any[], modelId: string, systemPrompt: string) {
    // Map messages to the format OpenAI expects, converting our internal 'model' role to 'assistant'
    let formattedMessages = messages.map(({ role, content }) => ({
      role: role === 'model' ? 'assistant' : role,
      content,
    }));

    // Add system prompt if it exists
    if (systemPrompt) {
      formattedMessages = [{ role: 'system', content: systemPrompt }, ...formattedMessages];
    }

    const stream = await openai.chat.completions.create({
      model: modelId,
      messages: formattedMessages as any, // Cast because the SDK type is strict
      stream: true,
    });

    return stream;
  }
}

export const openAIService = new OpenAIService();
