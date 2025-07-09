import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function streamAnthropic(modelId: string, prompt: string) {
  const stream = await anthropic.messages.stream({
    model: modelId,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  return stream;
}